import { useState, type ReactNode } from 'react'
import { TicketsContext, type NewTicket, type Ticket } from './context'

const STORAGE_KEY = 'tessera.tickets'

function loadTickets(): Ticket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Ticket[]) : []
  } catch {
    return []
  }
}

function saveTickets(tickets: Ticket[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
  } catch {
    // Storage unavailable: keep tickets in memory only.
  }
}

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>(loadTickets)

  function issueTicket(input: NewTicket): Ticket {
    const ticket: Ticket = {
      ...input,
      id: crypto.randomUUID(),
      purchasedAt: new Date().toISOString(),
      status: 'valid',
    }
    setTickets((current) => {
      const next = [...current, ticket]
      saveTickets(next)
      return next
    })
    return ticket
  }

  return (
    <TicketsContext.Provider value={{ tickets, issueTicket }}>{children}</TicketsContext.Provider>
  )
}
