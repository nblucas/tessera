import { afterAll, describe, expect, it } from 'vitest'
import { body, createTestApp } from './app'

const t = await createTestApp()
afterAll(() => t.close())

type Order = {
  id: string
  status: string
  txid: string
  priceCents: number
  pixCopyPaste: string
  ticketId: string | null
  failureReason: string | null
}

const diego = await t.signIn('diego@demo.com')

async function buyer(email: string) {
  const user = await t.signIn(email)
  await user.registerAddress()
  return user
}

async function available(eventId: string, batchId: string) {
  const event = body<{ batches: { id: string; available: number }[] }>(await diego.get(`/events/${eventId}`))
  return event.batches.find((batch) => batch.id === batchId)!.available
}

async function order(user: Awaited<ReturnType<typeof buyer>>, eventId: string, batchId: string) {
  const response = await user.post('/orders', { eventId, batchId })
  return { response, order: body<Order>(response) }
}

// A new event with one batch of `quantity` tickets.
async function eventWithBatch(quantity: number) {
  const event = body<{ id: string }>(
    await diego.post('/events', {
      title: 'Small Party',
      description: '',
      date: '2027-05-01T22:00:00-03:00',
      location: 'Room 1',
      color: '#7c54c8',
    }),
  )
  const action = await diego.sign('BatchCreated', { eventId: event.id, batchId: 'b1', priceCents: 2000, quantity })
  await diego.post(`/events/${event.id}/batches`, { changes: [{ batchId: 'b1', name: 'Only batch', action }] })
  return event.id
}

describe('orders', () => {
  it('reserves a ticket while the Pix payment is pending', async () => {
    const before = await available('end-of-year-party', 'b2')
    const user = await buyer('olga@student.edu')

    const { response, order: created } = await order(user, 'end-of-year-party', 'b2')
    expect(response.statusCode).toBe(201)
    expect(created).toMatchObject({ status: 'pending_payment', priceCents: 5500 })
    expect(created.pixCopyPaste).toContain('br.gov.bcb.pix')
    expect(await available('end-of-year-party', 'b2')).toBe(before - 1)
  })

  it('needs a wallet address to own the ticket', async () => {
    const user = await t.signIn('no-wallet@student.edu')
    const response = await user.post('/orders', { eventId: 'end-of-year-party', batchId: 'b2' })
    expect(response.statusCode).toBe(400)
  })

  it('issues the ticket once the payment is confirmed', async () => {
    const user = await buyer('paulo@student.edu')
    const { order: created } = await order(user, 'end-of-year-party', 'b2')

    expect((await t.pay(created)).statusCode).toBe(200)

    const updated = body<Order>(await user.get(`/orders/${created.id}`))
    expect(updated.status).toBe('issued')
    const tickets = body<{ ticketId: string; eventTitle: string; batchName: string }[]>(
      await user.get('/me/tickets'),
    )
    expect(tickets).toEqual([
      expect.objectContaining({
        ticketId: updated.ticketId,
        eventTitle: 'End of Year Party',
        batchName: '2nd batch',
        priceCents: 5500,
      }),
    ])
    const { events } = await t.ledger.readEvents(null, 1000)
    expect(events.at(-1)?.record).toMatchObject({
      kind: 'TicketIssued',
      actor: t.deps.oracle.address,
      owner: user.wallet.address,
      ticketId: updated.ticketId,
    })
  })

  it('sells the last ticket only once', async () => {
    const eventId = await eventWithBatch(1)
    const first = await buyer('quel@student.edu')
    const second = await buyer('rafa@student.edu')

    expect((await order(first, eventId, 'b1')).response.statusCode).toBe(201)
    const { response } = await order(second, eventId, 'b1')
    expect(response.statusCode).toBe(409)
  })

  it('releases the reservation when the charge expires unpaid', async () => {
    const eventId = await eventWithBatch(1)
    const user = await buyer('sara@student.edu')
    const { order: created } = await order(user, eventId, 'b1')

    t.clock.now = new Date(t.clock.now.getTime() + 16 * 60_000)
    try {
      expect(body<Order>(await user.get(`/orders/${created.id}`)).status).toBe('expired')
      expect(await available(eventId, 'b1')).toBe(1)
    } finally {
      t.clock.now = new Date()
    }
  })

  it('refunds a late payment when the batch sold out meanwhile', async () => {
    const eventId = await eventWithBatch(1)
    const late = await buyer('tati@student.edu')
    const { order: lateOrder } = await order(late, eventId, 'b1')

    t.clock.now = new Date(t.clock.now.getTime() + 16 * 60_000)
    try {
      const onTime = await buyer('ugo@student.edu')
      const { order: onTimeOrder } = await order(onTime, eventId, 'b1')
      await t.pay(onTimeOrder)

      await t.pay(lateOrder)

      const refunded = body<Order>(await late.get(`/orders/${lateOrder.id}`))
      expect(refunded.status).toBe('refunded')
      expect(refunded.failureReason).toContain('sold out')
      expect(t.pix.refunds).toContainEqual({ txid: lateOrder.txid, amountCents: 2000 })
    } finally {
      t.clock.now = new Date()
    }
  })

  it('ignores webhooks with a bad signature', async () => {
    const user = await buyer('vera@student.edu')
    const { order: created } = await order(user, 'end-of-year-party', 'b2')
    const webhook = t.pix.simulatePayment(created.txid, created.priceCents)

    const response = await t.app.inject({
      method: 'POST',
      url: '/webhooks/pix',
      headers: { ...webhook.headers, 'x-pix-signature': '0'.repeat(64) },
      payload: webhook.payload,
    })
    expect(response.statusCode).toBe(401)
    expect(body<Order>(await user.get(`/orders/${created.id}`)).status).toBe('pending_payment')
  })

  it('issues one ticket however many times the webhook arrives', async () => {
    const user = await buyer('wil@student.edu')
    const { order: created } = await order(user, 'end-of-year-party', 'b2')

    await t.pay(created)
    await t.pay(created)

    expect(body<unknown[]>(await user.get('/me/tickets'))).toHaveLength(1)
  })

  it('retries issuing when the ledger is briefly unavailable', async () => {
    const user = await buyer('xuxa@student.edu')
    const { order: created } = await order(user, 'end-of-year-party', 'b2')
    const submit = t.deps.relayer.submit.bind(t.deps.relayer)
    t.deps.relayer.submit = async () => {
      throw new Error('ledger unavailable')
    }
    try {
      await t.pay(created)
      expect(body<Order>(await user.get(`/orders/${created.id}`)).status).toBe('paid')
    } finally {
      t.deps.relayer.submit = submit
    }

    await t.jobs.retryFailed()
    expect(body<Order>(await user.get(`/orders/${created.id}`)).status).toBe('issued')
  })

  it("keeps each buyer's orders private", async () => {
    const owner = await buyer('yara@student.edu')
    const other = await buyer('zeca@student.edu')
    const { order: created } = await order(owner, 'end-of-year-party', 'b2')

    expect((await other.get(`/orders/${created.id}`)).statusCode).toBe(404)
  })

  it('offers simulated payments only in demo mode', async () => {
    const user = await buyer('demo-off@student.edu')
    const { order: created } = await order(user, 'end-of-year-party', 'b2')
    expect((await user.post(`/demo/orders/${created.id}/pay`)).statusCode).toBe(404)

    const demo = await createTestApp({ demoMode: true })
    try {
      const demoUser = await demo.signIn('demo-on@student.edu')
      await demoUser.registerAddress()
      const demoOrder = body<Order>(
        await demoUser.post('/orders', { eventId: 'end-of-year-party', batchId: 'b2' }),
      )
      const paid = await demoUser.post(`/demo/orders/${demoOrder.id}/pay`)
      expect(body<Order>(paid).status).toBe('issued')
    } finally {
      await demo.close()
    }
  })
})
