import { randomBytes } from 'node:crypto'
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { batches, batchNames, events, orders, tickets } from '../../db/schema'
import type { Deps } from '../../deps'
import { openOrderFilter } from '../../queries/events'
import type { Api } from '../api'
import { requireAccount } from '../auth'
import { badRequest, conflict, notFound, unauthorized } from '../errors'

const CHARGE_TTL_MS = 15 * 60_000
const TXID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

type Order = typeof orders.$inferSelect

// A Pix txid: 26 to 35 alphanumeric characters.
function newTxid(): string {
  return Array.from(randomBytes(32), (byte) => TXID_ALPHABET[byte % TXID_ALPHABET.length]).join('')
}

function orderView(order: Order, now: Date) {
  const expired = order.status === 'pending_payment' && order.expiresAt <= now
  return {
    id: order.id,
    status: expired ? 'expired' : order.status,
    eventId: order.eventId,
    batchId: order.batchId,
    priceCents: order.priceCents,
    txid: order.txid,
    pixCopyPaste: order.pixCopyPaste,
    expiresAt: order.expiresAt.toISOString(),
    ticketId: order.ticketId,
    failureReason: order.failureReason,
  }
}

export function orderRoutes(app: Api, deps: Deps) {
  const { db, config } = deps
  const association = config.association.id

  async function ownOrder(accountId: string, orderId: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.accountId, accountId)))
    if (!order) throw notFound('Order not found.')
    return order
  }

  app.post(
    '/orders',
    { schema: { body: z.object({ eventId: z.string(), batchId: z.string() }) } },
    async (request, reply) => {
      const account = requireAccount(request)
      if (!account.address) throw badRequest('Register a wallet address first.')
      const { eventId, batchId } = request.body
      const now = deps.now()

      const order = await db.transaction(async (tx) => {
        // One reservation at a time per batch, so the last ticket cannot be held twice.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${eventId}/${batchId}`}))`)
        const [batch] = await tx
          .select()
          .from(batches)
          .where(
            and(
              eq(batches.association, association),
              eq(batches.eventId, eventId),
              eq(batches.batchId, batchId),
              eq(batches.removed, false),
            ),
          )
        if (!batch) throw notFound('This batch does not exist.')
        const [{ held }] = await tx
          .select({ held: count() })
          .from(orders)
          .where(and(eq(orders.eventId, eventId), eq(orders.batchId, batchId), openOrderFilter(now)))
        if (batch.quantity - batch.sold - held <= 0) throw conflict('This batch is sold out.', 'sold_out')

        const txid = newTxid()
        const expiresAt = new Date(now.getTime() + CHARGE_TTL_MS)
        const { copyPaste } = await deps.pix.createCharge({ txid, amountCents: batch.priceCents, expiresAt })
        const [created] = await tx
          .insert(orders)
          .values({
            association,
            accountId: account.id,
            eventId,
            batchId,
            priceCents: batch.priceCents,
            status: 'pending_payment',
            txid,
            pixCopyPaste: copyPaste,
            expiresAt,
          })
          .returning()
        return created
      })
      return reply.status(201).send(orderView(order, now))
    },
  )

  app.get(
    '/orders/:orderId',
    { schema: { params: z.object({ orderId: z.uuid() }) } },
    async (request) => {
      const account = requireAccount(request)
      return orderView(await ownOrder(account.id, request.params.orderId), deps.now())
    },
  )

  // Called by the Pix provider. Duplicate deliveries are ignored: only a pending order moves to
  // paid, and only that transition queues the ticket.
  app.post('/webhooks/pix', async (request) => {
    const payment = deps.pix.verifyWebhook(request.headers, request.rawBody ?? '')
    if (!payment) throw unauthorized('Invalid webhook signature.')

    const [order] = await db.select().from(orders).where(eq(orders.txid, payment.txid))
    if (!order || payment.amountCents !== order.priceCents) {
      request.log.warn({ txid: payment.txid }, 'ignored Pix payment')
      return { received: true }
    }
    const [paid] = await db
      .update(orders)
      .set({ status: 'paid', paidAt: new Date(payment.paidAt) })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'pending_payment')))
      .returning()
    if (paid) await deps.jobs.send('issue-ticket', { orderId: paid.id })
    return { received: true }
  })

  // Demo only: the "Simulate payment" button. The fake provider sends a real signed webhook
  // through the same route a real provider would call.
  app.post(
    '/demo/orders/:orderId/pay',
    { schema: { params: z.object({ orderId: z.uuid() }) } },
    async (request) => {
      if (!config.demoMode || !deps.pix.simulatePayment) throw notFound()
      const account = requireAccount(request)
      const order = await ownOrder(account.id, request.params.orderId)
      const webhook = deps.pix.simulatePayment(order.txid, order.priceCents)
      await app.inject({
        method: 'POST',
        url: '/webhooks/pix',
        headers: webhook.headers,
        payload: webhook.payload,
      })
      return orderView(await ownOrder(account.id, order.id), deps.now())
    },
  )

  app.get('/me/tickets', async (request) => {
    const account = requireAccount(request)
    if (!account.address) return []
    const rows = await db
      .select({ ticket: tickets, event: events, batchName: batchNames.name })
      .from(tickets)
      .innerJoin(events, eq(events.id, tickets.eventId))
      .leftJoin(
        batchNames,
        and(eq(batchNames.eventId, tickets.eventId), eq(batchNames.batchId, tickets.batchId)),
      )
      .where(and(eq(tickets.association, association), eq(tickets.owner, account.address as `0x${string}`)))
      .orderBy(asc(tickets.issuedAt))
    return rows.reverse().map(({ ticket, event, batchName }) => ({
      ticketId: ticket.ticketId,
      code: ticket.ticketId.slice(0, 8).toUpperCase(),
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date.toISOString(),
      location: event.location,
      color: event.color,
      batchId: ticket.batchId,
      batchName: batchName ?? ticket.batchId,
      priceCents: ticket.priceCents,
      issuedAt: ticket.issuedAt.toISOString(),
    }))
  })
}
