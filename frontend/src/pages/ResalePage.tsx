import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { ResaleList } from '../components/ResaleList'
import { useTickets } from '../tickets/context'

export function ResalePage() {
  const { user } = useAuth()
  const { tickets } = useTickets()
  const listed = tickets.filter((ticket) => ticket.status === 'listed')

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Resale</h1>
        <p className="muted">
          Tickets resold by other students, at or below the price cap set by the association.
        </p>

        {listed.length === 0 ? (
          <div className="empty-state">
            <p>No tickets for resale right now.</p>
            <Link to="/" className="button-link">
              Browse events
            </Link>
          </div>
        ) : (
          <ResaleList tickets={listed} currentEmail={user?.email ?? undefined} showEvent />
        )}
      </main>
    </>
  )
}
