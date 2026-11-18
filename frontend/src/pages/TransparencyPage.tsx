import { useBoard } from '../board/context'
import { AppHeader } from '../components/AppHeader'
import { ASSOCIATION_NAME } from '../data/events'
import { useEvents } from '../events/context'
import { useExpenses } from '../expenses/context'
import { formatDate, formatPrice } from '../lib/format'
import { buildLedger, summarize, type EventLedger } from '../lib/ledger'
import { ReceiptCheck } from '../components/ReceiptCheck'
import { TreasurySummary } from '../components/TreasurySummary'
import { useTickets } from '../tickets/context'

function LedgerCard({ ledger }: { ledger: EventLedger }) {
  const { memberName } = useBoard()
  const title = ledger.event ? ledger.event.title : 'General'

  return (
    <section className="ledger-card">
      <div className="ledger-heading">
        <div className="board-event">
          {ledger.event && (
            <span className="color-dot" style={{ background: ledger.event.color }} />
          )}
          <div>
            <p className="batch-name">{title}</p>
            <p className="muted">
              {ledger.event ? formatDate(ledger.event.date) : 'Expenses not tied to an event'}
            </p>
          </div>
        </div>
        <span className={`ledger-net ${ledger.net < 0 ? 'negative' : 'positive'}`}>
          {ledger.net < 0 ? '−' : '+'}
          {formatPrice(Math.abs(ledger.net))}
        </span>
      </div>

      <table className="ledger-table">
        <tbody>
          {ledger.event && (
            <>
              <tr>
                <td>Ticket sales ({ledger.ticketsSold})</td>
                <td className="amount positive">+{formatPrice(ledger.ticketIncome)}</td>
              </tr>
              <tr>
                <td>Resale royalties ({ledger.resaleCount})</td>
                <td className="amount positive">+{formatPrice(ledger.royaltyIncome)}</td>
              </tr>
            </>
          )}
          {ledger.expenses.map((expense) => (
            <tr key={expense.id}>
              <td>
                {expense.description}
                <span className="ledger-sub">
                  {expense.category} · approved by{' '}
                  {expense.approvals.map(memberName).join(', ')}
                </span>
                <ReceiptCheck receipt={expense.receipt} />
              </td>
              <td className="amount negative">−{formatPrice(expense.amountCents)}</td>
            </tr>
          ))}
          {ledger.expenses.length === 0 && (
            <tr>
              <td className="muted">No approved expenses</td>
              <td className="amount muted">{formatPrice(0)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

export function TransparencyPage() {
  const { events } = useEvents()
  const { tickets } = useTickets()
  const { expenses } = useExpenses()
  const ledger = buildLedger(events, tickets, expenses)
  const summary = summarize([...ledger.events, ledger.general])

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Open accounts</h1>
        <p className="muted">
          Every income and every approved expense of {ASSOCIATION_NAME}, per event. Anyone can
          check it, and no one can change it after it is recorded.
        </p>

        <TreasurySummary summary={summary} />

        <h2 className="section-title">Per event</h2>
        <div className="ledger-list per-event">
          {ledger.events.map((item) => (
            <LedgerCard key={item.event!.id} ledger={item} />
          ))}
          {ledger.general.expenses.length > 0 && <LedgerCard ledger={ledger.general} />}
        </div>
      </main>
    </>
  )
}
