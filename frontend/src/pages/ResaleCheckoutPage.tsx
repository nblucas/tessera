import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { PaymentSuccess } from '../components/PaymentSuccess'
import { PixPayment } from '../components/PixPayment'
import { EVENTS } from '../data/events'
import { formatDate, formatPrice } from '../lib/format'
import { useTickets, type Ticket } from '../tickets/context'

export function ResaleCheckoutPage() {
  const { ticketId } = useParams()
  const { user } = useAuth()
  const { tickets, buyResale } = useTickets()
  const [ticket, setTicket] = useState<Ticket | null>(null)

  const listing = tickets.find((item) => item.id === ticketId)
  const event = EVENTS.find((item) => item.id === listing?.eventId)
  const batch = event?.batches.find((item) => item.id === listing?.batchId)

  if (ticket && event) {
    return (
      <>
        <AppHeader />
        <main className="page checkout">
          <PaymentSuccess ticket={ticket} eventTitle={event.title} />
        </main>
      </>
    )
  }

  if (
    !listing ||
    !event ||
    !batch ||
    !user ||
    listing.status !== 'listed' ||
    listing.listingPriceCents === undefined ||
    listing.ownerEmail === user.email
  ) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <Link to="/resale" className="back-link">
            ← Resale
          </Link>
          <h1>Ticket unavailable</h1>
          <p className="muted">This ticket is no longer for sale, or it is your own listing.</p>
        </main>
      </>
    )
  }

  const listingId = listing.id
  const buyerEmail = user.email
  const priceCents = listing.listingPriceCents

  function handlePaid() {
    setTicket(buyResale(listingId, buyerEmail))
  }

  return (
    <>
      <AppHeader />
      <main className="page checkout">
        <Link to="/resale" className="back-link">
          ← Resale
        </Link>

        <section className="checkout-summary">
          <p className="event-date">{formatDate(event.date)}</p>
          <h1>{event.title}</h1>
          <div className="summary-row">
            <span>{batch.name} · resale</span>
            <strong>{formatPrice(priceCents)}</strong>
          </div>
          <p className="hint resale-note">
            The seller's ticket is cancelled and a new one is issued to you.
          </p>
        </section>

        <PixPayment
          amountCents={priceCents}
          reference={`resale-${listingId.slice(0, 8)}`}
          onPaid={handlePaid}
        />
      </main>
    </>
  )
}
