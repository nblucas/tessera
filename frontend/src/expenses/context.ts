import { createContext, useContext } from 'react'
import type { Expense } from '../data/expenses'

export type NewExpense = Pick<
  Expense,
  'description' | 'amountCents' | 'category' | 'eventId' | 'receipt' | 'proposedBy'
>

export type ExpensesContextValue = {
  expenses: Expense[]
  proposeExpense: (expense: NewExpense) => Expense
  voteOnExpense: (expenseId: string, email: string, vote: 'approve' | 'reject') => void
}

export const ExpensesContext = createContext<ExpensesContextValue | null>(null)

export function useExpenses(): ExpensesContextValue {
  const value = useContext(ExpensesContext)
  if (!value) {
    throw new Error('useExpenses must be used inside <ExpensesProvider>')
  }
  return value
}
