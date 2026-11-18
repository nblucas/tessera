import { Link } from 'react-router'
import { useAuth } from '../../auth/context'
import { AppHeader } from '../../components/AppHeader'
import { BoardTabs } from '../../components/BoardTabs'
import { BOARD_MAJORITY, BOARD_MEMBERS, boardMemberName } from '../../data/board'
import type { Expense, ExpenseStatus } from '../../data/expenses'
import { useEvents } from '../../events/context'
import { useExpenses } from '../../expenses/context'
import { formatDate, formatPrice } from '../../lib/format'

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const { user } = useAuth()
  const { findEvent } = useEvents()
  const { voteOnExpense } = useExpenses()
  const event = findEvent(expense.eventId)

  const email = user?.email ?? ''
  const approved = expense.approvals.includes(email)
  const rejected = expense.rejections.includes(email)
  const canVote = expense.status === 'pending' && !approved && !rejected

  return (
    <li className="expense-row">
      <div className="expense-main">
        <div>
          <p className="batch-name">{expense.description}</p>
          <p className="muted">
            {expense.category} · {event ? event.title : 'General'} ·{' '}
            {formatDate(expense.createdAt)}
          </p>
        </div>
        <div className="batch-action">
          <span className="event-price">{formatPrice(expense.amountCents)}</span>
          <span className={`badge expense-${expense.status}`}>
            {STATUS_LABELS[expense.status]}
          </span>
        </div>
      </div>

      <div className="expense-details">
        <p className="hint expense-meta">
          Proposed by {boardMemberName(expense.proposedBy)} · Approved by{' '}
          {expense.approvals.map(boardMemberName).join(', ')} ({expense.approvals.length}/
          {BOARD_MAJORITY})
          {expense.rejections.length > 0 &&
            ` · Rejected by ${expense.rejections.map(boardMemberName).join(', ')}`}
        </p>
        <a
          className="receipt-link"
          href={expense.receipt.dataUrl}
          download={expense.receipt.fileName}
        >
          Download receipt ({expense.receipt.fileName})
        </a>
      </div>

      {canVote ? (
        <div className="expense-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => voteOnExpense(expense.id, email, 'reject')}
          >
            Reject
          </button>
          <button type="button" onClick={() => voteOnExpense(expense.id, email, 'approve')}>
            Approve
          </button>
        </div>
      ) : (
        expense.status === 'pending' && (
          <p className="hint expense-meta">
            You {approved ? 'approved' : 'rejected'} this expense. Waiting for the rest of the
            board.
          </p>
        )
      )}
    </li>
  )
}

export function BoardExpensesPage() {
  const { expenses } = useExpenses()
  const sorted = [...expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const pending = sorted.filter((expense) => expense.status === 'pending')
  const decided = sorted.filter((expense) => expense.status !== 'pending')

  return (
    <>
      <AppHeader />
      <main className="page">
        <div className="page-heading">
          <div>
            <h1>Board · Expenses</h1>
            <p className="muted">
              Every expense needs a receipt and {BOARD_MAJORITY} of {BOARD_MEMBERS.length} board
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
          <>
            <h2 className="section-title">Pending ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="muted">Nothing waiting for approval.</p>
            ) : (
              <ul className="batch-list">
                {pending.map((expense) => (
                  <ExpenseRow key={expense.id} expense={expense} />
                ))}
              </ul>
            )}

            {decided.length > 0 && (
              <>
                <h2 className="section-title">Decided</h2>
                <ul className="batch-list">
                  {decided.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}
