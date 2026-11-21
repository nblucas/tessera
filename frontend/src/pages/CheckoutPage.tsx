import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, errorMessage } from '../api/client'
import type { Order } from '../api/types'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { PaymentSuccess } from '../components/PaymentSuccess'
import { PixPayment } from '../components/PixPayment'
import { useEvents } from '../events/context'
import { FEATURES } from '../features'
import { useSellers } from '../sellers/context'
import { formatDate, formatPrice } from '../lib/format'
import { useTickets } from '../tickets/context'

const POLL_MS = 2000
const FINAL_STATUSES = new Set(['issued', 'expired', 'failed', 'refunded'])

export function CheckoutPage() {
  const { eventId, batchId } = useParams()
  const [searchParams] = useSearchParams()
  const { findSeller } = useSellers()
  const seller = FEATURES.sellers ? findSeller(searchParams.get('seller')) : undefined
  const { config } = useAuth()
  const { findEvent, loading, refresh: refreshEvents } = useEvents()
  const { refresh: refreshTickets } = useTickets()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const event = findEvent(eventId)
  const batch = event?.batches.find((item) => item.id === batchId)

  // Creating the order reserves a ticket until the Pix charge expires.
  const createOrder = useCallback(async () => {
    setError(null)
    try {
      setOrder(await api.post<Order>('/orders', { eventId, batchId }))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [eventId, batchId])

  useEffect(() => {
    if (started.current || !batch || batch.available <= 0) return
    started.current = true
    createOrder()
  }, [batch, createOrder])

  // Without demo mode the payment arrives from the bank, so keep checking the order.
  useEffect(() => {
    if (!order || FINAL_STATUSES.has(order.status)) return
    const timer = setInterval(async () => {
      setOrder(await api.get<Order>(`/orders/${order.id}`))
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [order])

  useEffect(() => {
    if (order?.status === 'issued') {
      refreshTickets()
      refreshEvents()
    }
  }, [order?.status, refreshTickets, refreshEvents])

  const simulatePayment = useCallback(async () => {
    if (!order) return
    try {
      setOrder(await api.post<Order>(`/demo/orders/${order.id}/pay`))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [order])

  if (loading && !event) return <AppHeader />

  if (!event || !batch || (!order && batch.available <= 0)) {
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

  return (
    <>
      <AppHeader />
      <main className="page checkout">
        {order?.status !== 'issued' && (
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

        {error && <p className="error">{error}</p>}

        {order?.status === 'issued' && order.ticketId && (
          <PaymentSuccess ticketId={order.ticketId} eventTitle={event.title} />
        )}
        {order?.status === 'paid' && <p className="muted">Payment received. Issuing your ticket…</p>}
        {(order?.status === 'refunded' || order?.status === 'failed') && (
          <p className="error">
            We could not issue your ticket, so the payment is being refunded.
            {order.failureReason && ` (${order.failureReason})`}
          </p>
        )}
        {order?.status === 'expired' && (
          <section className="checkout-panel">
            <p className="muted">This Pix charge expired before it was paid.</p>
            <button type="button" onClick={createOrder}>
              Try again
            </button>
          </section>
        )}
        {order?.status === 'pending_payment' && (
          <PixPayment
            amountCents={order.priceCents}
            reference={order.id}
            code={order.pixCopyPaste}
            canSimulate={config?.demoMode ?? false}
            onPaid={simulatePayment}
          />
        )}
      </main>
    </>
  )
}
