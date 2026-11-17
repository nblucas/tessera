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

  function update(change: (current: Ticket[]) => Ticket[]) {
    setTickets((current) => {
      const next = change(current)
      saveTickets(next)
      return next
    })
  }

  function updateTicket(ticketId: string, change: (ticket: Ticket) => Ticket) {
    update((current) => current.map((ticket) => (ticket.id === ticketId ? change(ticket) : ticket)))
  }

  function issueTicket(input: NewTicket): Ticket {
    const ticket: Ticket = {
      ...input,
      id: crypto.randomUUID(),
      purchasedAt: new Date().toISOString(),
      status: 'valid',
    }
    update((current) => [...current, ticket])
    return ticket
  }

  function listTicket(ticketId: string, priceCents: number) {
    updateTicket(ticketId, (ticket) =>
      ticket.status === 'valid'
        ? { ...ticket, status: 'listed', listingPriceCents: priceCents }
        : ticket,
    )
  }

  function unlistTicket(ticketId: string) {
    updateTicket(ticketId, (ticket) =>
      ticket.status === 'listed'
        ? { ...ticket, status: 'valid', listingPriceCents: undefined }
        : ticket,
    )
  }

  function buyResale(ticketId: string, buyerEmail: string): Ticket | null {
    const listed = tickets.find((ticket) => ticket.id === ticketId && ticket.status === 'listed')
    if (!listed || listed.listingPriceCents === undefined) return null

    const ticket: Ticket = {
      id: crypto.randomUUID(),
      eventId: listed.eventId,
      batchId: listed.batchId,
      ownerEmail: buyerEmail,
      priceCents: listed.listingPriceCents,
      purchasedAt: new Date().toISOString(),
      status: 'valid',
      resoldFromId: listed.id,
    }
    update((current) => [
      ...current.map((item) =>
        item.id === listed.id ? { ...item, status: 'cancelled' as const } : item,
      ),
      ticket,
    ])
    return ticket
  }

  return (
    <TicketsContext.Provider
      value={{ tickets, issueTicket, listTicket, unlistTicket, buyResale }}
    >
      {children}
    </TicketsContext.Provider>
  )
}
