import { createContext, useContext } from 'react'

export type TicketStatus = 'valid' | 'listed' | 'used' | 'cancelled'

export type Ticket = {
  id: string
  eventId: string
  batchId: string
  ownerEmail: string
  priceCents: number
  purchasedAt: string
  status: TicketStatus
}

export type NewTicket = Pick<Ticket, 'eventId' | 'batchId' | 'ownerEmail' | 'priceCents'>

export type TicketsContextValue = {
  tickets: Ticket[]
  issueTicket: (ticket: NewTicket) => Ticket
}

export const TicketsContext = createContext<TicketsContextValue | null>(null)

export function useTickets(): TicketsContextValue {
  const value = useContext(TicketsContext)
  if (!value) {
    throw new Error('useTickets must be used inside <TicketsProvider>')
  }
  return value
}
