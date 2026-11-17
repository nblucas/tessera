import { Link } from 'react-router'
import type { Ticket } from '../tickets/context'

export function PaymentSuccess({ ticket, eventTitle }: { ticket: Ticket; eventTitle: string }) {
  return (
    <section className="checkout-panel checkout-success">
      <div className="success-icon">✓</div>
      <h2>Payment confirmed</h2>
      <p className="muted">Your ticket for {eventTitle} is ready.</p>
      <p className="ticket-id">Ticket #{ticket.id.slice(0, 8).toUpperCase()}</p>
      <Link to="/tickets" className="button-link">
        View my tickets
      </Link>
    </section>
  )
}
