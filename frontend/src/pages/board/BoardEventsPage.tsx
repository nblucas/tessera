import { Link } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { BoardTabs } from '../../components/BoardTabs'
import { useEvents } from '../../events/context'
import { formatDate, formatPrice } from '../../lib/format'

export function BoardEventsPage() {
  const { events } = useEvents()
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      <AppHeader />
      <main className="page">
        <div className="page-heading">
          <div>
            <h1>Board · Events</h1>
            <p className="muted">Create events and manage their ticket batches.</p>
          </div>
          <Link to="/board/events/new" className="button-link">
            New event
          </Link>
        </div>
        <BoardTabs />

        <ul className="batch-list board-list">
          {sorted.map((event) => {
            const sold = event.batches.reduce((sum, batch) => sum + batch.sold, 0)
            const capacity = event.batches.reduce((sum, batch) => sum + batch.quantity, 0)
            const revenue = event.batches.reduce(
              (sum, batch) => sum + batch.sold * batch.priceCents,
              0,
            )
            return (
              <li key={event.id} className="batch-row">
                <div className="board-event">
                  <span className="color-dot" style={{ background: event.color }} />
                  <div>
                    <p className="batch-name">{event.title}</p>
                    <p className="muted">
                      {formatDate(event.date)} · {event.batches.length} batches · {sold}/
                      {capacity} sold · {formatPrice(revenue)}
                    </p>
                  </div>
                </div>
                <Link to={`/board/events/${event.id}`} className="button-link secondary-link">
                  Edit
                </Link>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
