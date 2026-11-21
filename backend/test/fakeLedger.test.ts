import { sql } from 'drizzle-orm'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeLedger } from '../src/ledger/fakeLedger'
import { LedgerRejection } from '../src/ledger/types'
import { createTestDb } from './db'
import { signAction, TEST_DOMAIN } from './sign'

const ASSOCIATION = 'test-association'
const director = privateKeyToAccount(generatePrivateKey())
const otherDirector = privateKeyToAccount(generatePrivateKey())
const student = privateKeyToAccount(generatePrivateKey())
const oracle = privateKeyToAccount(generatePrivateKey())
const relayer = privateKeyToAccount(generatePrivateKey())

const testDb = await createTestDb()
afterAll(() => testDb.drop())

let ledger: FakeLedger

beforeEach(async () => {
  await testDb.db.execute(sql`TRUNCATE ledger.entries RESTART IDENTITY`)
  ledger = new FakeLedger(testDb.db, {
    domain: TEST_DOMAIN,
    oracle: oracle.address,
    relayer: relayer.address,
  })
  await ledger.writeGenesis(ASSOCIATION, [
    { kind: 'BoardSet', actor: null, members: [director.address, otherDirector.address] },
    {
      kind: 'BatchCreated',
      actor: null,
      eventId: 'party',
      batchId: 'b1',
      priceCents: 5500,
      quantity: 10,
    },
  ])
})

async function proposeExpense(nonce: number, expenseId = 'x1', account = director) {
  return signAction(
    account,
    'ExpenseProposed',
    {
      expenseId,
      amountCents: 120000,
      category: 'Suppliers',
      eventId: 'party',
      receiptSha256: 'a'.repeat(64),
    },
    { nonce },
  )
}

async function rejection(promise: Promise<unknown>): Promise<LedgerRejection> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(LedgerRejection)
  return error as LedgerRejection
}

describe('fake ledger', () => {
  it('records a signed action and returns it as an event', async () => {
    await ledger.submit(await proposeExpense(0))

    const { events } = await ledger.readEvents(null, 100)
    expect(events.map((event) => event.record.kind)).toEqual([
      'BoardSet',
      'BatchCreated',
      'ExpenseProposed',
    ])
    expect(events[2].record).toMatchObject({
      actor: director.address,
      expenseId: 'x1',
      amountCents: 120000,
    })
    expect(events[2].association).toBe(ASSOCIATION)
  })

  it('records which relayer submitted each signed entry', async () => {
    await ledger.submit(await proposeExpense(0))

    const { events } = await ledger.readEvents(null, 100)
    expect(events.map((event) => event.submittedBy)).toEqual([null, null, relayer.address])
  })

  it('rejects an action signed by someone other than its actor', async () => {
    const action = await proposeExpense(0)
    const forged = { ...action, message: { ...action.message, actor: otherDirector.address } }

    expect((await rejection(ledger.submit(forged))).code).toBe('bad_signature')
  })

  it('rejects an action whose fields were changed after signing', async () => {
    const action = await proposeExpense(0)
    const tampered = { ...action, message: { ...action.message, amountCents: 1 } }

    expect((await rejection(ledger.submit(tampered))).code).toBe('bad_signature')
  })

  it('counts nonces per actor and rejects a replayed action', async () => {
    expect(await ledger.nextNonce(director.address)).toBe(0)
    const action = await proposeExpense(0)
    await ledger.submit(action)
    expect(await ledger.nextNonce(director.address)).toBe(1)

    expect((await rejection(ledger.submit(action))).code).toBe('bad_nonce')
  })

  it('rejects an action past its deadline', async () => {
    const action = await signAction(
      director,
      'ExpenseVoted',
      { expenseId: 'x1', approve: true },
      { nonce: 0, deadline: Math.floor(Date.now() / 1000) - 1 },
    )

    expect((await rejection(ledger.submit(action))).code).toBe('expired')
  })

  it('enforces the ledger rules', async () => {
    const error = await rejection(ledger.submit(await proposeExpense(0, 'x1', student)))

    expect(error.code).toBe('rule')
    expect(error.message).toContain('not a board member')
  })

  it('lets the oracle issue tickets', async () => {
    const action = await signAction(
      oracle,
      'TicketIssued',
      {
        ticketId: 't1',
        eventId: 'party',
        batchId: 'b1',
        owner: student.address,
        priceCents: 5500,
        orderRef: 'order-1',
      },
      { nonce: 0 },
    )
    await ledger.submit(action)

    const { events } = await ledger.readEvents(null, 100)
    expect(events.at(-1)?.record).toMatchObject({ kind: 'TicketIssued', owner: student.address })
  })

  it('refuses genesis records once a signed record exists', async () => {
    await ledger.submit(await proposeExpense(0))

    const error = await rejection(
      ledger.writeGenesis(ASSOCIATION, [
        { kind: 'BatchCreated', actor: null, eventId: 'p', batchId: 'b', priceCents: 1, quantity: 1 },
      ]),
    )
    expect(error.message).toContain('genesis is closed')
  })

  it('links every entry to the previous one by hash', async () => {
    await ledger.submit(await proposeExpense(0))
    await ledger.submit(await proposeExpense(1, 'x2'))

    const { events } = await ledger.readEvents(null, 100)
    expect(events[0].prevHash).toBe('0'.repeat(64))
    for (let i = 1; i < events.length; i++) {
      expect(events[i].prevHash).toBe(events[i - 1].hash)
    }
    expect(new Set(events.map((event) => event.hash)).size).toBe(events.length)
  })

  it('pages through events with a cursor', async () => {
    await ledger.submit(await proposeExpense(0))

    const first = await ledger.readEvents(null, 2)
    expect(first.events).toHaveLength(2)
    const second = await ledger.readEvents(first.next, 2)
    expect(second.events.map((event) => event.record.kind)).toEqual(['ExpenseProposed'])
    const third = await ledger.readEvents(second.next, 2)
    expect(third.events).toEqual([])
  })

  it('does not allow entries to be changed or deleted', async () => {
    await expect(testDb.db.execute(sql`UPDATE ledger.entries SET kind = 'x'`)).rejects.toThrow()
    await expect(testDb.db.execute(sql`DELETE FROM ledger.entries`)).rejects.toThrow()
  })
})
