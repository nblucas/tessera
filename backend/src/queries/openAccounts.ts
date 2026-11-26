import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { batches, events, expenseDetails, expenses, paymentReports, receipts, tickets } from '../db/schema'
import { peopleByAddress } from './accounts'

type ExpenseLine = {
  id: string
  description: string | null
  category: string
  amountCents: number
  approvedBy: string[]
  // From the ledger: stays even if the file is erased.
  receiptSha256: string
  receipt: { id: string; fileName: string; erased: boolean } | null
}

type Ledger = {
  ticketsSold: number
  ticketIncome: number
  resaleCount: number
  royaltyIncome: number
  reversalCount: number
  // Income lost to bank reversals: the ticket price for a sale, the royalty for a resale.
  reversals: number
  income: number
  expenses: ExpenseLine[]
  expenseTotal: number
  net: number
}

// The open accounts, built only from indexer read tables (plus descriptions and receipt
// names): income from opening sales and issued tickets, minus approved expenses.
export async function openAccounts(db: Db, association: string) {
  const [eventRows, batchRows, ticketRows, expenseRows] = await Promise.all([
    db.select().from(events).where(eq(events.association, association)).orderBy(asc(events.date)),
    db
      .select({
        eventId: batches.eventId,
        sold: sql<number>`sum(${batches.sold})::int`,
        openingAmount: sql<number>`sum(${batches.openingAmountCents})::bigint`,
      })
      .from(batches)
      .where(eq(batches.association, association))
      .groupBy(batches.eventId),
    db
      .select({
        eventId: tickets.eventId,
        kind: tickets.kind,
        count: sql<number>`count(*)::int`,
        amount: sql<number>`sum(${tickets.priceCents})::bigint`,
        royalty: sql<number>`coalesce(sum(${tickets.royaltyCents}), 0)::bigint`,
      })
      .from(tickets)
      .where(eq(tickets.association, association))
      .groupBy(tickets.eventId, tickets.kind),
    db
      .select({ expense: expenses, description: expenseDetails.description, receipt: receipts })
      .from(expenses)
      .leftJoin(
        expenseDetails,
        and(eq(expenseDetails.association, expenses.association), eq(expenseDetails.expenseId, expenses.expenseId)),
      )
      .leftJoin(receipts, eq(receipts.id, expenseDetails.receiptId))
      .where(and(eq(expenses.association, association), eq(expenses.status, 'approved')))
      .orderBy(asc(expenses.decidedAt)),
  ])
  const reversalRows = await db
    .select({ report: paymentReports, ticket: tickets })
    .from(paymentReports)
    .innerJoin(
      tickets,
      and(eq(tickets.association, paymentReports.association), eq(tickets.ticketId, paymentReports.ticketId)),
    )
    .where(and(eq(paymentReports.association, association), eq(paymentReports.kind, 'PaymentReversed')))

  const person = await peopleByAddress(
    db,
    expenseRows.flatMap(({ expense }) => expense.approvals),
  )
  const empty = (): Ledger => ({
    ticketsSold: 0,
    ticketIncome: 0,
    resaleCount: 0,
    royaltyIncome: 0,
    reversalCount: 0,
    reversals: 0,
    income: 0,
    expenses: [],
    expenseTotal: 0,
    net: 0,
  })
  const byEvent = new Map(eventRows.map((event) => [event.id, empty()]))
  const general = empty()

  for (const row of batchRows) {
    const ledger = byEvent.get(row.eventId)
    if (!ledger) continue
    ledger.ticketsSold += Number(row.sold)
    ledger.ticketIncome += Number(row.openingAmount)
  }
  for (const row of ticketRows) {
    const ledger = byEvent.get(row.eventId)
    if (!ledger) continue
    if (row.kind === 'resale') {
      ledger.resaleCount += Number(row.count)
      ledger.royaltyIncome += Number(row.royalty)
    } else {
      ledger.ticketIncome += Number(row.amount)
    }
  }
  for (const { report, ticket } of reversalRows) {
    const ledger = byEvent.get(ticket.eventId)
    if (!ledger) continue
    ledger.reversalCount += 1
    ledger.reversals += ticket.kind === 'resale' ? Number(ticket.royaltyCents ?? 0) : report.amountCents
  }
  for (const { expense, description, receipt } of expenseRows) {
    const ledger = (expense.eventId && byEvent.get(expense.eventId)) || general
    ledger.expenses.push({
      id: expense.expenseId,
      description,
      category: expense.category,
      amountCents: expense.amountCents,
      approvedBy: expense.approvals.map((address) => person(address).name ?? address),
      receiptSha256: expense.receiptSha256,
      receipt: receipt
        ? { id: receipt.id, fileName: receipt.fileName, erased: receipt.erasedAt !== null }
        : null,
    })
    ledger.expenseTotal += expense.amountCents
  }

  const all = [...byEvent.values(), general]
  for (const ledger of all) {
    ledger.income = ledger.ticketIncome + ledger.royaltyIncome - ledger.reversals
    ledger.net = ledger.income - ledger.expenseTotal
  }

  const categories = new Map<string, number>()
  for (const ledger of all) {
    for (const expense of ledger.expenses) {
      categories.set(expense.category, (categories.get(expense.category) ?? 0) + expense.amountCents)
    }
  }
  const total = (pick: (ledger: Ledger) => number) => all.reduce((sum, ledger) => sum + pick(ledger), 0)
  const ticketIncome = total((ledger) => ledger.ticketIncome)
  const royaltyIncome = total((ledger) => ledger.royaltyIncome)
  const reversals = total((ledger) => ledger.reversals)
  const income = total((ledger) => ledger.income)
  const expenseTotal = total((ledger) => ledger.expenseTotal)

  return {
    summary: {
      ticketIncome,
      royaltyIncome,
      reversals,
      income,
      expenses: expenseTotal,
      balance: income - expenseTotal,
      byCategory: [...categories.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    },
    events: eventRows.map((event) => ({
      event: { id: event.id, title: event.title, date: event.date.toISOString(), color: event.color },
      ...byEvent.get(event.id)!,
    })),
    general,
  }
}
