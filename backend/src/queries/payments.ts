import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { getAddress, type Address } from 'viem'
import type { Db } from '../db/client'
import { oracleChanges, orders, paymentEvents, paymentReports, tickets } from '../db/schema'

const STUCK_AFTER_MS = 5 * 60_000

// The oracle in office: the latest one the board approved, or the one set at deploy time.
export async function currentOracle(db: Db, association: string, deployed: Address) {
  const [change] = await db
    .select()
    .from(oracleChanges)
    .where(and(eq(oracleChanges.association, association), eq(oracleChanges.status, 'approved')))
    .orderBy(desc(oracleChanges.closedAt))
    .limit(1)
  return { address: change ? getAddress(change.newOracle) : deployed, since: change?.closedAt ?? null }
}

// Compares what the oracle reported on the ledger with what the backend received from the bank,
// so anyone can see whether every confirmed payment has exactly one outcome.
export async function reconcile(db: Db, association: string, deployedOracle: Address, now: Date) {
  const [reports, paidOrders, reversalsFromBank, oracle, pendingChange] = await Promise.all([
    db.select().from(paymentReports).where(eq(paymentReports.association, association)),
    db
      .select()
      .from(orders)
      .where(and(eq(orders.association, association), isNotNull(orders.paymentRef))),
    db
      .select({ orderId: paymentEvents.orderId })
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.association, association),
          eq(paymentEvents.outcome, 'reversal'),
          sql`${paymentEvents.detail} IS NULL`,
        ),
      ),
    currentOracle(db, association, deployedOracle),
    db
      .select()
      .from(oracleChanges)
      .where(and(eq(oracleChanges.association, association), eq(oracleChanges.status, 'open'))),
  ])

  const outcomes = reports.filter((report) => report.kind !== 'PaymentReversed')
  const reversals = reports.filter((report) => report.kind === 'PaymentReversed')
  const reportedRefs = new Set(outcomes.map((report) => report.paymentRef))
  const confirmedRefs = new Set(paidOrders.map((order) => order.paymentRef!))

  const reversedTickets = reversals.length
    ? await db
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.association, association),
            inArray(tickets.ticketId, reversals.map((report) => report.ticketId!)),
          ),
        )
    : []

  const withoutOutcome = paidOrders.filter(
    (order) =>
      !reportedRefs.has(order.paymentRef!) &&
      now.getTime() - (order.paidAt ?? order.createdAt).getTime() > STUCK_AFTER_MS,
  )
  const unconfirmed = outcomes.filter((report) => !confirmedRefs.has(report.paymentRef))
  const unmatchedReversals = reversals.filter(
    (report) =>
      !reversedTickets.some(
        (ticket) => ticket.ticketId === report.ticketId && ticket.paymentRef === report.paymentRef,
      ),
  )
  const reversedIds = new Set(reversals.map((report) => report.orderRef ?? ''))
  const reversedRefs = new Set(reversals.map((report) => report.paymentRef))
  const bankReversalsMissing = reversalsFromBank.filter((event) => {
    const order = paidOrders.find((item) => item.id === event.orderId)
    return order && !reversedRefs.has(order.paymentRef!) && !reversedIds.has(order.id)
  })
  const pendingOrders = paidOrders.filter(
    (order) => !reportedRefs.has(order.paymentRef!) && !withoutOutcome.includes(order),
  )

  const sum = (rows: { amountCents: number }[]) => rows.reduce((total, row) => total + row.amountCents, 0)
  const ofKind = (kind: string) => reports.filter((report) => report.kind === kind)

  const checks = [
    {
      name: 'Each reported payment has exactly one outcome: a ticket, a resale or a refund',
      ok: reportedRefs.size === outcomes.length,
      detail: `${outcomes.length} outcomes for ${reportedRefs.size} payments`,
    },
    {
      name: 'Every outcome the oracle reported matches a Pix payment the bank confirmed',
      ok: unconfirmed.length === 0,
      detail: unconfirmed.length ? `${unconfirmed.length} reported without a confirmed payment` : 'all matched',
    },
    {
      name: 'Every payment the bank confirmed has its outcome on the ledger',
      ok: withoutOutcome.length === 0,
      detail: withoutOutcome.length
        ? `${withoutOutcome.length} confirmed for more than 5 minutes with no outcome`
        : `${pendingOrders.length} still being settled`,
    },
    {
      name: 'Every reversal points to the ticket that payment bought',
      ok: unmatchedReversals.length === 0,
      detail: `${reversals.length} reversals checked`,
    },
    {
      name: 'Every reversal the bank notified is on the ledger',
      ok: bankReversalsMissing.length === 0,
      detail: bankReversalsMissing.length ? `${bankReversalsMissing.length} missing` : 'all recorded',
    },
  ]

  return {
    oracle: {
      address: oracle.address,
      since: oracle.since?.toISOString() ?? null,
      deployedWith: deployedOracle,
      mayDo: [
        'issue a ticket for a confirmed Pix payment',
        'report a refund when a payment cannot become a ticket',
        'report a reversal the bank made after a ticket was issued',
        'settle a paid resale (old ticket cancelled, new one issued, royalty recorded)',
      ],
      mayNotDo: [
        'vote, propose expenses or change batches',
        "list, move or cancel anyone's ticket without a payment",
        'report the same payment twice',
        'stay in office if a board majority replaces it',
      ],
      pendingChange: pendingChange[0]
        ? { proposalId: pendingChange[0].proposalId, newOracle: pendingChange[0].newOracle, approvals: pendingChange[0].approvals }
        : null,
    },
    ledger: {
      tickets: ofKind('TicketIssued').length,
      ticketCents: sum(ofKind('TicketIssued')),
      resales: ofKind('ResaleSettled').length,
      resaleCents: sum(ofKind('ResaleSettled')),
      refunds: ofKind('PaymentRefunded').length,
      refundCents: sum(ofKind('PaymentRefunded')),
      reversals: reversals.length,
      reversalCents: sum(reversals),
    },
    bank: {
      confirmedPayments: paidOrders.length,
      pendingSettlement: pendingOrders.length,
    },
    checks,
    ok: checks.every((check) => check.ok),
    recent: reports
      .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime())
      .slice(0, 20)
      .map((report) => ({
        kind: report.kind,
        paymentRef: report.paymentRef,
        amountCents: report.amountCents,
        ticketId: report.ticketId,
        reason: report.reason,
        oracle: report.oracle,
        reportedAt: report.reportedAt.toISOString(),
      })),
  }
}
