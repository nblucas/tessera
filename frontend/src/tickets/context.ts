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
  listingPriceCents?: number
  resoldFromId?: string
  sellerId?: string
  commissionCents?: number
  usedAt?: string
}

export type NewTicket = Pick<
  Ticket,
  'eventId' | 'batchId' | 'ownerEmail' | 'priceCents' | 'sellerId' | 'commissionCents'
>

export type TicketsContextValue = {
  tickets: Ticket[]
  issueTicket: (ticket: NewTicket) => Ticket
  listTicket: (ticketId: string, priceCents: number) => void
  unlistTicket: (ticketId: string) => void
  buyResale: (ticketId: string, buyerEmail: string) => Ticket | null
  checkIn: (ticketId: string) => void
}

export function ticketCode(ticket: Ticket): string {
  return ticket.id.slice(0, 8).toUpperCase()
}

export const TicketsContext = createContext<TicketsContextValue | null>(null)

export function useTickets(): TicketsContextValue {
  const value = useContext(TicketsContext)
  if (!value) {
    throw new Error('useTickets must be used inside <TicketsProvider>')
  }
  return value
}
