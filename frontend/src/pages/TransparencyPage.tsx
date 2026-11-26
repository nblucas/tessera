import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { Accounts, EventLedger } from '../api/types'
import { useAuth } from '../auth/context'
import { AppHeader } from '../components/AppHeader'
import { PaymentTrust } from '../components/PaymentTrust'
import { ReceiptCheck } from '../components/ReceiptCheck'
import { TreasurySummary } from '../components/TreasurySummary'
import { formatDate, formatPrice } from '../lib/format'

type LedgerCardProps = {
  ledger: EventLedger
  event?: { title: string; date: string; color: string }
}

function LedgerCard({ ledger, event }: LedgerCardProps) {
  return (
    <section className="ledger-card">
      <div className="ledger-heading">
        <div className="board-event">
          {event && <span className="color-dot" style={{ background: event.color }} />}
          <div>
            <p className="batch-name">{event ? event.title : 'General'}</p>
            <p className="muted">{event ? formatDate(event.date) : 'Expenses not tied to an event'}</p>
          </div>
        </div>
        <span className={`ledger-net ${ledger.net < 0 ? 'negative' : 'positive'}`}>
          {ledger.net < 0 ? '−' : '+'}
          {formatPrice(Math.abs(ledger.net))}
        </span>
      </div>

      <table className="ledger-table">
        <tbody>
          {event && (
            <tr>
              <td>Ticket sales ({ledger.ticketsSold})</td>
              <td className="amount positive">+{formatPrice(ledger.ticketIncome)}</td>
            </tr>
          )}
          {event && ledger.resaleCount > 0 && (
            <tr>
              <td>Resale royalties ({ledger.resaleCount})</td>
              <td className="amount positive">+{formatPrice(ledger.royaltyIncome)}</td>
            </tr>
          )}
          {event && ledger.reversalCount > 0 && (
            <tr>
              <td>
                Payments reversed by the bank ({ledger.reversalCount})
                <span className="ledger-sub">Each reversed ticket was revoked and its place put back on sale</span>
              </td>
              <td className="amount negative">−{formatPrice(ledger.reversals)}</td>
            </tr>
          )}
          {ledger.expenses.map((expense) => (
            <tr key={expense.id}>
              <td>
                {expense.description}
                <span className="ledger-sub">
                  {expense.category} · approved by {expense.approvedBy.join(', ')}
                </span>
                <ReceiptCheck expense={expense} />
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
  const { config } = useAuth()
  const [accounts, setAccounts] = useState<Accounts | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Accounts>('/accounts')
      .then(setAccounts)
      .catch((cause: unknown) => setError(errorMessage(cause)))
  }, [])

  return (
    <>
      <AppHeader />
      <main className="page">
        <h1>Open accounts</h1>
        <p className="muted">
          Every income and every approved expense of {config?.association.name}, per event.
          Anyone can check it, and no one can change it after it is recorded.
        </p>

        {error && <p className="error">{error}</p>}
        {!accounts && !error && <p className="muted">Loading the accounts…</p>}
        {accounts && (
          <>
            <TreasurySummary summary={accounts.summary} />

            <h2 className="section-title">Payments</h2>
            <PaymentTrust />

            <h2 className="section-title">Per event</h2>
            <div className="ledger-list per-event">
              {accounts.events.map((item) => (
                <LedgerCard key={item.event.id} ledger={item} event={item.event} />
              ))}
              {accounts.general.expenses.length > 0 && <LedgerCard ledger={accounts.general} />}
            </div>
          </>
        )}
      </main>
    </>
  )
}
