import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { PaymentSuccess } from '../components/PaymentSuccess'
import { PixPayment } from '../components/PixPayment'
import { EVENTS } from '../data/events'
import { commissionFor, findSeller } from '../data/sellers'
import { formatDate, formatPrice } from '../lib/format'
import { useTickets, type Ticket } from '../tickets/context'

export function CheckoutPage() {
  const { eventId, batchId } = useParams()
  const [searchParams] = useSearchParams()
  const seller = findSeller(searchParams.get('seller'))
  const { user } = useAuth()
  const { issueTicket } = useTickets()
  const [ticket, setTicket] = useState<Ticket | null>(null)

  const event = EVENTS.find((item) => item.id === eventId)
  const batch = event?.batches.find((item) => item.id === batchId)

  if (!event || !batch || !user || batch.sold >= batch.quantity) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <Link to="/" className="back-link">
            ← All events
          </Link>
          <h1>Ticket unavailable</h1>
          <p className="muted">This batch does not exist or is sold out.</p>
        </main>
      </>
    )
  }

  function handlePaid() {
    if (!event || !batch || !user) return
    setTicket(
      issueTicket({
        eventId: event.id,
        batchId: batch.id,
        ownerEmail: user.email,
        priceCents: batch.priceCents,
        sellerId: seller?.id,
        commissionCents: seller ? commissionFor(seller, batch.priceCents) : undefined,
      }),
    )
  }

  return (
    <>
      <AppHeader />
      <main className="page checkout">
        {!ticket && (
          <Link
            to={`/events/${event.id}${seller ? `?seller=${seller.id}` : ''}`}
            className="back-link"
          >
            ← Back to event
          </Link>
        )}

        <section className="checkout-summary">
          <p className="event-date">{formatDate(event.date)}</p>
          <h1>{event.title}</h1>
          <div className="summary-row">
            <span>{batch.name}</span>
            <strong>{formatPrice(batch.priceCents)}</strong>
          </div>
          {seller && <p className="hint resale-note">Sold by {seller.name}</p>}
        </section>

        {ticket ? (
          <PaymentSuccess ticket={ticket} eventTitle={event.title} />
        ) : (
          <PixPayment
            amountCents={batch.priceCents}
            reference={`${event.id}-${batch.id}`}
            onPaid={handlePaid}
          />
        )}
      </main>
    </>
  )
}
