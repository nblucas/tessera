import { useState, type FormEvent } from 'react'
import { AppHeader } from '../components/AppHeader'
import { useEvents } from '../events/context'
import { useTickets, ticketCode, type Ticket } from '../tickets/context'

type ScanResult = {
  code: string
  outcome: 'valid' | 'used' | 'invalid'
  reason: string
  at: string
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const OUTCOME_LABELS: Record<ScanResult['outcome'], string> = {
  valid: 'Valid',
  used: 'Already used',
  invalid: 'Invalid',
}

function evaluate(ticket: Ticket | undefined, eventId: string): Omit<ScanResult, 'code' | 'at'> {
  if (!ticket) return { outcome: 'invalid', reason: 'No ticket with this code.' }
  if (ticket.eventId !== eventId) {
    return { outcome: 'invalid', reason: 'This ticket is for another event.' }
  }
  if (ticket.status === 'used') {
    const when = ticket.usedAt ? ` at ${timeFormatter.format(new Date(ticket.usedAt))}` : ''
    return { outcome: 'used', reason: `Checked in${when}.` }
  }
  if (ticket.status === 'listed') {
    return { outcome: 'invalid', reason: 'This ticket is listed for resale.' }
  }
  if (ticket.status === 'cancelled') {
    return { outcome: 'invalid', reason: 'This ticket was cancelled (resold to someone else).' }
  }
  return { outcome: 'valid', reason: 'Let them in.' }
}

export function GatePage() {
  const { events } = useEvents()
  const { tickets, checkIn } = useTickets()
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date))

  const [eventId, setEventId] = useState(sortedEvents[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])

  const eventTickets = tickets.filter((ticket) => ticket.eventId === eventId)
  const checkedIn = eventTickets.filter((ticket) => ticket.status === 'used').length
  const admissible = eventTickets.filter(
    (ticket) => ticket.status === 'valid' || ticket.status === 'used',
  ).length

  function scan(rawCode: string) {
    const normalized = rawCode.trim().replace(/^#/, '').toUpperCase()
    if (!normalized) return
    const ticket = tickets.find((item) => ticketCode(item) === normalized)
    const evaluation = evaluate(ticket, eventId)
    if (evaluation.outcome === 'valid' && ticket) {
      checkIn(ticket.id)
    }
    const entry: ScanResult = { ...evaluation, code: normalized, at: new Date().toISOString() }
    setResult(entry)
    setHistory((current) => [entry, ...current].slice(0, 10))
    setCode('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    scan(code)
  }

  return (
    <>
      <AppHeader />
      <main className="page gate">
        <h1>Gate</h1>
        <p className="muted">Scan tickets at the entrance. Valid tickets are marked as used.</p>

        <div className="field gate-event">
          <label htmlFor="gate-event">Event</label>
          <select
            id="gate-event"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value)
              setResult(null)
              setHistory([])
            }}
          >
            {sortedEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
          <p className="hint gate-count">
            {checkedIn} of {admissible} tickets checked in
          </p>
        </div>

        <form className="gate-scan" onSubmit={handleSubmit} noValidate>
          <label htmlFor="gate-code">Ticket code</label>
          <div className="pix-code">
            <input
              id="gate-code"
              placeholder="#ABCD1234"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <button type="submit">Scan</button>
          </div>
        </form>

        {eventTickets.length > 0 && (
          <div className="field gate-demo">
            <label htmlFor="gate-demo">Demo: simulate a scan</label>
            <select
              id="gate-demo"
              value=""
              onChange={(e) => {
                if (e.target.value) scan(e.target.value)
              }}
            >
              <option value="">Pick a ticket for this event…</option>
              {eventTickets.map((ticket) => (
                <option key={ticket.id} value={ticketCode(ticket)}>
                  #{ticketCode(ticket)} · {ticket.ownerEmail} · {ticket.status}
                </option>
              ))}
            </select>
          </div>
        )}

        {result && (
          <section className={`gate-result gate-${result.outcome}`}>
            <p className="gate-outcome">
              {result.outcome === 'valid' ? '✓' : '✗'} {OUTCOME_LABELS[result.outcome]}
            </p>
            <p>#{result.code}</p>
            <p>{result.reason}</p>
          </section>
        )}

        {history.length > 0 && (
          <>
            <h2 className="section-title">Recent scans</h2>
            <ul className="gate-history">
              {history.map((entry) => (
                <li key={entry.at}>
                  <span className={`badge gate-badge-${entry.outcome}`}>
                    {OUTCOME_LABELS[entry.outcome]}
                  </span>
                  <span className="hash">#{entry.code}</span>
                  <span className="muted">{timeFormatter.format(new Date(entry.at))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  )
}
