import { useMemo, type ReactNode } from 'react'
import { api } from '../api/client'
import type { TicketView } from '../api/types'
import { useAccountData } from '../api/useAccountData'
import { useAuth } from '../auth/context'
import { TicketsContext, type Ticket } from './context'

const NO_TICKETS: TicketView[] = []
const loadTickets = () => api.get<TicketView[]>('/me/tickets')

// The signed-in user's tickets, as recorded on the ledger.
export function TicketsProvider({ children }: { children: ReactNode }) {
  const { user, sign } = useAuth()
  const { data: views, loading, refresh } = useAccountData(user?.id ?? null, loadTickets, NO_TICKETS)
  const tickets = useMemo<Ticket[]>(
    () =>
      views.map((view) => ({
        id: view.ticketId,
        eventId: view.eventId,
        batchId: view.batchId,
        ownerEmail: user?.email ?? '',
        priceCents: view.priceCents,
        purchasedAt: view.issuedAt,
        status: view.status,
        faceValueCents: view.faceValueCents,
        maxResaleCents: view.maxResaleCents,
        resaleCapPercent: view.resaleCapPercent,
        listingPriceCents: view.listingPriceCents ?? undefined,
      })),
    [views, user?.email],
  )

  async function listTicket(ticketId: string, priceCents: number) {
    const action = await sign('TicketListed', { ticketId, priceCents })
    await api.post(`/tickets/${ticketId}/listing`, { action })
    await refresh()
  }

  async function unlistTicket(ticketId: string) {
    const action = await sign('ListingCancelled', { ticketId })
    await api.post(`/tickets/${ticketId}/listing/cancel`, { action })
    await refresh()
  }

  function checkIn(): never {
    throw new Error('Gate check-in is a roadmap feature the backend does not support yet.')
  }

  return (
    <TicketsContext.Provider value={{ tickets, loading, refresh, listTicket, unlistTicket, checkIn }}>
      {children}
    </TicketsContext.Provider>
  )
}
