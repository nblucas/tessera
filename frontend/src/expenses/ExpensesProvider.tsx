import type { ReactNode } from 'react'
import { api } from '../api/client'
import { useAccountData } from '../api/useAccountData'
import type { ExpenseView, ReceiptView } from '../api/types'
import { useAuth } from '../auth/context'
import { ExpensesContext, type NewExpense } from './context'

const NO_EXPENSES: ExpenseView[] = []
const loadExpenses = () => api.get<ExpenseView[]>('/expenses')

// Expenses as the board sees them, pending and decided. Only directors can load them.
export function ExpensesProvider({ children }: { children: ReactNode }) {
  const { user, sign } = useAuth()
  const { data: expenses, loading, refresh } = useAccountData(
    user?.isBoardMember ? user.id : null,
    loadExpenses,
    NO_EXPENSES,
  )

  // Uploads the receipt (the server re-checks its hash), then signs and submits the proposal.
  async function proposeExpense(input: NewExpense) {
    const form = new FormData()
    form.append('file', input.file)
    const receipt = await api.post<ReceiptView>(`/receipts?sha256=${input.sha256}`, form)
    const action = await sign('ExpenseProposed', {
      expenseId: crypto.randomUUID(),
      amountCents: input.amountCents,
      category: input.category,
      eventId: input.eventId ?? '',
      receiptSha256: receipt.sha256,
    })
    await api.post('/expenses', { description: input.description, receiptId: receipt.id, action })
    await refresh()
  }

  async function voteOnExpense(expenseId: string, vote: 'approve' | 'reject') {
    const action = await sign('ExpenseVoted', { expenseId, approve: vote === 'approve' })
    await api.post(`/expenses/${expenseId}/votes`, { action })
    await refresh()
  }

  return (
    <ExpensesContext.Provider value={{ expenses, loading, refresh, proposeExpense, voteOnExpense }}>
      {children}
    </ExpensesContext.Provider>
  )
}
