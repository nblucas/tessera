import { randomBytes } from 'node:crypto'
import { batchKey } from '@tessera/shared'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Webhook } from '../../adapters/pix'
import { sha256Hex } from '../../crypto'
import { batches, batchNames, events, orders, paymentEvents, tickets } from '../../db/schema'
import type { PaymentEventOutcome } from '../../db/schema'
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

export function orderView(order: Order, now: Date) {
  const expired = order.status === 'pending_payment' && order.expiresAt <= now
  return {
    id: order.id,
    kind: order.kind,
    status: expired ? 'expired' : order.status,
    eventId: order.eventId,
    batchId: order.batchId,
    listedTicketId: order.listedTicketId,
    priceCents: order.priceCents,
    txid: order.txid,
    pixCopyPaste: order.pixCopyPaste,
    expiresAt: order.expiresAt.toISOString(),
    ticketId: order.ticketId,
    paymentRef: order.paymentRef,
    failureReason: order.failureReason,
    payoutCents: order.payoutCents,
    createdAt: order.createdAt.toISOString(),
  }
}

const orderBody = z.union([
  z.object({ eventId: z.string(), batchId: z.string() }),
  z.object({ listedTicketId: z.string() }),
])

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

  async function anyOrder(orderId: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.association, association)))
    if (!order) throw notFound('Order not found.')
    return order
  }

  async function deliver(webhook: Webhook) {
    return app.inject({
      method: 'POST',
      url: '/webhooks/pix',
      headers: webhook.headers,
      payload: webhook.payload,
    })
  }

  async function logEvent(values: {
    txid: string
    e2eid: string | null
    amountCents: number
    outcome: PaymentEventOutcome
    orderId?: string
    detail?: string
  }) {
    await db.insert(paymentEvents).values({ association, ...values })
  }

  // A batch ticket, or a listed resale ticket. Creating the order reserves it until the Pix
  // charge expires.
  app.post('/orders', { schema: { body: orderBody } }, async (request, reply) => {
    const account = requireAccount(request)
    if (!account.address) throw badRequest('Register a wallet address first.')
    const now = deps.now()

    const order = await db.transaction(async (tx) => {
      let values: Pick<Order, 'eventId' | 'batchId' | 'priceCents' | 'kind' | 'listedTicketId'>

      if ('listedTicketId' in request.body) {
        const { listedTicketId } = request.body
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`listing/${listedTicketId}`}))`)
        const [listed] = await tx
          .select()
          .from(tickets)
          .where(and(eq(tickets.association, association), eq(tickets.ticketId, listedTicketId)))
        if (!listed || listed.status !== 'listed' || listed.listingPriceCents === null) {
          throw notFound('This ticket is not for sale.')
        }
        if (listed.owner === account.address) throw conflict('This is your own listing.', 'own_listing')
        const [{ held }] = await tx
          .select({ held: count() })
          .from(orders)
          .where(and(eq(orders.listedTicketId, listedTicketId), openOrderFilter(now)))
        if (held > 0) throw conflict('Someone is already paying for this ticket.', 'sold_out')
        values = {
          eventId: listed.eventId,
          batchId: listed.batchId,
          priceCents: listed.listingPriceCents,
          kind: 'resale',
          listedTicketId,
        }
      } else {
        const { eventId, batchId } = request.body
        // One reservation at a time per batch, so the last ticket cannot be held twice.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${batchKey(eventId, batchId)}))`)
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
          .where(
            and(
              eq(orders.eventId, eventId),
              eq(orders.batchId, batchId),
              eq(orders.kind, 'ticket'),
              openOrderFilter(now),
            ),
          )
        if (batch.quantity - batch.sold - held <= 0) throw conflict('This batch is sold out.', 'sold_out')
        values = { eventId, batchId, priceCents: batch.priceCents, kind: 'ticket', listedTicketId: null }
      }

      const txid = newTxid()
      const expiresAt = new Date(now.getTime() + CHARGE_TTL_MS)
      const { copyPaste } = await deps.pix.createCharge({ txid, amountCents: values.priceCents, expiresAt })
      const [created] = await tx
        .insert(orders)
        .values({
          association,
          accountId: account.id,
          ...values,
          status: 'pending_payment',
          txid,
          pixCopyPaste: copyPaste,
          expiresAt,
        })
        .returning()
      return created
    })
    return reply.status(201).send(orderView(order, now))
  })

  app.get(
    '/orders/:orderId',
    { schema: { params: z.object({ orderId: z.uuid() }) } },
    async (request) => {
      const account = requireAccount(request)
      return orderView(await ownOrder(account.id, request.params.orderId), deps.now())
    },
  )

  // Called by the Pix provider for payments and for devoluções that reached a final status.
  // Every notification is logged with what was done about it, duplicates included.
  app.post('/webhooks/pix', async (request) => {
    const notification = deps.pix.verifyWebhook(request.headers, request.rawBody ?? '')
    if (!notification) throw unauthorized('Invalid webhook signature.')
    const { txid, e2eid, amountCents } = notification

    const [order] = await db.select().from(orders).where(eq(orders.txid, txid))
    if (!order) {
      await logEvent({ txid, e2eid, amountCents, outcome: 'unknown_charge' })
      return { received: true }
    }

    const returned = notification.devolucoes.filter((item) => item.status === 'DEVOLVIDO')
    if (returned.some((item) => item.natureza !== 'ORIGINAL')) {
      // The bank returned the money to the payer (MED): the ticket it paid for is revoked.
      const reversed = returned.reduce((sum, item) => sum + item.amountCents, 0)
      if (order.status === 'issued') {
        await logEvent({ txid, e2eid, amountCents: reversed, outcome: 'reversal', orderId: order.id })
        await deps.jobs.send('reverse-payment', { orderId: order.id, amountCents: reversed })
      } else {
        await logEvent({
          txid,
          e2eid,
          amountCents: reversed,
          outcome: 'reversal',
          orderId: order.id,
          detail: `ignored: order is ${order.status}`,
        })
      }
      return { received: true }
    }
    if (returned.length > 0) {
      await logEvent({ txid, e2eid, amountCents, outcome: 'own_refund', orderId: order.id })
      return { received: true }
    }

    // A payment. Only a pending order moves on; any later copy of the callback is a duplicate.
    const wrongAmount = amountCents !== order.priceCents
    const [moved] = await db
      .update(orders)
      .set({
        status: wrongAmount ? 'failed' : 'paid',
        failureReason: wrongAmount
          ? `paid amount ${amountCents} does not match the price ${order.priceCents}`
          : null,
        e2eid,
        paymentRef: sha256Hex(e2eid),
        paidCents: amountCents,
        paidAt: new Date(notification.paidAt),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'pending_payment')))
      .returning()

    if (!moved) {
      await logEvent({
        txid,
        e2eid,
        amountCents,
        outcome: 'duplicate',
        orderId: order.id,
        detail: `ignored: order is already ${order.status}`,
      })
      return { received: true }
    }
    await logEvent({ txid, e2eid, amountCents, outcome: wrongAmount ? 'wrong_amount' : 'accepted', orderId: order.id })
    // Issues the ticket, or refunds a wrong amount.
    await deps.jobs.send('issue-ticket', { orderId: order.id })
    return { received: true }
  })

  // Demo only: what the bank would do. The fake provider sends real signed webhooks through
  // the same route a real provider calls.
  function requireDemo() {
    if (!config.demoMode || !deps.pix.simulatePayment || !deps.pix.simulateReversal) throw notFound()
  }

  app.post(
    '/demo/orders/:orderId/pay',
    {
      schema: {
        params: z.object({ orderId: z.uuid() }),
        body: z.object({ failSettlement: z.boolean().optional() }).optional(),
      },
    },
    async (request) => {
      requireDemo()
      const account = requireAccount(request)
      const order = await ownOrder(account.id, request.params.orderId)
      if (request.body?.failSettlement) {
        await db.update(orders).set({ simulateSettlementFailure: true }).where(eq(orders.id, order.id))
      }
      await deliver(deps.pix.simulatePayment!(order.txid, order.priceCents))
      return orderView(await ownOrder(account.id, order.id), deps.now())
    },
  )

  // Recent orders of everyone, for the demo console.
  app.get('/demo/orders', async (request) => {
    requireDemo()
    requireAccount(request)
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.association, association))
      .orderBy(desc(orders.createdAt))
      .limit(20)
    return rows.map((order) => orderView(order, deps.now()))
  })

  app.post(
    '/demo/orders/:orderId/resend-webhook',
    { schema: { params: z.object({ orderId: z.uuid() }) } },
    async (request) => {
      requireDemo()
      requireAccount(request)
      const order = await anyOrder(request.params.orderId)
      if (order.status === 'pending_payment') throw conflict('This order was never paid.')
      await deliver(deps.pix.simulatePayment!(order.txid, order.paidCents ?? order.priceCents))
      return orderView(await anyOrder(order.id), deps.now())
    },
  )

  app.post(
    '/demo/orders/:orderId/reverse',
    { schema: { params: z.object({ orderId: z.uuid() }) } },
    async (request) => {
      requireDemo()
      requireAccount(request)
      const order = await anyOrder(request.params.orderId)
      if (order.status !== 'issued') throw conflict('Only a payment that produced a ticket can be reversed.')
      await deliver(deps.pix.simulateReversal!(order.txid, order.priceCents))
      return orderView(await anyOrder(order.id), deps.now())
    },
  )

  // What happened to each Pix notification, newest first.
  app.get('/demo/payment-events', async (request) => {
    requireDemo()
    requireAccount(request)
    const rows = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.association, association))
      .orderBy(desc(paymentEvents.receivedAt))
      .limit(30)
    return rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() }))
  })

  app.get('/me/tickets', async (request) => {
    const account = requireAccount(request)
    if (!account.address) return []
    const rows = await db
      .select({ ticket: tickets, event: events, batch: batches, batchName: batchNames.name })
      .from(tickets)
      .innerJoin(events, and(eq(events.association, tickets.association), eq(events.id, tickets.eventId)))
      .innerJoin(
        batches,
        and(
          eq(batches.association, tickets.association),
          eq(batches.eventId, tickets.eventId),
          eq(batches.batchId, tickets.batchId),
        ),
      )
      .leftJoin(
        batchNames,
        and(
          eq(batchNames.association, tickets.association),
          eq(batchNames.eventId, tickets.eventId),
          eq(batchNames.batchId, tickets.batchId),
        ),
      )
      .where(and(eq(tickets.association, association), eq(tickets.owner, account.address as `0x${string}`)))
      .orderBy(asc(tickets.issuedAt))
    return rows.reverse().map(({ ticket, event, batch, batchName }) => ticketView(ticket, event, batch, batchName))
  })
}

export function ticketView(
  ticket: typeof tickets.$inferSelect,
  event: typeof events.$inferSelect,
  batch: typeof batches.$inferSelect,
  batchName: string | null,
) {
  return {
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
    faceValueCents: batch.priceCents,
    maxResaleCents: Math.floor((batch.priceCents * batch.resaleCapPercent) / 100),
    resaleCapPercent: batch.resaleCapPercent,
    status: ticket.status,
    listingPriceCents: ticket.listingPriceCents,
    kind: ticket.kind,
    issuedAt: ticket.issuedAt.toISOString(),
  }
}
