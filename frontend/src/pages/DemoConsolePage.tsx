import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, errorMessage } from '../api/client'
import type { Order, PaymentEvent } from '../api/types'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { formatPrice } from '../lib/format'

const REFRESH_MS = 2000

const OUTCOME_LABELS: Record<PaymentEvent['outcome'], string> = {
  accepted: 'Payment accepted',
  duplicate: 'Duplicate callback ignored',
  wrong_amount: 'Wrong amount: refunded',
  unknown_charge: 'Unknown charge ignored',
  reversal: 'Reversal (MED) received',
  own_refund: 'Our refund confirmed',
}

const short = (value: string | null) => (value ? `${value.slice(0, 8)}…` : '—')

// Demo only: plays the bank's part, so the presenter can show what happens with a duplicate
// callback, a failed settlement, a reversed payment or an invalid resale.
export function DemoConsolePage() {
  const { sign } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [events, setEvents] = useState<PaymentEvent[]>([])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [nextOrders, nextEvents] = await Promise.all([
      api.get<Order[]>('/demo/orders'),
      api.get<PaymentEvent[]>('/demo/payment-events'),
    ])
    setOrders(nextOrders)
    setEvents(nextEvents)
  }, [])

  useEffect(() => {
    let active = true
    const tick = () => {
      load().catch(() => undefined)
    }
    const first = setTimeout(tick, 0)
    const timer = setInterval(() => active && tick(), REFRESH_MS)
    return () => {
      active = false
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      setMessage({ ok: true, text: `${label}: done.` })
    } catch (cause) {
      setMessage({ ok: false, text: `${label}: refused. ${errorMessage(cause)}` })
    } finally {
      setBusy(false)
      await load().catch(() => undefined)
    }
  }

  // Signs a listing as the signed-in user for a ticket they may not own: the ledger decides.
  async function tryToList(order: Order, priceCents: number) {
    const action = await sign('TicketListed', { ticketId: order.ticketId!, priceCents })
    await api.post(`/tickets/${order.ticketId}/listing`, { action })
  }

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Demo console</h1>
        <p className="muted">
          Plays the bank's part. Each button sends what a real Pix provider would send, through the
          same signed webhook. Watch the results in <Link to="/transparency">Open accounts</Link>.
        </p>
        {message && <p className={message.ok ? 'verify-result positive' : 'error'}>{message.text}</p>}

        <h2 className="section-title">Recent orders</h2>
        {orders.length === 0 ? (
          <p className="muted">No orders yet. Buy a ticket first.</p>
        ) : (
          <ul className="batch-list">
            {orders.map((order) => (
              <li key={order.id} className="expense-row">
                <div className="expense-main">
                  <div>
                    <p className="batch-name">
                      {order.kind === 'resale' ? 'Resale' : 'Ticket'} · {order.eventId} ·{' '}
                      {formatPrice(order.priceCents)}
                    </p>
                    <p className="muted">
                      Order {short(order.id)} · payment ref {short(order.paymentRef)}
                      {order.ticketId && ` · ticket #${order.ticketId.slice(0, 8).toUpperCase()}`}
                      {order.failureReason && ` · ${order.failureReason}`}
                    </p>
                  </div>
                  <span className={`badge status-${order.status}`}>{order.status.replace('_', ' ')}</span>
                </div>
                <div className="expense-actions">
                  {order.status === 'pending_payment' && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run('Pay', () => api.post(`/demo/orders/${order.id}/pay`))}
                      >
                        Pay
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          run('Pay with a failed settlement', () =>
                            api.post(`/demo/orders/${order.id}/pay`, { failSettlement: true }),
                          )
                        }
                      >
                        Pay, settlement fails
                      </button>
                    </>
                  )}
                  {order.paymentRef && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        run('Resend the payment webhook', () => api.post(`/demo/orders/${order.id}/resend-webhook`))
                      }
                    >
                      Resend webhook (duplicate)
                    </button>
                  )}
                  {order.status === 'issued' && (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => run('Reverse the payment', () => api.post(`/demo/orders/${order.id}/reverse`))}
                      >
                        Reverse payment (MED)
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => run('List this ticket as me', () => tryToList(order, order.priceCents))}
                      >
                        Try to resell it as me
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="section-title">Pix notifications received</h2>
        {events.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <table className="ledger-table">
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    {OUTCOME_LABELS[event.outcome]}
                    <span className="ledger-sub">
                      {new Date(event.receivedAt).toLocaleTimeString()} · txid {short(event.txid)} · e2eid{' '}
                      {short(event.e2eid)}
                      {event.detail && ` · ${event.detail}`}
                    </span>
                  </td>
                  <td className="amount">{formatPrice(event.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  )
}
