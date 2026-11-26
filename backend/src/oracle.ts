// The payment oracle: the one party trusted to report off-chain Pix payments. It signs every
// payment outcome with its own key and the relayer submits it, so each confirmed payment ends
// on the ledger as exactly one ticket (or settled resale) or one refund, and a later bank
// reversal is recorded against the ticket it paid for. It cannot vote, create batches or move
// anyone's ticket without a payment.
import { randomUUID } from 'node:crypto'
import {
  resaleSplit,
  typedDataFor,
  type ActionMessage,
  type SignedAction,
  type SignedKind,
} from '@tessera/shared'
import { and, eq, isNull } from 'drizzle-orm'
import type { Address } from 'viem'
import { accounts, orders, tickets } from './db/schema'
import type { Deps } from './deps'
import { LedgerRejection } from './ledger/types'

const DEADLINE_SECONDS = 3600

// Rule rejections that no retry can fix: the money goes back.
const PERMANENT_FAILURES = [
  'sold out',
  'unknown batch',
  'price does not match',
  'not listed',
  'own listing',
]

type Order = typeof orders.$inferSelect

export async function registerOracle(deps: Deps) {
  await deps.jobs.register('issue-ticket', ({ orderId }) => handleOrder(deps, orderId))
  await deps.jobs.register('reverse-payment', ({ orderId, amountCents }) =>
    reversePayment(deps, orderId, amountCents),
  )
}

async function handleOrder(deps: Deps, orderId: string) {
  const [order] = await deps.db.select().from(orders).where(eq(orders.id, orderId))
  if (order?.status === 'paid') await settle(deps, order)
  else if (order?.status === 'failed') await refund(deps, order)
}

async function settle(deps: Deps, order: Order) {
  if (order.simulateSettlementFailure) {
    return fail(deps, order, 'settlement failed (simulated by the demo console)')
  }
  const ticketId = await assignTicketId(deps, order)
  try {
    if (order.kind === 'resale') await settleResale(deps, order, ticketId)
    else await issueTicket(deps, order, ticketId)
  } catch (error) {
    if (!(error instanceof LedgerRejection) || error.code !== 'rule') throw error
    if (error.message.includes('already issued')) return markIssued(deps, order)
    if (error.message.includes('payment already reported')) return markRefunded(deps, order)
    if (PERMANENT_FAILURES.some((reason) => error.message.includes(reason))) {
      return fail(deps, order, error.message)
    }
    throw error
  }
  await markIssued(deps, order)
}

async function issueTicket(deps: Deps, order: Order, ticketId: string) {
  const [owner] = await deps.db.select().from(accounts).where(eq(accounts.id, order.accountId))
  await report(deps, order, 'TicketIssued', {
    ticketId,
    eventId: order.eventId,
    batchId: order.batchId,
    owner: owner.address as Address,
    priceCents: order.priceCents,
    orderRef: order.id,
    paymentRef: order.paymentRef!,
  })
}

async function settleResale(deps: Deps, order: Order, ticketId: string) {
  const [buyer] = await deps.db.select().from(accounts).where(eq(accounts.id, order.accountId))
  const split = resaleSplit(order.priceCents)
  await report(deps, order, 'ResaleSettled', {
    paymentRef: order.paymentRef!,
    listedTicketId: order.listedTicketId!,
    ticketId,
    owner: buyer.address as Address,
    priceCents: order.priceCents,
    ...split,
    orderRef: order.id,
  })
  await payReseller(deps, order, split.payoutCents)
}

// The reseller's share leaves by Pix after the resale is on the ledger. A failed payout is
// retried off-chain; the ledger already shows what is owed.
async function payReseller(deps: Deps, order: Order, payoutCents: number) {
  const [listed] = await deps.db
    .select({ owner: tickets.owner })
    .from(tickets)
    .where(and(eq(tickets.association, order.association), eq(tickets.ticketId, order.listedTicketId!)))
  const [seller] = await deps.db.select().from(accounts).where(eq(accounts.address, listed.owner))
  await deps.pix.payout(seller?.id ?? listed.owner, payoutCents, `payout-${order.id}`)
  await deps.db
    .update(orders)
    .set({ payoutCents, payoutAt: deps.now() })
    .where(eq(orders.id, order.id))
}

async function fail(deps: Deps, order: Order, reason: string) {
  await deps.db
    .update(orders)
    .set({ status: 'failed', failureReason: reason })
    .where(eq(orders.id, order.id))
  return refund(deps, { ...order, status: 'failed', failureReason: reason })
}

// Returns the money through the API Pix (idempotent per refund id) and reports the refund, so a
// confirmed payment that produced no ticket is still accounted for on the ledger.
async function refund(deps: Deps, order: Order) {
  const amountCents = order.paidCents ?? order.priceCents
  await deps.pix.refund(order.e2eid!, `refund${order.id.replace(/-/g, '')}`, amountCents)
  try {
    await report(deps, order, 'PaymentRefunded', {
      paymentRef: order.paymentRef!,
      amountCents,
      orderRef: order.id,
      reason: order.failureReason ?? 'refunded',
    })
  } catch (error) {
    const alreadyReported =
      error instanceof LedgerRejection && error.message.includes('payment already reported')
    if (!alreadyReported) throw error
  }
  await markRefunded(deps, order)
}

// The bank returned the money to the payer after the ticket was issued (devolução or MED).
async function reversePayment(deps: Deps, orderId: string, amountCents: number) {
  const [order] = await deps.db.select().from(orders).where(eq(orders.id, orderId))
  if (order?.status !== 'issued') return
  try {
    await report(deps, order, 'PaymentReversed', {
      paymentRef: order.paymentRef!,
      ticketId: order.ticketId!,
      amountCents,
    })
  } catch (error) {
    const alreadyReversed =
      error instanceof LedgerRejection && error.message.includes('already reversed')
    if (!alreadyReversed) throw error
  }
  await deps.db
    .update(orders)
    .set({ status: 'reversed', reversedAt: deps.now() })
    .where(eq(orders.id, order.id))
}

type Fields<K extends SignedKind> = Omit<
  ActionMessage<K>,
  'actor' | 'nonce' | 'deadline' | 'association'
>

async function report<K extends SignedKind>(deps: Deps, order: Order, kind: K, fields: Fields<K>) {
  const message = {
    ...fields,
    actor: deps.oracle.address,
    nonce: await deps.ledger.nextNonce(deps.oracle.address),
    deadline: Math.floor(deps.now().getTime() / 1000) + DEADLINE_SECONDS,
    association: order.association,
  } as unknown as ActionMessage<K>
  const typed = typedDataFor(deps.config.ledgerDomain, kind, message)
  const signature = await deps.oracle.signTypedData(
    typed as Parameters<typeof deps.oracle.signTypedData>[0],
  )
  await deps.relayer.submit({ kind, message, signature } as SignedAction)
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

async function markRefunded(deps: Deps, order: Order) {
  await deps.db.update(orders).set({ status: 'refunded' }).where(eq(orders.id, order.id))
}
