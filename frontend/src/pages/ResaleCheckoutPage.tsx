import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, errorMessage } from '../api/client'
import type { Order } from '../api/types'
import { useListings } from '../api/useListings'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { PaymentSuccess } from '../components/PaymentSuccess'
import { PixPayment } from '../components/PixPayment'
import { formatDate, formatPrice } from '../lib/format'
import { resaleSplit } from '../lib/resale'
import { useTickets } from '../tickets/context'

const POLL_MS = 2000
const FINAL_STATUSES = new Set(['issued', 'expired', 'failed', 'refunded', 'reversed'])

export function ResaleCheckoutPage() {
  const { ticketId } = useParams()
  const { config } = useAuth()
  const { refresh: refreshTickets } = useTickets()
  const listings = useListings()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const listing = listings?.find((item) => item.ticketId === ticketId)

  // Creating the order holds the listing until the Pix charge expires.
  useEffect(() => {
    if (started.current || !listing || listing.isMine) return
    started.current = true
    api
      .post<Order>('/orders', { listedTicketId: listing.ticketId })
      .then(setOrder)
      .catch((cause: unknown) => setError(errorMessage(cause)))
  }, [listing])

  useEffect(() => {
    if (!order || FINAL_STATUSES.has(order.status)) return
    const timer = setInterval(async () => {
      setOrder(await api.get<Order>(`/orders/${order.id}`))
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [order])

  useEffect(() => {
    if (order?.status === 'issued') refreshTickets()
  }, [order?.status, refreshTickets])

  const simulatePayment = useCallback(async () => {
    if (!order) return
    try {
      setOrder(await api.post<Order>(`/demo/orders/${order.id}/pay`))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [order])

  if (listings === null) return <AppHeader />

  if (!order && (!listing || listing.isMine)) {
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

  const priceCents = order?.priceCents ?? listing!.priceCents
  const split = resaleSplit(priceCents)

  return (
    <>
      <AppHeader />
      <main className="page checkout">
        <Link to="/resale" className="back-link">
          ← Resale
        </Link>

        {listing && (
          <section className="checkout-summary">
            <p className="event-date">{formatDate(listing.eventDate)}</p>
            <h1>{listing.eventTitle}</h1>
            <div className="summary-row">
              <span>{listing.batchName} · resale</span>
              <strong>{formatPrice(priceCents)}</strong>
            </div>
            <p className="hint resale-note">
              The seller's ticket is cancelled and a new one is issued to you. The association
              receives {formatPrice(split.association)} and the seller {formatPrice(split.reseller)}.
            </p>
          </section>
        )}

        {error && <p className="error">{error}</p>}
        {order?.status === 'issued' && order.ticketId && (
          <PaymentSuccess ticketId={order.ticketId} eventTitle={listing?.eventTitle ?? 'this event'} />
        )}
        {order?.status === 'paid' && <p className="muted">Payment received. Settling the resale…</p>}
        {(order?.status === 'refunded' || order?.status === 'failed') && (
          <p className="error">
            The resale could not be settled, so the payment is being refunded.
            {order.failureReason && ` (${order.failureReason})`}
          </p>
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
