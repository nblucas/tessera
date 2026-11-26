import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { FakeQrCode } from '../components/FakeQrCode'
import { ResaleForm } from '../components/ResaleForm'
import { useEvents } from '../events/context'
import { FEATURES } from '../features'
import { formatDate, formatPrice } from '../lib/format'
import { errorMessage } from '../api/client'
import { useTickets, type Ticket, type TicketStatus } from '../tickets/context'

const QR_REFRESH_SECONDS = 30

const STATUS_LABELS: Record<TicketStatus, string> = {
  valid: 'Valid',
  listed: 'Listed for resale',
  resold: 'Resold',
  revoked: 'Revoked: payment reversed by the bank',
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
  const { listTicket, unlistTicket } = useTickets()
  const [reselling, setReselling] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setReselling(false)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const { findEvent } = useEvents()

  const event = findEvent(ticket.eventId)
  const batch = event?.batches.find((item) => item.id === ticket.batchId)
  if (!event || !batch) return null

  const seconds = Math.floor(now / 1000)
  const timeSlot = Math.floor(seconds / QR_REFRESH_SECONDS)
  const refreshIn = QR_REFRESH_SECONDS - (seconds % QR_REFRESH_SECONDS)
  const isValid = ticket.status === 'valid'
  const isListed = ticket.status === 'listed'
  const isResold = ticket.status === 'resold'

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
        <span className={`badge status-${ticket.status}`}>
          {STATUS_LABELS[ticket.status]}
          {isListed &&
            ticket.listingPriceCents !== undefined &&
            ` · ${formatPrice(ticket.listingPriceCents)}`}
        </span>

        {FEATURES.resale && isValid && !reselling && (
          <button
            type="button"
            className="secondary ticket-action"
            onClick={() => setReselling(true)}
          >
            Resell
          </button>
        )}
        {FEATURES.resale && isListed && (
          <>
            <p className="hint">This ticket can't be used at the gate while it is listed.</p>
            <button
              type="button"
              className="secondary ticket-action"
              disabled={busy}
              onClick={() => run(() => unlistTicket(ticket.id))}
            >
              Cancel listing
            </button>
          </>
        )}
        {FEATURES.resale && isValid && reselling && (
          <ResaleForm
            faceValueCents={ticket.faceValueCents}
            capPercent={ticket.resaleCapPercent}
            maxPriceCents={ticket.maxResaleCents}
            onSubmit={(priceCents) => run(() => listTicket(ticket.id, priceCents))}
            onCancel={() => setReselling(false)}
          />
        )}
        {error && <p className="error">{error}</p>}
        {isResold && <p className="hint">Sold to another student. Your share was paid by Pix.</p>}
      </div>
      {isValid && (
        <div className="ticket-qr">
          <FakeQrCode
            value={FEATURES.gate ? `${ticket.id}:${timeSlot}` : ticket.id}
            size={150}
          />
          {FEATURES.gate && <p className="hint">Refreshes in {refreshIn}s</p>}
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
        <p className="muted">
          Show the QR code at the entrance.{FEATURES.gate && ' It changes every 30 seconds.'}
        </p>

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
