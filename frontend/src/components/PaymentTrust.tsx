import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { PaymentReport, Reconciliation } from '../api/types'
import { formatDate, formatPrice } from '../lib/format'

const REPORT_LABELS: Record<PaymentReport['kind'], string> = {
  TicketIssued: 'Ticket issued',
  ResaleSettled: 'Resale settled',
  PaymentRefunded: 'Refunded',
  PaymentReversed: 'Reversed by the bank',
}

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

// Who is trusted to report off-chain Pix payments, what they may do, and whether every payment
// they reported adds up. Anyone can check it without signing in.
export function PaymentTrust() {
  const [report, setReport] = useState<Reconciliation | null>(null)

  useEffect(() => {
    api
      .get<Reconciliation>('/reconciliation')
      .then(setReport)
      .catch(() => setReport(null))
  }, [])

  if (!report) return null
  const { oracle, ledger, checks } = report

  return (
    <section className="ledger-card trust">
      <div className="ledger-heading">
        <div>
          <p className="batch-name">Who reports payments</p>
          <p className="muted">
            Pix payments happen off the ledger. One key, the payment oracle, is trusted to report
            them. Each report is signed by it and kept on the ledger.
          </p>
        </div>
        <span className={`badge ${report.ok ? 'expense-approved' : 'expense-rejected'}`}>
          {report.ok ? 'Reconciled' : 'Mismatch found'}
        </span>
      </div>

      <p className="ledger-sub">
        Oracle: <code className="hash">{oracle.address}</code>
        {oracle.since ? ` · set by the board on ${formatDate(oracle.since)}` : ' · set at deployment'}
      </p>
      <div className="trust-columns">
        <div>
          <p className="ledger-sub">It may</p>
          <ul>
            {oracle.mayDo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="ledger-sub">It may not</p>
          <ul>
            {oracle.mayNotDo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <table className="ledger-table">
        <tbody>
          <tr>
            <td>Tickets issued ({ledger.tickets})</td>
            <td className="amount">{formatPrice(ledger.ticketCents)}</td>
          </tr>
          <tr>
            <td>Resales settled ({ledger.resales})</td>
            <td className="amount">{formatPrice(ledger.resaleCents)}</td>
          </tr>
          <tr>
            <td>Payments refunded ({ledger.refunds})</td>
            <td className="amount">{formatPrice(ledger.refundCents)}</td>
          </tr>
          <tr>
            <td>Payments reversed by the bank ({ledger.reversals})</td>
            <td className="amount negative">−{formatPrice(ledger.reversalCents)}</td>
          </tr>
        </tbody>
      </table>

      <ul className="trust-checks">
        {checks.map((check) => (
          <li key={check.name} className={check.ok ? 'positive' : 'negative'}>
            {check.ok ? '✓' : '✗'} {check.name}
            <span className="ledger-sub"> · {check.detail}</span>
          </li>
        ))}
      </ul>

      {report.recent.length > 0 && (
        <>
          <p className="ledger-sub">Latest reports (payment reference = SHA-256 of the Pix end-to-end id)</p>
          <table className="ledger-table">
            <tbody>
              {report.recent.slice(0, 8).map((item) => (
                <tr key={`${item.paymentRef}-${item.kind}`}>
                  <td>
                    {REPORT_LABELS[item.kind]}
                    <span className="ledger-sub">
                      {formatDate(item.reportedAt)} · ref <code className="hash">{short(item.paymentRef)}</code>
                      {item.reason && ` · ${item.reason}`}
                    </span>
                  </td>
                  <td className={`amount ${item.kind === 'PaymentReversed' ? 'negative' : ''}`}>
                    {formatPrice(item.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
