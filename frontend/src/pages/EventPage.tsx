import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { ResaleList } from '../components/ResaleList'
import { SellerLinkBox } from '../components/SellerLinkBox'
import { useTickets } from '../tickets/context'
import { EVENTS, type Batch } from '../data/events'
import { findSeller, findSellerByEmail } from '../data/sellers'
import { formatDate, formatPrice } from '../lib/format'

function BatchRow({ batch, onBuy }: { batch: Batch; onBuy: () => void }) {
  const left = batch.quantity - batch.sold
  const soldOut = left <= 0

  return (
    <li className="batch-row">
      <div>
        <p className="batch-name">{batch.name}</p>
        <p className="muted">{soldOut ? 'Sold out' : `${left} left`}</p>
      </div>
      <div className="batch-action">
        <span className="event-price">{formatPrice(batch.priceCents)}</span>
        <button type="button" onClick={onBuy} disabled={soldOut}>
          Buy
        </button>
      </div>
    </li>
  )
}

export function EventPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { tickets } = useTickets()
  const [searchParams] = useSearchParams()
  const referrer = findSeller(searchParams.get('seller'))
  const currentSeller = findSellerByEmail(user?.email)
  const event = EVENTS.find((item) => item.id === eventId)
  const resale = tickets.filter(
    (ticket) => ticket.eventId === eventId && ticket.status === 'listed',
  )

  if (!event) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <Link to="/" className="back-link">
            ← All events
          </Link>
          <h1>Event not found</h1>
          <p className="muted">This event does not exist or was removed.</p>
        </main>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <main className="page">
        <Link to="/" className="back-link">
          ← All events
        </Link>
        <div className="event-hero" style={{ background: event.color }} />
        <p className="event-date">{formatDate(event.date)}</p>
        <h1>{event.title}</h1>
        <p className="muted">{event.location}</p>
        <p className="event-description">{event.description}</p>

        {currentSeller && <SellerLinkBox seller={currentSeller} eventId={event.id} />}

        <h2 className="section-title">Tickets</h2>
        {referrer && (
          <p className="referrer-note">
            You're buying through <strong>{referrer.name}</strong>'s link.
          </p>
        )}
        <ul className="batch-list">
          {event.batches.map((batch) => (
            <BatchRow
              key={batch.id}
              batch={batch}
              onBuy={() =>
                navigate(
                  `/events/${event.id}/checkout/${batch.id}${referrer ? `?seller=${referrer.id}` : ''}`,
                )
              }
            />
          ))}
        </ul>

        {resale.length > 0 && (
          <>
            <h2 className="section-title">Resale</h2>
            <ResaleList tickets={resale} currentEmail={user?.email} />
          </>
        )}
      </main>
    </>
  )
}
