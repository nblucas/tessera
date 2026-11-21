import { createHash, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { body, createTestApp, type TestApp } from './app'
import { multipart } from './multipart'

const t = await createTestApp()
afterAll(() => t.close())

const diego = await t.signIn('diego@demo.com')
const elisa = await t.signIn('elisa@demo.com')

type Ledger = { expenses: { id: string; description: string; approvedBy: string[] }[]; expenseTotal: number }
type Accounts = {
  summary: {
    ticketIncome: number
    income: number
    expenses: number
    balance: number
    byCategory: { category: string; amount: number }[]
  }
  events: (Ledger & { event: { id: string }; ticketsSold: number; ticketIncome: number; net: number })[]
  general: Ledger & { net: number }
}

// Seed past sales, from frontend/src/data/events.ts.
const SEED_INCOME = 200 * 4000 + 214 * 5500 + 32 * 2500 + 41 * 5000 + 97 * 18000 + 12 * 7000 + 250 * 3500

async function accounts(app: TestApp = t) {
  const response = await app.app.inject({ method: 'GET', url: '/accounts' })
  expect(response.statusCode).toBe(200)
  return body<Accounts>(response)
}

async function proposeExpense(amountCents: number, eventId: string, description: string) {
  const file = Buffer.from(`receipt ${randomUUID()}`)
  const sha256 = createHash('sha256').update(file).digest('hex')
  const form = multipart('receipt.png', 'image/png', file)
  const receipt = body<{ id: string }>(
    await t.app.inject({
      method: 'POST',
      url: `/receipts?sha256=${sha256}`,
      payload: form.payload,
      headers: { ...form.headers, cookie: diego.cookie },
    }),
  )
  const expenseId = randomUUID()
  const action = await diego.sign('ExpenseProposed', {
    expenseId,
    amountCents,
    category: 'Venue',
    eventId,
    receiptSha256: sha256,
  })
  await diego.post('/expenses', { description, receiptId: receipt.id, action })
  return expenseId
}

async function approve(expenseId: string) {
  const action = await elisa.sign('ExpenseVoted', { expenseId, approve: true })
  await elisa.post(`/expenses/${expenseId}/votes`, { action })
}

describe('open accounts', () => {
  it('shows the seed sales as income to anyone', async () => {
    const result = await accounts()
    expect(result.summary).toEqual({
      ticketIncome: SEED_INCOME,
      income: SEED_INCOME,
      expenses: 0,
      balance: SEED_INCOME,
      byCategory: [],
    })
    const party = result.events.find((item) => item.event.id === 'end-of-year-party')!
    expect(party).toMatchObject({ ticketsSold: 414, ticketIncome: 1977000, net: 1977000 })
  })

  it('adds approved expenses per event and leaves pending ones out', async () => {
    const approved = await proposeExpense(150000, 'end-of-year-party', 'Venue deposit')
    await approve(approved)
    await proposeExpense(99999, 'end-of-year-party', 'Still pending')

    const result = await accounts()
    const party = result.events.find((item) => item.event.id === 'end-of-year-party')!
    expect(party.expenses).toEqual([
      expect.objectContaining({ description: 'Venue deposit', approvedBy: ['Diego Ramos', 'Elisa Prado'] }),
    ])
    expect(party.net).toBe(1977000 - 150000)
    expect(result.summary).toMatchObject({
      expenses: 150000,
      balance: SEED_INCOME - 150000,
      byCategory: [{ category: 'Venue', amount: 150000 }],
    })
  })

  it('puts expenses without an event under general', async () => {
    await approve(await proposeExpense(20000, '', 'Bank fees'))

    const { general } = await accounts()
    expect(general.expenses.map((expense) => expense.description)).toEqual(['Bank fees'])
    expect(general.net).toBe(-20000)
  })
})

describe('public ledger feed', () => {
  it('lets anyone page through the raw ledger', async () => {
    const first = body<{ events: { record: { kind: string } }[]; next: string }>(
      await t.app.inject({ method: 'GET', url: '/ledger/events?limit=1' }),
    )
    expect(first.events.map((event) => event.record.kind)).toEqual(['BoardSet'])

    const second = body<{ events: unknown[] }>(
      await t.app.inject({ method: 'GET', url: `/ledger/events?cursor=${first.next}&limit=5` }),
    )
    expect(second.events).toHaveLength(5)
  })

  it('publishes the EIP-712 domain clients sign against', async () => {
    const domain = body(await t.app.inject({ method: 'GET', url: '/ledger/domain' }))
    expect(domain).toEqual({
      name: 'Tessera',
      version: '1',
      chainId: 31337,
      verifyingContract: '0x0000000000000000000000000000000000000001',
      association: 'atletica-integrada',
    })
  })
})

describe('API docs', () => {
  it('serves an OpenAPI document', async () => {
    const doc = body<{ paths: Record<string, unknown> }>(
      await t.app.inject({ method: 'GET', url: '/openapi.json' }),
    )
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/accounts', '/orders', '/expenses']))
  })
})

describe('demo reset', () => {
  it('is not available outside demo mode', async () => {
    expect((await t.app.inject({ method: 'POST', url: '/demo/reset' })).statusCode).toBe(404)
  })

  it('brings back the seed data in demo mode', async () => {
    const demo = await createTestApp({ demoMode: true })
    try {
      const buyer = await demo.signIn('reset@student.edu')
      await buyer.registerAddress()
      const order = body<{ id: string }>(await buyer.post('/orders', { eventId: 'end-of-year-party', batchId: 'b2' }))
      await buyer.post(`/demo/orders/${order.id}/pay`)
      expect((await accounts(demo)).summary.income).toBe(SEED_INCOME + 5500)

      expect((await demo.app.inject({ method: 'POST', url: '/demo/reset' })).statusCode).toBe(204)

      expect((await accounts(demo)).summary.income).toBe(SEED_INCOME)
      expect((await buyer.get('/me')).statusCode).toBe(401)
    } finally {
      await demo.close()
    }
  })
})
