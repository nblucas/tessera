// The payment oracle: once Pix confirms a payment, it signs TicketIssued with its own key and
// the relayer submits it. It is the only role that signs as itself, and only to issue tickets.
import { randomUUID } from 'node:crypto'
import { typedDataFor, type ActionMessage, type SignedAction } from '@tessera/shared'
import { and, eq, isNull } from 'drizzle-orm'
import type { Address } from 'viem'
import { accounts, orders, tickets } from './db/schema'
import type { Deps } from './deps'
import { LedgerRejection } from './ledger/types'

const DEADLINE_SECONDS = 3600

// Rule rejections that no retry can fix: the money goes back.
const PERMANENT_FAILURES = ['sold out', 'unknown batch', 'price does not match']

export async function registerOracle(deps: Deps) {
  await deps.jobs.register('issue-ticket', ({ orderId }) => handleOrder(deps, orderId))
}

async function handleOrder(deps: Deps, orderId: string) {
  const [order] = await deps.db.select().from(orders).where(eq(orders.id, orderId))
  if (order?.status === 'paid') await issueTicket(deps, order)
  else if (order?.status === 'failed') await refund(deps, order)
}

type Order = typeof orders.$inferSelect

async function issueTicket(deps: Deps, order: Order) {
  const { db } = deps
  const ticketId = await assignTicketId(deps, order)

  const [alreadyIssued] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.association, order.association), eq(tickets.ticketId, ticketId)))
  if (alreadyIssued) return markIssued(deps, order)

  const [owner] = await db.select().from(accounts).where(eq(accounts.id, order.accountId))
  const message = {
    actor: deps.oracle.address,
    nonce: await deps.ledger.nextNonce(deps.oracle.address),
    deadline: Math.floor(deps.now().getTime() / 1000) + DEADLINE_SECONDS,
    association: order.association,
    ticketId,
    eventId: order.eventId,
    batchId: order.batchId,
    owner: owner.address as Address,
    priceCents: order.priceCents,
    orderRef: order.id,
  } satisfies ActionMessage<'TicketIssued'>
  const typed = typedDataFor(deps.config.ledgerDomain, 'TicketIssued', message)
  const signature = await deps.oracle.signTypedData(
    typed as Parameters<typeof deps.oracle.signTypedData>[0],
  )
  const action: SignedAction<'TicketIssued'> = { kind: 'TicketIssued', message, signature }

  try {
    await deps.relayer.submit(action)
  } catch (error) {
    if (!(error instanceof LedgerRejection) || error.code !== 'rule') throw error
    if (error.message.includes('already issued')) return markIssued(deps, order)
    if (PERMANENT_FAILURES.some((reason) => error.message.includes(reason))) {
      await db
        .update(orders)
        .set({ status: 'failed', failureReason: error.message })
        .where(eq(orders.id, order.id))
      return refund(deps, { ...order, status: 'failed', failureReason: error.message })
    }
    throw error
  }
  await markIssued(deps, order)
}

async function assignTicketId(deps: Deps, order: Order): Promise<string> {
  if (order.ticketId) return order.ticketId
  await deps.db
    .update(orders)
    .set({ ticketId: randomUUID() })
    .where(and(eq(orders.id, order.id), isNull(orders.ticketId)))
  const [row] = await deps.db.select({ ticketId: orders.ticketId }).from(orders).where(eq(orders.id, order.id))
  return row.ticketId!
}

async function markIssued(deps: Deps, order: Order) {
  await deps.db.update(orders).set({ status: 'issued' }).where(eq(orders.id, order.id))
}

async function refund(deps: Deps, order: Order) {
  await deps.pix.refund(order.txid, order.priceCents)
  await deps.db.update(orders).set({ status: 'refunded' }).where(eq(orders.id, order.id))
}
