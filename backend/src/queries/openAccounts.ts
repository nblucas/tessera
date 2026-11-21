import { and, asc, eq, sql } from 'drizzle-orm'
import type { Address } from 'viem'
import type { Db } from '../db/client'
import { batches, events, expenseDetails, expenses, receipts, tickets } from '../db/schema'
import { peopleByAddress } from './accounts'

type ExpenseLine = {
  id: string
  description: string | null
  category: string
  amountCents: number
  approvedBy: string[]
  receipt: { id: string; fileName: string; sha256: string } | null
}

type Ledger = {
  ticketsSold: number
  ticketIncome: number
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
        amount: sql<number>`sum(${tickets.priceCents})::bigint`,
      })
      .from(tickets)
      .where(eq(tickets.association, association))
      .groupBy(tickets.eventId),
    db
      .select({ expense: expenses, description: expenseDetails.description, receipt: receipts })
      .from(expenses)
      .leftJoin(expenseDetails, eq(expenseDetails.expenseId, expenses.expenseId))
      .leftJoin(receipts, eq(receipts.id, expenseDetails.receiptId))
      .where(and(eq(expenses.association, association), eq(expenses.status, 'approved')))
      .orderBy(asc(expenses.decidedAt)),
  ])

  const person = await peopleByAddress(
    db,
    expenseRows.flatMap(({ expense }) => expense.approvals as Address[]),
  )
  const empty = (): Ledger => ({
    ticketsSold: 0,
    ticketIncome: 0,
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
    if (ledger) ledger.ticketIncome += Number(row.amount)
  }
  for (const { expense, description, receipt } of expenseRows) {
    const ledger = (expense.eventId && byEvent.get(expense.eventId)) || general
    ledger.expenses.push({
      id: expense.expenseId,
      description,
      category: expense.category,
      amountCents: expense.amountCents,
      approvedBy: expense.approvals.map((address) => person(address).name ?? address),
      receipt:
        receipt && !receipt.erasedAt
          ? { id: receipt.id, fileName: receipt.fileName, sha256: receipt.sha256 }
          : null,
    })
    ledger.expenseTotal += expense.amountCents
  }

  const all = [...byEvent.values(), general]
  for (const ledger of all) {
    ledger.income = ledger.ticketIncome
    ledger.net = ledger.income - ledger.expenseTotal
  }

  const categories = new Map<string, number>()
  for (const ledger of all) {
    for (const expense of ledger.expenses) {
      categories.set(expense.category, (categories.get(expense.category) ?? 0) + expense.amountCents)
    }
  }
  const ticketIncome = all.reduce((sum, ledger) => sum + ledger.ticketIncome, 0)
  const expenseTotal = all.reduce((sum, ledger) => sum + ledger.expenseTotal, 0)

  return {
    summary: {
      ticketIncome,
      income: ticketIncome,
      expenses: expenseTotal,
      balance: ticketIncome - expenseTotal,
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
