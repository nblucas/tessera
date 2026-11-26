import { afterAll, describe, expect, it } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { body, createTestApp } from './app'

const t = await createTestApp({ demoMode: true })
afterAll(() => t.close())

const diego = await t.signIn('diego@demo.com')
const elisa = await t.signIn('elisa@demo.com')

type Order = { id: string; status: string; ticketId: string | null; paymentRef: string | null; txid: string }
type Ticket = { ticketId: string; status: string; listingPriceCents: number | null; maxResaleCents: number }
type Check = { name: string; ok: boolean }
type Reconciliation = {
  oracle: { address: string }
  ledger: { tickets: number; resales: number; refunds: number; reversals: number }
  checks: Check[]
  ok: boolean
}

async function buyer(email: string) {
  const user = await t.signIn(email)
  await user.registerAddress()
  return user
}

type User = Awaited<ReturnType<typeof buyer>>

async function waitFor(user: User, orderId: string, status: string) {
  for (let i = 0; i < 20; i++) {
    const order = body<Order>(await user.get(`/orders/${orderId}`))
    if (order.status === status) return order
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return body<Order>(await user.get(`/orders/${orderId}`))
}

async function buyTicket(user: User, options: { failSettlement?: boolean } = {}) {
  const order = body<Order>(await user.post('/orders', { eventId: 'end-of-year-party', batchId: 'b2' }))
  await user.post(`/demo/orders/${order.id}/pay`, options)
  return order
}

async function accounts() {
  return body<{
    summary: { income: number; royaltyIncome: number; reversals: number }
    events: { event: { id: string }; ticketIncome: number; royaltyIncome: number; reversals: number }[]
  }>(await t.app.inject({ method: 'GET', url: '/accounts' }))
}

async function reconciliation() {
  return body<Reconciliation>(await t.app.inject({ method: 'GET', url: '/reconciliation' }))
}

async function lastRecord() {
  const { events } = await t.ledger.readEvents(null, 10_000)
  return events.at(-1)?.record
}

describe('payment outcomes on the ledger', () => {
  it('records the payment reference on the ticket', async () => {
    const user = await buyer('ref@student.edu')
    const order = await waitFor(user, (await buyTicket(user)).id, 'issued')

    expect(order.paymentRef).toMatch(/^[0-9a-f]{64}$/)
    expect(await lastRecord()).toMatchObject({ kind: 'TicketIssued', paymentRef: order.paymentRef })
  })

  it('ignores a duplicate callback and says so', async () => {
    const user = await buyer('dup@student.edu')
    const order = await waitFor(user, (await buyTicket(user)).id, 'issued')

    await user.post(`/demo/orders/${order.id}/resend-webhook`)

    expect(body<unknown[]>(await user.get('/me/tickets'))).toHaveLength(1)
    const events = body<{ orderId: string; outcome: string }[]>(await user.get('/demo/payment-events'))
    expect(events.filter((event) => event.orderId === order.id).map((event) => event.outcome)).toEqual([
      'duplicate',
      'accepted',
    ])
  })

  it('refunds and reports a payment whose settlement fails', async () => {
    const user = await buyer('fail@student.edu')
    const order = await waitFor(user, (await buyTicket(user, { failSettlement: true })).id, 'refunded')

    expect(order.status).toBe('refunded')
    expect(body<unknown[]>(await user.get('/me/tickets'))).toHaveLength(0)
    expect(await lastRecord()).toMatchObject({ kind: 'PaymentRefunded', paymentRef: order.paymentRef })
  })

  it('revokes the ticket and subtracts the income when the bank reverses a payment', async () => {
    const user = await buyer('reverse@student.edu')
    const order = await waitFor(user, (await buyTicket(user)).id, 'issued')
    const before = await accounts()

    await user.post(`/demo/orders/${order.id}/reverse`)

    expect((await waitFor(user, order.id, 'reversed')).status).toBe('reversed')
    const [ticket] = body<Ticket[]>(await user.get('/me/tickets'))
    expect(ticket.status).toBe('revoked')
    const after = await accounts()
    expect(after.summary.income).toBe(before.summary.income - 5500)
    expect(after.summary.reversals).toBe(before.summary.reversals + 5500)
  })

  it('accepts a reversal only for a payment that produced a ticket', async () => {
    const user = await buyer('noreverse@student.edu')
    const order = await waitFor(user, (await buyTicket(user, { failSettlement: true })).id, 'refunded')
    expect((await user.post(`/demo/orders/${order.id}/reverse`)).statusCode).toBe(409)
  })
})

describe('resale', () => {
  async function listedTicket(seller: User, priceCents: number) {
    const order = await waitFor(seller, (await buyTicket(seller)).id, 'issued')
    const action = await seller.sign('TicketListed', { ticketId: order.ticketId!, priceCents })
    return { order, response: await seller.post(`/tickets/${order.ticketId}/listing`, { action }) }
  }

  it('lists a ticket within the cap and sells it to another student', async () => {
    const seller = await buyer('seller@student.edu')
    const { order, response } = await listedTicket(seller, 6600)
    expect(response.statusCode).toBe(200)
    const listings = body<{ ticketId: string; priceCents: number }[]>(await seller.get('/resale'))
    expect(listings).toContainEqual(expect.objectContaining({ ticketId: order.ticketId, priceCents: 6600 }))

    const before = await accounts()
    const buyerUser = await buyer('buyer@student.edu')
    const resale = body<Order>(await buyerUser.post('/orders', { listedTicketId: order.ticketId }))
    await buyerUser.post(`/demo/orders/${resale.id}/pay`)
    expect((await waitFor(buyerUser, resale.id, 'issued')).status).toBe('issued')

    expect(body<Ticket[]>(await buyerUser.get('/me/tickets'))).toEqual([
      expect.objectContaining({ status: 'valid' }),
    ])
    expect(body<Ticket[]>(await seller.get('/me/tickets'))).toEqual([
      expect.objectContaining({ status: 'resold' }),
    ])
    const after = await accounts()
    expect(after.summary.royaltyIncome).toBe(before.summary.royaltyIncome + 660)
    expect(t.pix.payouts).toContainEqual(expect.objectContaining({ amountCents: 6600 - 660 - 330 }))
  })

  it('refuses a listing above the resale cap', async () => {
    const seller = await buyer('greedy@student.edu')
    const { response } = await listedTicket(seller, 6601)
    expect(response.statusCode).toBe(409)
    expect(body(response).message).toContain('above the resale cap')
  })

  it("refuses to list someone else's ticket", async () => {
    const owner = await buyer('owner@student.edu')
    const thief = await buyer('thief@student.edu')
    const order = await waitFor(owner, (await buyTicket(owner)).id, 'issued')
    const action = await thief.sign('TicketListed', { ticketId: order.ticketId!, priceCents: 5000 })
    const response = await thief.post(`/tickets/${order.ticketId}/listing`, { action })
    expect(response.statusCode).toBe(409)
    expect(body(response).message).toContain('only the owner')
  })

  it('refuses to resell a ticket whose payment was reversed', async () => {
    const owner = await buyer('reversed-owner@student.edu')
    const order = await waitFor(owner, (await buyTicket(owner)).id, 'issued')
    await owner.post(`/demo/orders/${order.id}/reverse`)
    await waitFor(owner, order.id, 'reversed')
    const action = await owner.sign('TicketListed', { ticketId: order.ticketId!, priceCents: 5000 })
    const response = await owner.post(`/tickets/${order.ticketId}/listing`, { action })
    expect(response.statusCode).toBe(409)
    expect(body(response).message).toContain('not valid')
  })

  it('refuses to sell a listing to its own seller', async () => {
    const seller = await buyer('self@student.edu')
    const { order } = await listedTicket(seller, 6000)
    const response = await seller.post('/orders', { listedTicketId: order.ticketId })
    expect(response.statusCode).toBe(409)
  })

  it('lets the owner cancel a listing', async () => {
    const seller = await buyer('cancel@student.edu')
    const { order } = await listedTicket(seller, 6000)
    const action = await seller.sign('ListingCancelled', { ticketId: order.ticketId! })
    expect((await seller.post(`/tickets/${order.ticketId}/listing/cancel`, { action })).statusCode).toBe(200)
    const [ticket] = body<Ticket[]>(await seller.get('/me/tickets'))
    expect(ticket.status).toBe('valid')
  })
})

describe('reconciliation', () => {
  it('names the oracle and checks every reported payment against the orders', async () => {
    const result = await reconciliation()
    expect(result.oracle.address).toBe(t.deps.oracle.address)
    expect(result.ledger.tickets).toBeGreaterThan(0)
    expect(result.ledger.refunds).toBeGreaterThan(0)
    expect(result.ledger.reversals).toBeGreaterThan(0)
    expect(result.checks.every((check) => check.ok)).toBe(true)
    expect(result.ok).toBe(true)
  })
})

describe('replacing the oracle', () => {
  it('lets a board majority replace the oracle, after which its old key is refused', async () => {
    const newOracle = privateKeyToAccount(generatePrivateKey()).address
    const proposal = await diego.sign('OracleChangeProposed', { proposalId: 'o1', newOracle })
    expect((await diego.post('/oracle/changes', { action: proposal })).statusCode).toBe(200)
    const approval = await elisa.sign('OracleChangeApproved', { proposalId: 'o1' })
    const response = await elisa.post('/oracle/changes/o1/approvals', { action: approval })
    expect(response.statusCode).toBe(200)

    const oracle = body<{ address: string }>(await t.app.inject({ method: 'GET', url: '/oracle' }))
    expect(oracle.address).toBe(newOracle)

    const user = await buyer('after-change@student.edu')
    const order = await buyTicket(user)
    expect((await waitFor(user, order.id, 'issued')).status).toBe('paid')
  })
})
