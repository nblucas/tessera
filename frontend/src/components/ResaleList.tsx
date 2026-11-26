import { useNavigate } from 'react-router'
import type { ResaleListing } from '../api/types'
import { formatDate, formatPrice } from '../lib/format'

type ResaleListProps = {
  listings: ResaleListing[]
  showEvent?: boolean
}

export function ResaleList({ listings, showEvent = false }: ResaleListProps) {
  const navigate = useNavigate()

  return (
    <ul className="batch-list resale-list">
      {listings.map((listing) => (
        <li key={listing.ticketId} className="batch-row">
          <div>
            {showEvent && <p className="event-date">{formatDate(listing.eventDate)}</p>}
            <p className="batch-name">{showEvent ? listing.eventTitle : listing.batchName}</p>
            <p className="muted">
              {showEvent && `${listing.batchName} · `}Face value {formatPrice(listing.faceValueCents)}
            </p>
          </div>
          <div className="batch-action">
            <span className="event-price">{formatPrice(listing.priceCents)}</span>
            {listing.isMine ? (
              <span className="badge">Your listing</span>
            ) : (
              <button type="button" onClick={() => navigate(`/resale/${listing.ticketId}/checkout`)}>
                Buy
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
