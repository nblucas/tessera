import { Link } from 'react-router'
import { useListings } from '../api/useListings'
import { AppHeader } from '../components/AppHeader'
import { ResaleList } from '../components/ResaleList'

export function ResalePage() {
  const listings = useListings()

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Resale</h1>
        <p className="muted">
          Tickets resold by other students, at or below the price cap set by the association. The
          ledger refuses any listing above the cap or by someone who does not own the ticket.
        </p>

        {listings === null ? (
          <p className="muted">Loading listings…</p>
        ) : listings.length === 0 ? (
          <div className="empty-state">
            <p>No tickets for resale right now.</p>
            <Link to="/" className="button-link">
              Browse events
            </Link>
          </div>
        ) : (
          <ResaleList listings={listings} showEvent />
        )}
      </main>
    </>
  )
}
