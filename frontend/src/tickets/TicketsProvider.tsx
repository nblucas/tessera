import { useMemo, type ReactNode } from 'react'
import { api } from '../api/client'
import { useAccountData } from '../api/useAccountData'
import type { TicketView } from '../api/types'
import { useAuth } from '../auth/context'
import { TicketsContext, type Ticket } from './context'

function notSupported(): never {
  throw new Error('Resale and gate check-in are roadmap features the backend does not support yet.')
}

// The signed-in user's tickets, as issued on the ledger.
const NO_TICKETS: TicketView[] = []
const loadTickets = () => api.get<TicketView[]>('/me/tickets')

export function TicketsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
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
        status: 'valid',
      })),
    [views, user?.email],
  )

  return (
    <TicketsContext.Provider
      value={{
        tickets,
        loading,
        refresh,
        listTicket: notSupported,
        unlistTicket: notSupported,
        buyResale: notSupported,
        checkIn: notSupported,
      }}
    >
      {children}
    </TicketsContext.Provider>
  )
}
