import type { Event } from '../data/events'
import type { Expense } from '../data/expenses'
import type { Ticket } from '../tickets/context'
import { resaleSplit } from './resale'

export type EventLedger = {
  event: Event | null
  ticketsSold: number
  ticketIncome: number
  resaleCount: number
  royaltyIncome: number
  expenses: Expense[]
  expenseTotal: number
  income: number
  net: number
}

function emptyLedger(event: Event | null): EventLedger {
  return {
    event,
    ticketsSold: 0,
    ticketIncome: 0,
    resaleCount: 0,
    royaltyIncome: 0,
    expenses: [],
    expenseTotal: 0,
    income: 0,
    net: 0,
  }
}

export function buildLedger(events: Event[], tickets: Ticket[], expenses: Expense[]) {
  const byEvent = new Map<string, EventLedger>()
  for (const event of events) {
    const ledger = emptyLedger(event)
    for (const batch of event.batches) {
      ledger.ticketsSold += batch.sold
      ledger.ticketIncome += batch.sold * batch.priceCents
    }
    byEvent.set(event.id, ledger)
  }
  const general = emptyLedger(null)

  for (const ticket of tickets) {
    const ledger = byEvent.get(ticket.eventId)
    if (!ledger) continue
    if (ticket.resoldFromId) {
      ledger.resaleCount += 1
      ledger.royaltyIncome += resaleSplit(ticket.priceCents).association
    } else {
      ledger.ticketsSold += 1
      ledger.ticketIncome += ticket.priceCents
    }
  }

  for (const expense of expenses) {
    if (expense.status !== 'approved') continue
    const ledger = (expense.eventId && byEvent.get(expense.eventId)) || general
    ledger.expenses.push(expense)
    ledger.expenseTotal += expense.amountCents
  }

  const all = [...byEvent.values(), general]
  for (const ledger of all) {
    ledger.income = ledger.ticketIncome + ledger.royaltyIncome
    ledger.net = ledger.income - ledger.expenseTotal
  }

  return {
    events: [...byEvent.values()].sort((a, b) => a.event!.date.localeCompare(b.event!.date)),
    general,
  }
}
