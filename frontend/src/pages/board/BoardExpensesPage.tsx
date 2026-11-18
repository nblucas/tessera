import { Link } from 'react-router'
import { AppHeader } from '../../components/AppHeader'
import { BoardTabs } from '../../components/BoardTabs'
import { BOARD_MEMBERS } from '../../data/board'
import type { ExpenseStatus } from '../../data/expenses'
import { useEvents } from '../../events/context'
import { useExpenses } from '../../expenses/context'
import { formatDate, formatPrice } from '../../lib/format'

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

export function BoardExpensesPage() {
  const { expenses } = useExpenses()
  const { findEvent } = useEvents()
  const sorted = [...expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const majority = Math.floor(BOARD_MEMBERS.length / 2) + 1

  return (
    <>
      <AppHeader />
      <main className="page">
        <div className="page-heading">
          <div>
            <h1>Board · Expenses</h1>
            <p className="muted">
              Every expense needs a receipt and {majority} of {BOARD_MEMBERS.length} board
              approvals.
            </p>
          </div>
          <Link to="/board/expenses/new" className="button-link">
            New expense
          </Link>
        </div>
        <BoardTabs />

        {sorted.length === 0 ? (
          <div className="empty-state">
            <p>No expenses yet.</p>
          </div>
        ) : (
          <ul className="batch-list board-list">
            {sorted.map((expense) => {
              const event = findEvent(expense.eventId)
              return (
                <li key={expense.id} className="batch-row">
                  <div>
                    <p className="batch-name">{expense.description}</p>
                    <p className="muted">
                      {expense.category} · {event ? event.title : 'General'} ·{' '}
                      {formatDate(expense.createdAt)}
                    </p>
                    <p className="hint expense-meta">
                      Proposed by {expense.proposedBy} · {expense.approvals.length}/{majority}{' '}
                      approvals
                    </p>
                  </div>
                  <div className="batch-action">
                    <span className="event-price">{formatPrice(expense.amountCents)}</span>
                    <span className={`badge expense-${expense.status}`}>
                      {STATUS_LABELS[expense.status]}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
