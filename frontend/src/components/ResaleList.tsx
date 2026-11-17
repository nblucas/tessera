import { useNavigate } from 'react-router'
import { useEvents } from '../events/context'
import { formatDate, formatPrice } from '../lib/format'
import type { Ticket } from '../tickets/context'

type ResaleListProps = {
  tickets: Ticket[]
  currentEmail?: string
  showEvent?: boolean
}

export function ResaleList({ tickets, currentEmail, showEvent = false }: ResaleListProps) {
  const navigate = useNavigate()
  const { findEvent } = useEvents()

  return (
    <ul className="batch-list resale-list">
      {tickets.map((ticket) => {
        const event = findEvent(ticket.eventId)
        const batch = event?.batches.find((item) => item.id === ticket.batchId)
        if (!event || !batch || ticket.listingPriceCents === undefined) return null
        const isMine = ticket.ownerEmail === currentEmail

        return (
          <li key={ticket.id} className="batch-row">
            <div>
              {showEvent && <p className="event-date">{formatDate(event.date)}</p>}
              <p className="batch-name">{showEvent ? event.title : batch.name}</p>
              <p className="muted">
                {showEvent && `${batch.name} · `}Face value {formatPrice(batch.priceCents)}
              </p>
            </div>
            <div className="batch-action">
              <span className="event-price">{formatPrice(ticket.listingPriceCents)}</span>
              {isMine ? (
                <span className="badge">Your listing</span>
              ) : (
                <button type="button" onClick={() => navigate(`/resale/${ticket.id}/checkout`)}>
                  Buy
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
