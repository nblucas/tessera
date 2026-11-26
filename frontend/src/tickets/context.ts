import { createContext, useContext } from 'react'

// valid: usable at the entrance and resellable; listed: offered for resale; resold: replaced
// by the buyer's ticket; revoked: its payment was reversed by the bank. used and cancelled
// belong to the gate roadmap feature.
export type TicketStatus = 'valid' | 'listed' | 'resold' | 'revoked' | 'used' | 'cancelled'

export type Ticket = {
  id: string
  eventId: string
  batchId: string
  ownerEmail: string
  priceCents: number
  purchasedAt: string
  status: TicketStatus
  faceValueCents: number
  maxResaleCents: number
  resaleCapPercent: number
  listingPriceCents?: number
  // Roadmap fields (sellers, gate); the backend does not provide them yet.
  resoldFromId?: string
  sellerId?: string
  commissionCents?: number
  usedAt?: string
}

export type TicketsContextValue = {
  tickets: Ticket[]
  loading: boolean
  refresh: () => Promise<void>
  // Resale: signed by the ticket's owner and checked by the ledger (owner, cap, status).
  listTicket: (ticketId: string, priceCents: number) => Promise<void>
  unlistTicket: (ticketId: string) => Promise<void>
  // Gate roadmap feature, not supported by the backend yet.
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
