import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { useEvents } from '../events/context'
import { useSellers } from '../sellers/context'
import { formatDate, formatPrice } from '../lib/format'
import { useTickets } from '../tickets/context'

export function MySalesPage() {
  const { user } = useAuth()
  const { tickets } = useTickets()
  const { findEvent } = useEvents()
  const { findSellerByEmail } = useSellers()
  const seller = findSellerByEmail(user?.email ?? undefined)

  if (!seller) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <h1>My sales</h1>
          <p className="muted">You are not registered as a seller for this association.</p>
        </main>
      </>
    )
  }

  const sales = tickets
    .filter((ticket) => ticket.sellerId === seller.id)
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
  const totalSales = sales.reduce((sum, ticket) => sum + ticket.priceCents, 0)
  const totalCommission = sales.reduce((sum, ticket) => sum + (ticket.commissionCents ?? 0), 0)

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>My sales</h1>
        <p className="muted">
          Tickets sold through your links. You earn {seller.commissionPercent}% on each sale.
        </p>

        <div className="stat-grid">
          <div className="stat">
            <p className="stat-label">Tickets sold</p>
            <p className="stat-value">{sales.length}</p>
          </div>
          <div className="stat">
            <p className="stat-label">Total sales</p>
            <p className="stat-value">{formatPrice(totalSales)}</p>
          </div>
          <div className="stat">
            <p className="stat-label">Commission earned</p>
            <p className="stat-value stat-accent">{formatPrice(totalCommission)}</p>
          </div>
        </div>

        <h2 className="section-title">Sales</h2>
        {sales.length === 0 ? (
          <div className="empty-state">
            <p>No sales yet. Share your link from any event page.</p>
          </div>
        ) : (
          <ul className="batch-list">
            {sales.map((ticket) => {
              const event = findEvent(ticket.eventId)
              const batch = event?.batches.find((item) => item.id === ticket.batchId)
              return (
                <li key={ticket.id} className="batch-row">
                  <div>
                    <p className="batch-name">{event?.title}</p>
                    <p className="muted">
                      {batch?.name} · {formatDate(ticket.purchasedAt)} · #
                      {ticket.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <div className="sale-amounts">
                    <span className="muted">{formatPrice(ticket.priceCents)}</span>
                    <span className="event-price">
                      +{formatPrice(ticket.commissionCents ?? 0)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <p className="hint sales-note">
          Commissions are paid by the board at the end of each event.
        </p>
      </main>
    </>
  )
}
