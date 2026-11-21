import { useState } from 'react'
import { Link } from 'react-router'
import { errorMessage, receiptUrl } from '../../api/client'
import type { ExpenseStatus, ExpenseView, Person } from '../../api/types'
import { useAuth } from '../../auth/context'
import { useBoard } from '../../board/context'
import { AppHeader } from '../../components/AppHeader'
import { BoardTabs } from '../../components/BoardTabs'
import { useExpenses } from '../../expenses/context'
import { formatDate, formatPrice } from '../../lib/format'

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const names = (people: Person[]) => people.map((person) => person.name ?? person.address).join(', ')

function hasVoted(people: Person[], address: string | null | undefined) {
  return people.some((person) => person.address.toLowerCase() === address?.toLowerCase())
}

function ExpenseRow({ expense, majority }: { expense: ExpenseView; majority: number }) {
  const { user } = useAuth()
  const { voteOnExpense } = useExpenses()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approved = hasVoted(expense.approvals, user?.address)
  const rejected = hasVoted(expense.rejections, user?.address)
  const canVote = expense.status === 'pending' && !approved && !rejected

  async function vote(choice: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      await voteOnExpense(expense.id, choice)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="expense-row">
      <div className="expense-main">
        <div>
          <p className="batch-name">{expense.description}</p>
          <p className="muted">
            {expense.category} · {expense.eventTitle ?? 'General'} · {formatDate(expense.proposedAt)}
          </p>
        </div>
        <div className="batch-action">
          <span className="event-price">{formatPrice(expense.amountCents)}</span>
          <span className={`badge expense-${expense.status}`}>{STATUS_LABELS[expense.status]}</span>
        </div>
      </div>

      <div className="expense-details">
        <p className="hint expense-meta">
          Proposed by {expense.proposedBy.name ?? expense.proposedBy.address} · Approved by{' '}
          {names(expense.approvals)} ({expense.approvals.length}/{majority})
          {expense.rejections.length > 0 && ` · Rejected by ${names(expense.rejections)}`}
        </p>
        {expense.receipt.erased ? (
          <p className="hint">Receipt file erased for privacy; its hash stays on the ledger.</p>
        ) : (
          <a className="receipt-link" href={receiptUrl(expense.receipt.id)} download={expense.receipt.fileName}>
            Download receipt ({expense.receipt.fileName})
          </a>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {canVote ? (
        <div className="expense-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => vote('reject')}>
            Reject
          </button>
          <button type="button" disabled={busy} onClick={() => vote('approve')}>
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
  const { expenses, loading } = useExpenses()
  const { board } = useBoard()
  const majority = board?.majority ?? 0
  const pending = expenses.filter((expense) => expense.status === 'pending')
  const decided = expenses.filter((expense) => expense.status !== 'pending')

  return (
    <>
      <AppHeader />
      <main className="page">
        <div className="page-heading">
          <div>
            <h1>Board · Expenses</h1>
            <p className="muted">
              Every expense needs a receipt and {majority} of {board?.current.members.length ?? 0}{' '}
              board approvals.
            </p>
          </div>
          <Link to="/board/expenses/new" className="button-link">
            New expense
          </Link>
        </div>
        <BoardTabs />

        {loading ? (
          <p className="muted">Loading expenses…</p>
        ) : expenses.length === 0 ? (
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
                  <ExpenseRow key={expense.id} expense={expense} majority={majority} />
                ))}
              </ul>
            )}

            {decided.length > 0 && (
              <>
                <h2 className="section-title">Decided</h2>
                <ul className="batch-list">
                  {decided.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} majority={majority} />
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
