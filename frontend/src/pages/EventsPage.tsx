import { AppHeader } from '../components/AppHeader'
import { ASSOCIATION_NAME, EVENTS, type Event } from '../data/events'
import { formatDate, formatPrice } from '../lib/format'

function availableBatches(event: Event) {
  return event.batches.filter((batch) => batch.sold < batch.quantity)
}

function EventCard({ event }: { event: Event }) {
  const available = availableBatches(event)
  const soldOut = available.length === 0
  const lowestPrice = Math.min(...available.map((batch) => batch.priceCents))

  return (
    <article className="event-card">
      <div className="event-cover" style={{ background: event.color }} />
      <div className="event-body">
        <p className="event-date">{formatDate(event.date)}</p>
        <h2>{event.title}</h2>
        <p className="muted">{event.location}</p>
        <div className="event-footer">
          {soldOut ? (
            <span className="badge">Sold out</span>
          ) : (
            <span className="event-price">From {formatPrice(lowestPrice)}</span>
          )}
        </div>
      </div>
    </article>
  )
}

export function EventsPage() {
  const events = [...EVENTS].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Events</h1>
        <p className="muted">Upcoming events from {ASSOCIATION_NAME}.</p>
        <div className="event-grid">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </main>
    </>
  )
}
