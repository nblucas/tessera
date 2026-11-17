import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { FakeQrCode } from '../components/FakeQrCode'
import { EVENTS } from '../data/events'
import { formatDate, formatPrice } from '../lib/format'
import { useTickets, type Ticket } from '../tickets/context'

type Step = 'pending' | 'confirming' | 'paid'

const CONFIRMATION_DELAY_MS = 2000

function pixCode(eventId: string, batchId: string, priceCents: number): string {
  const amount = (priceCents / 100).toFixed(2)
  return `00020126580014br.gov.bcb.pix0136tessera-${eventId}-${batchId}5204000053039865406${amount}5802BR5907TESSERA6009SAO PAULO6304A1B2`
}

export function CheckoutPage() {
  const { eventId, batchId } = useParams()
  const { user } = useAuth()
  const { issueTicket } = useTickets()
  const [step, setStep] = useState<Step>('pending')
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [copied, setCopied] = useState(false)

  const event = EVENTS.find((item) => item.id === eventId)
  const batch = event?.batches.find((item) => item.id === batchId)

  useEffect(() => {
    if (step !== 'confirming' || !event || !batch || !user) return
    const timer = setTimeout(() => {
      setTicket(
        issueTicket({
          eventId: event.id,
          batchId: batch.id,
          ownerEmail: user.email,
          priceCents: batch.priceCents,
        }),
      )
      setStep('paid')
    }, CONFIRMATION_DELAY_MS)
    return () => clearTimeout(timer)
  }, [step, event, batch, user, issueTicket])

  if (!event || !batch || batch.sold >= batch.quantity) {
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

  const code = pixCode(event.id, batch.id, batch.priceCents)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <AppHeader />
      <main className="page checkout">
        {step !== 'paid' && (
          <Link to={`/events/${event.id}`} className="back-link">
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
        </section>

        {step === 'paid' && ticket ? (
          <section className="checkout-panel checkout-success">
            <div className="success-icon">✓</div>
            <h2>Payment confirmed</h2>
            <p className="muted">Your ticket for {event.title} is ready.</p>
            <p className="ticket-id">Ticket #{ticket.id.slice(0, 8).toUpperCase()}</p>
            <Link to="/" className="button-link">
              Back to events
            </Link>
          </section>
        ) : (
          <section className="checkout-panel">
            <h2>Pay with Pix</h2>
            <p className="muted">Scan the QR code with your bank app, or copy the Pix code.</p>
            <div className="qr-wrapper">
              <FakeQrCode value={code} size={220} />
            </div>
            <div className="pix-code">
              <code>{code}</code>
              <button type="button" className="secondary" onClick={copyCode}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              className="checkout-confirm"
              onClick={() => setStep('confirming')}
              disabled={step === 'confirming'}
            >
              {step === 'confirming' ? 'Confirming payment…' : 'Simulate payment'}
            </button>
            <p className="hint">Demo mode: no real payment is made.</p>
          </section>
        )}
      </main>
    </>
  )
}
