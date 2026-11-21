// Builds the read tables from ledger events. Each page of events is applied in one
// transaction together with the cursor, so every event is applied exactly once.
import { expenseStatus, isHandoverApproved, type LedgerRecord } from '@tessera/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Address } from 'viem'
import type { Db, Tx } from '../db/client'
import {
  appliedEvents,
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
        sql`TRUNCATE read.board_terms, read.handovers, read.batches, read.tickets, read.expenses, read.indexer_cursor, read.applied_events`,
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
      const values = { priceCents: record.priceCents, quantity: record.quantity, removed: false }
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
      })
      await tx
        .update(batches)
        .set({ sold: sql`${batches.sold} + 1` })
        .where(batchWhere(association, record.eventId, record.batchId))
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
