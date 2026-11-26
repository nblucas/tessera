// Builds the read tables from ledger events. Each page of events is applied in one
// transaction together with the cursor, so every event is applied exactly once.
import { expenseStatus, isHandoverApproved, type LedgerRecord } from '@tessera/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Address } from 'viem'
import type { Db, Tx } from '../db/client'
import {
  appliedEvents,
  oracleChanges,
  paymentReports,
  batches,
  boardTerms,
  expenses,
  handovers,
  indexerCursor,
  tickets,
} from '../db/schema'
import type { Ledger, LedgerEvent } from '../ledger/types'
import { currentTerm } from '../queries/board'

const CURSOR_NAME = 'main'
const PAGE_SIZE = 200
const INDEXER_LOCK = 7_461_002

export class Indexer {
  private readonly db: Db
  private readonly ledger: Pick<Ledger, 'readEvents'>

  constructor(db: Db, ledger: Pick<Ledger, 'readEvents'>) {
    this.db = db
    this.ledger = ledger
  }

  // Applies every event not applied yet. Returns how many were applied.
  async catchUp(): Promise<number> {
    let applied = 0
    for (;;) {
      const count = await this.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${INDEXER_LOCK})`)
        const cursor = await readCursor(tx)
        const { events, next } = await this.ledger.readEvents(cursor, PAGE_SIZE)
        for (const event of events) await applyEvent(tx, event)
        if (events.length > 0) await writeCursor(tx, next)
        return events.length
      })
      applied += count
      if (count < PAGE_SIZE) return applied
    }
  }

  // Drops every read table and rebuilds it from the ledger.
  async reindex(): Promise<number> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${INDEXER_LOCK})`)
      await tx.execute(
        sql`TRUNCATE read.board_terms, read.handovers, read.batches, read.tickets, read.expenses, read.indexer_cursor, read.applied_events, read.payment_reports, read.oracle_changes`,
      )
    })
    return this.catchUp()
  }
}

async function readCursor(tx: Tx): Promise<string | null> {
  const [row] = await tx.select().from(indexerCursor).where(eq(indexerCursor.name, CURSOR_NAME))
  return row?.cursor ?? null
}

async function writeCursor(tx: Tx, cursor: string | null) {
  await tx
    .insert(indexerCursor)
    .values({ name: CURSOR_NAME, cursor })
    .onConflictDoUpdate({ target: indexerCursor.name, set: { cursor } })
}

async function applyEvent(tx: Tx, event: LedgerEvent) {
  // An event delivered a second time (for example after a chain reorg) is applied once.
  const [fresh] = await tx
    .insert(appliedEvents)
    .values({ hash: event.hash })
    .onConflictDoNothing()
    .returning()
  if (!fresh) return

  const { association, record } = event
  const at = new Date(event.recordedAt)

  switch (record.kind) {
    case 'BoardSet':
      await tx.insert(boardTerms).values({ association, term: 1, members: record.members, startedAt: at })
      return

    case 'BatchCreated':
    case 'BatchUpdated': {
      const values = {
        priceCents: record.priceCents,
        quantity: record.quantity,
        resaleCapPercent: record.resaleCapPercent,
        removed: false,
      }
      await tx
        .insert(batches)
        .values({ association, eventId: record.eventId, batchId: record.batchId, createdAt: at, ...values })
        .onConflictDoUpdate({
          target: [batches.association, batches.eventId, batches.batchId],
          set: values,
        })
      return
    }

    case 'BatchRemoved':
      await tx
        .update(batches)
        .set({ removed: true })
        .where(batchWhere(association, record.eventId, record.batchId))
      return

    case 'OpeningSalesRecorded':
      await tx
        .update(batches)
        .set({
          sold: sql`${batches.sold} + ${record.count}`,
          openingSold: sql`${batches.openingSold} + ${record.count}`,
          openingAmountCents: sql`${batches.openingAmountCents} + ${record.amountCents}`,
        })
        .where(batchWhere(association, record.eventId, record.batchId))
      return

    case 'TicketIssued':
      await tx.insert(tickets).values({
        ticketId: record.ticketId,
        association,
        eventId: record.eventId,
        batchId: record.batchId,
        owner: record.owner,
        priceCents: record.priceCents,
        orderRef: record.orderRef,
        issuedAt: at,
        paymentRef: record.paymentRef,
      })
      await tx
        .update(batches)
        .set({ sold: sql`${batches.sold} + 1` })
        .where(batchWhere(association, record.eventId, record.batchId))
      await report(tx, association, record.actor, at, {
        paymentRef: record.paymentRef,
        kind: 'TicketIssued',
        amountCents: record.priceCents,
        ticketId: record.ticketId,
        orderRef: record.orderRef,
      })
      return

    case 'PaymentRefunded':
      await report(tx, association, record.actor, at, {
        paymentRef: record.paymentRef,
        kind: 'PaymentRefunded',
        amountCents: record.amountCents,
        orderRef: record.orderRef,
        reason: record.reason,
      })
      return

    case 'PaymentReversed': {
      const [ticket] = await tx.select().from(tickets).where(ticketWhere(association, record.ticketId))
      // Mirrors the shared rule: a resold ticket stays with its buyer; otherwise it is revoked
      // and its place goes back on sale.
      if (ticket.status !== 'resold') {
        await tx
          .update(tickets)
          .set({ status: 'revoked', listingPriceCents: null, revokedAt: at })
          .where(ticketWhere(association, record.ticketId))
        await tx
          .update(batches)
          .set({ sold: sql`${batches.sold} - 1` })
          .where(batchWhere(association, ticket.eventId, ticket.batchId))
      }
      await report(tx, association, record.actor, at, {
        paymentRef: record.paymentRef,
        kind: 'PaymentReversed',
        amountCents: record.amountCents,
        ticketId: record.ticketId,
      })
      return
    }

    case 'TicketListed':
      await tx
        .update(tickets)
        .set({ status: 'listed', listingPriceCents: record.priceCents })
        .where(ticketWhere(association, record.ticketId))
      return

    case 'ListingCancelled':
      await tx
        .update(tickets)
        .set({ status: 'valid', listingPriceCents: null })
        .where(ticketWhere(association, record.ticketId))
      return

    case 'ResaleSettled': {
      const [listed] = await tx
        .update(tickets)
        .set({ status: 'resold', listingPriceCents: null })
        .where(ticketWhere(association, record.listedTicketId))
        .returning()
      await tx.insert(tickets).values({
        ticketId: record.ticketId,
        association,
        eventId: listed.eventId,
        batchId: listed.batchId,
        owner: record.owner,
        priceCents: record.priceCents,
        orderRef: record.orderRef,
        issuedAt: at,
        kind: 'resale',
        paymentRef: record.paymentRef,
        resoldFrom: record.listedTicketId,
        royaltyCents: record.royaltyCents,
      })
      await report(tx, association, record.actor, at, {
        paymentRef: record.paymentRef,
        kind: 'ResaleSettled',
        amountCents: record.priceCents,
        ticketId: record.ticketId,
        orderRef: record.orderRef,
      })
      return
    }

    case 'OracleChangeProposed':
      await tx.insert(oracleChanges).values({
        association,
        proposalId: record.proposalId,
        proposer: record.actor,
        newOracle: record.newOracle,
        approvals: [record.actor],
        status: 'open',
        proposedAt: at,
      })
      await completeOracleChangeIfMajority(tx, association, record.proposalId, at)
      return

    case 'OracleChangeApproved': {
      const [row] = await tx
        .select()
        .from(oracleChanges)
        .where(oracleChangeWhere(association, record.proposalId))
      await tx
        .update(oracleChanges)
        .set({ approvals: [...row.approvals, record.actor] })
        .where(oracleChangeWhere(association, record.proposalId))
      await completeOracleChangeIfMajority(tx, association, record.proposalId, at)
      return
    }

    case 'OracleChangeCancelled':
      await tx
        .update(oracleChanges)
        .set({ status: 'cancelled', closedAt: at })
        .where(oracleChangeWhere(association, record.proposalId))
      return

    case 'ExpenseProposed': {
      const members = await currentMembers(tx, association)
      const approvals = [record.actor]
      const status = expenseStatus(approvals, [], members)
      await tx.insert(expenses).values({
        expenseId: record.expenseId,
        association,
        proposer: record.actor,
        amountCents: record.amountCents,
        category: record.category,
        eventId: record.eventId || null,
        receiptSha256: record.receiptSha256,
        approvals,
        rejections: [],
        status,
        proposedAt: at,
        decidedAt: status === 'pending' ? null : at,
      })
      return
    }

    case 'ExpenseVoted': {
      const [row] = await tx.select().from(expenses).where(expenseWhere(association, record.expenseId))
      const approvals = record.approve ? [...row.approvals, record.actor] : row.approvals
      const rejections = record.approve ? row.rejections : [...row.rejections, record.actor]
      const status = expenseStatus(approvals, rejections, await currentMembers(tx, association))
      await tx
        .update(expenses)
        .set({ approvals, rejections, status, decidedAt: status === 'pending' ? null : at })
        .where(expenseWhere(association, record.expenseId))
      return
    }

    case 'HandoverProposed':
      await tx.insert(handovers).values({
        association,
        handoverId: record.handoverId,
        proposer: record.actor,
        members: record.members,
        approvals: [record.actor],
        status: 'open',
        proposedAt: at,
      })
      await completeHandoverIfMajority(tx, association, record.handoverId, at)
      return

    case 'HandoverApproved': {
      const [row] = await tx
        .select()
        .from(handovers)
        .where(handoverWhere(association, record.handoverId))
      await tx
        .update(handovers)
        .set({ approvals: [...row.approvals, record.actor] })
        .where(handoverWhere(association, record.handoverId))
      await completeHandoverIfMajority(tx, association, record.handoverId, at)
      return
    }

    case 'HandoverCancelled':
      await tx
        .update(handovers)
        .set({ status: 'cancelled', closedAt: at })
        .where(handoverWhere(association, record.handoverId))
      return

    default:
      assertNever(record)
  }
}

function batchWhere(association: string, eventId: string, batchId: string) {
  return and(
    eq(batches.association, association),
    eq(batches.eventId, eventId),
    eq(batches.batchId, batchId),
  )
}

function ticketWhere(association: string, ticketId: string) {
  return and(eq(tickets.association, association), eq(tickets.ticketId, ticketId))
}

function oracleChangeWhere(association: string, proposalId: string) {
  return and(eq(oracleChanges.association, association), eq(oracleChanges.proposalId, proposalId))
}

async function report(
  tx: Tx,
  association: string,
  oracle: Address,
  at: Date,
  values: Omit<typeof paymentReports.$inferInsert, 'association' | 'oracle' | 'reportedAt'>,
) {
  await tx.insert(paymentReports).values({ association, oracle, reportedAt: at, ...values })
}

async function completeOracleChangeIfMajority(
  tx: Tx,
  association: string,
  proposalId: string,
  at: Date,
) {
  const [change] = await tx.select().from(oracleChanges).where(oracleChangeWhere(association, proposalId))
  const term = await currentTerm(tx, association)
  if (!term || !isHandoverApproved(change.approvals, term.members)) return
  await tx
    .update(oracleChanges)
    .set({ status: 'approved', closedAt: at })
    .where(oracleChangeWhere(association, proposalId))
}

function expenseWhere(association: string, expenseId: string) {
  return and(eq(expenses.association, association), eq(expenses.expenseId, expenseId))
}

function handoverWhere(association: string, handoverId: string) {
  return and(eq(handovers.association, association), eq(handovers.handoverId, handoverId))
}

async function currentMembers(tx: Tx, association: string): Promise<Address[]> {
  return (await currentTerm(tx, association))?.members ?? []
}

// Applies the shared rule (isHandoverApproved, expenseStatus) to the read tables: the new
// board takes office and every pending expense is recounted with its votes only.
async function completeHandoverIfMajority(
  tx: Tx,
  association: string,
  handoverId: string,
  at: Date,
) {
  const [handover] = await tx.select().from(handovers).where(handoverWhere(association, handoverId))
  const term = await currentTerm(tx, association)
  if (!term || !isHandoverApproved(handover.approvals, term.members)) return

  await tx
    .update(boardTerms)
    .set({ endedAt: at })
    .where(and(eq(boardTerms.association, association), eq(boardTerms.term, term.term)))
  await tx.insert(boardTerms).values({
    association,
    term: term.term + 1,
    members: handover.members,
    startedAt: at,
  })
  await tx
    .update(handovers)
    .set({ status: 'approved', closedAt: at })
    .where(handoverWhere(association, handoverId))

  const pending = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.association, association), eq(expenses.status, 'pending')))
  for (const expense of pending) {
    const status = expenseStatus(expense.approvals, expense.rejections, handover.members)
    if (status !== 'pending') {
      await tx
        .update(expenses)
        .set({ status, decidedAt: at })
        .where(expenseWhere(association, expense.expenseId))
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled ledger record: ${JSON.stringify(value as LedgerRecord)}`)
}
