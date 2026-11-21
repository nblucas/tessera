import type { LedgerRecord } from '@tessera/shared'
import { asc, eq, sql } from 'drizzle-orm'
import type { Address } from 'viem'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { batches, boardTerms, expenses, handovers, tickets } from '../src/db/schema'
import { Indexer } from '../src/indexer/indexer'
import { createTestDb } from './db'
import { MemoryEventSource } from './memoryLedger'

const ASSOCIATION = 'test-association'
const A: Address = '0x00000000000000000000000000000000000000A1'
const B: Address = '0x00000000000000000000000000000000000000B2'
const C: Address = '0x00000000000000000000000000000000000000C3'
const D: Address = '0x00000000000000000000000000000000000000D4'
const E: Address = '0x00000000000000000000000000000000000000E5'
const STUDENT: Address = '0x00000000000000000000000000000000000000F6'
const ORACLE: Address = '0x0000000000000000000000000000000000000099'

const testDb = await createTestDb()
afterAll(() => testDb.drop())

let source: MemoryEventSource
let indexer: Indexer

beforeEach(async () => {
  await testDb.db.execute(
    sql`TRUNCATE read.board_terms, read.handovers, read.batches, read.tickets, read.expenses, read.indexer_cursor`,
  )
  source = new MemoryEventSource()
  indexer = new Indexer(testDb.db, source)
  source.append(
    ASSOCIATION,
    { kind: 'BoardSet', actor: null, members: [A, B, C] },
    { kind: 'BatchCreated', actor: null, eventId: 'party', batchId: 'b1', priceCents: 5500, quantity: 300 },
  )
})

const ticket = (ticketId: string): LedgerRecord => ({
  kind: 'TicketIssued',
  actor: ORACLE,
  ticketId,
  eventId: 'party',
  batchId: 'b1',
  owner: STUDENT,
  priceCents: 5500,
  orderRef: `order-${ticketId}`,
})

const expense = (actor: Address, expenseId = 'x1'): LedgerRecord => ({
  kind: 'ExpenseProposed',
  actor,
  expenseId,
  amountCents: 120000,
  category: 'Suppliers',
  eventId: 'party',
  receiptSha256: 'a'.repeat(64),
})

const vote = (actor: Address, approve: boolean, expenseId = 'x1'): LedgerRecord => ({
  kind: 'ExpenseVoted',
  actor,
  expenseId,
  approve,
})

async function expenseRow(expenseId = 'x1') {
  const [row] = await testDb.db.select().from(expenses).where(eq(expenses.expenseId, expenseId))
  return row
}

async function batchRow() {
  const [row] = await testDb.db.select().from(batches).where(eq(batches.batchId, 'b1'))
  return row
}

async function snapshot() {
  const db = testDb.db
  return {
    terms: await db.select().from(boardTerms).orderBy(asc(boardTerms.term)),
    handovers: await db.select().from(handovers).orderBy(asc(handovers.handoverId)),
    batches: await db.select().from(batches).orderBy(asc(batches.batchId)),
    tickets: await db.select().from(tickets).orderBy(asc(tickets.ticketId)),
    expenses: await db.select().from(expenses).orderBy(asc(expenses.expenseId)),
  }
}

describe('indexer', () => {
  it('builds the current board from the genesis record', async () => {
    await indexer.catchUp()

    const terms = await testDb.db.select().from(boardTerms)
    expect(terms).toEqual([
      expect.objectContaining({ association: ASSOCIATION, term: 1, members: [A, B, C], endedAt: null }),
    ])
  })

  it('counts opening sales and issued tickets per batch', async () => {
    source.append(
      ASSOCIATION,
      { kind: 'OpeningSalesRecorded', actor: null, eventId: 'party', batchId: 'b1', count: 214, amountCents: 1177000 },
      ticket('t1'),
      ticket('t2'),
    )
    await indexer.catchUp()

    expect(await batchRow()).toMatchObject({ sold: 216, openingSold: 214, openingAmountCents: 1177000 })
    const owned = await testDb.db.select().from(tickets).where(eq(tickets.owner, STUDENT))
    expect(owned.map((row) => row.ticketId).sort()).toEqual(['t1', 't2'])
  })

  it('applies batch updates and removals', async () => {
    source.append(ASSOCIATION, {
      kind: 'BatchUpdated',
      actor: A,
      eventId: 'party',
      batchId: 'b1',
      priceCents: 6000,
      quantity: 250,
    })
    await indexer.catchUp()
    expect(await batchRow()).toMatchObject({ priceCents: 6000, quantity: 250, removed: false })

    source.append(ASSOCIATION, { kind: 'BatchRemoved', actor: A, eventId: 'party', batchId: 'b1' })
    await indexer.catchUp()
    expect(await batchRow()).toMatchObject({ removed: true })
  })

  it('tracks expense votes until a majority decides', async () => {
    source.append(ASSOCIATION, expense(A))
    await indexer.catchUp()
    expect(await expenseRow()).toMatchObject({ status: 'pending', approvals: [A], decidedAt: null })

    source.append(ASSOCIATION, vote(B, true))
    await indexer.catchUp()
    const row = await expenseRow()
    expect(row).toMatchObject({ status: 'approved', approvals: [A, B], rejections: [] })
    expect(row.decidedAt).not.toBeNull()
  })

  it('starts a new term once a majority approves a handover', async () => {
    source.append(ASSOCIATION, { kind: 'HandoverProposed', actor: A, handoverId: 'h1', members: [D, E] })
    await indexer.catchUp()
    const [open] = await testDb.db.select().from(handovers)
    expect(open).toMatchObject({ status: 'open', approvals: [A], members: [D, E] })

    source.append(ASSOCIATION, { kind: 'HandoverApproved', actor: B, handoverId: 'h1' })
    await indexer.catchUp()

    const terms = await testDb.db.select().from(boardTerms).orderBy(asc(boardTerms.term))
    expect(terms.map((term) => [term.term, term.members, term.endedAt !== null])).toEqual([
      [1, [A, B, C], true],
      [2, [D, E], false],
    ])
    const [closed] = await testDb.db.select().from(handovers)
    expect(closed).toMatchObject({ status: 'approved', approvals: [A, B] })
  })

  it('marks a cancelled handover', async () => {
    source.append(
      ASSOCIATION,
      { kind: 'HandoverProposed', actor: A, handoverId: 'h1', members: [D, E] },
      { kind: 'HandoverCancelled', actor: A, handoverId: 'h1' },
    )
    await indexer.catchUp()

    const [row] = await testDb.db.select().from(handovers)
    expect(row.status).toBe('cancelled')
  })

  it('recounts pending expenses with the new board after a handover', async () => {
    source.append(
      ASSOCIATION,
      expense(A),
      { kind: 'HandoverProposed', actor: B, handoverId: 'h1', members: [A] },
      { kind: 'HandoverApproved', actor: C, handoverId: 'h1' },
    )
    await indexer.catchUp()

    expect(await expenseRow()).toMatchObject({ status: 'approved' })
  })

  it('applies each event once, however often it catches up', async () => {
    source.append(ASSOCIATION, ticket('t1'), expense(A), vote(B, true))
    await indexer.catchUp()
    const first = await snapshot()

    expect(await indexer.catchUp()).toBe(0)
    expect(await snapshot()).toEqual(first)
    expect(await batchRow()).toMatchObject({ sold: 1 })
  })

  it('rebuilds the same read tables from scratch', async () => {
    source.append(
      ASSOCIATION,
      { kind: 'OpeningSalesRecorded', actor: null, eventId: 'party', batchId: 'b1', count: 10, amountCents: 55000 },
      ticket('t1'),
      expense(A),
      vote(B, false),
      expense(A, 'x2'),
      { kind: 'HandoverProposed', actor: A, handoverId: 'h1', members: [A, D] },
      { kind: 'HandoverApproved', actor: C, handoverId: 'h1' },
      vote(D, true, 'x2'),
    )
    await indexer.catchUp()
    const before = await snapshot()

    await indexer.reindex()

    expect(await snapshot()).toEqual(before)
  })
})
