import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { FakeQrCode } from '../components/FakeQrCode'
import { EVENTS } from '../data/events'
import { formatDate, formatPrice } from '../lib/format'
import { useTickets, type Ticket, type TicketStatus } from '../tickets/context'

const QR_REFRESH_SECONDS = 30

const STATUS_LABELS: Record<TicketStatus, string> = {
  valid: 'Valid',
  listed: 'Listed for resale',
  used: 'Used',
  cancelled: 'Cancelled',
}

function useSecondsTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function TicketCard({ ticket, now }: { ticket: Ticket; now: number }) {
  const event = EVENTS.find((item) => item.id === ticket.eventId)
  const batch = event?.batches.find((item) => item.id === ticket.batchId)
  if (!event || !batch) return null

  const seconds = Math.floor(now / 1000)
  const timeSlot = Math.floor(seconds / QR_REFRESH_SECONDS)
  const refreshIn = QR_REFRESH_SECONDS - (seconds % QR_REFRESH_SECONDS)
  const showQr = ticket.status === 'valid'

  return (
    <article className="ticket-card">
      <div className="ticket-strip" style={{ background: event.color }} />
      <div className="ticket-info">
        <p className="event-date">{formatDate(event.date)}</p>
        <h2>{event.title}</h2>
        <p className="muted">{event.location}</p>
        <p className="ticket-meta">
          {batch.name} · {formatPrice(ticket.priceCents)}
        </p>
        <p className="ticket-id">#{ticket.id.slice(0, 8).toUpperCase()}</p>
        <span className={`badge status-${ticket.status}`}>{STATUS_LABELS[ticket.status]}</span>
      </div>
      {showQr && (
        <div className="ticket-qr">
          <FakeQrCode value={`${ticket.id}:${timeSlot}`} size={150} />
          <p className="hint">Refreshes in {refreshIn}s</p>
        </div>
      )}
    </article>
  )
}

export function MyTicketsPage() {
  const { user } = useAuth()
  const { tickets } = useTickets()
  const now = useSecondsTick()

  const mine = tickets
    .filter((ticket) => ticket.ownerEmail === user?.email)
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>My tickets</h1>
        <p className="muted">Show the QR code at the gate. It changes every 30 seconds.</p>

        {mine.length === 0 ? (
          <div className="empty-state">
            <p>You have no tickets yet.</p>
            <Link to="/" className="button-link">
              Browse events
            </Link>
          </div>
        ) : (
          <div className="ticket-list">
            {mine.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} now={now} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
