import { formatPrice } from '../lib/format'
import type { TreasurySummary as Summary } from '../api/types'

export function TreasurySummary({ summary }: { summary: Summary }) {
  const largest = summary.byCategory[0]?.amount ?? 0

  return (
    <section className="treasury">
      <div className="stat-grid">
        <div className="stat stat-hero">
          <p className="stat-label">Balance</p>
          <p className={`stat-value ${summary.balance < 0 ? 'negative' : ''}`}>
            {summary.balance < 0 && '−'}
            {formatPrice(Math.abs(summary.balance))}
          </p>
          <p className="stat-note">Income minus approved expenses</p>
        </div>
        <div className="stat">
          <p className="stat-label">Total income</p>
          <p className="stat-value">{formatPrice(summary.income)}</p>
          <p className="stat-note">
            Tickets {formatPrice(summary.ticketIncome)} · Resale royalties{' '}
            {formatPrice(summary.royaltyIncome)}
            {summary.reversals > 0 && ` · Reversals −${formatPrice(summary.reversals)}`}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Total expenses</p>
          <p className="stat-value">{formatPrice(summary.expenses)}</p>
          <p className="stat-note">Approved by a majority of the board</p>
        </div>
      </div>

      <div className="category-chart">
        <p className="batch-name">Expenses by category</p>
        {summary.byCategory.length === 0 ? (
          <p className="muted category-empty">No approved expenses yet.</p>
        ) : (
          <ul className="category-list">
            {summary.byCategory.map(({ category, amount }) => {
              const share = summary.expenses > 0 ? (amount / summary.expenses) * 100 : 0
              return (
                <li
                  key={category}
                  className="category-row"
                  title={`${category}: ${formatPrice(amount)} (${share.toFixed(0)}% of expenses)`}
                >
                  <span className="category-name">{category}</span>
                  <span className="category-track">
                    <span
                      className="category-bar"
                      style={{ width: `${largest > 0 ? (amount / largest) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="category-value">
                    {formatPrice(amount)}
                    <span className="muted"> · {share.toFixed(0)}%</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
