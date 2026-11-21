import type { ExpenseCategory } from '@tessera/shared'
import { createContext, useContext } from 'react'
import type { ExpenseView } from '../api/types'

export type NewExpense = {
  description: string
  amountCents: number
  category: ExpenseCategory
  // Undefined for a general expense not tied to an event.
  eventId?: string
  file: File
  sha256: string
}

export type ExpensesContextValue = {
  expenses: ExpenseView[]
  loading: boolean
  refresh: () => Promise<void>
  proposeExpense: (expense: NewExpense) => Promise<void>
  voteOnExpense: (expenseId: string, vote: 'approve' | 'reject') => Promise<void>
}

export const ExpensesContext = createContext<ExpensesContextValue | null>(null)

export function useExpenses(): ExpensesContextValue {
  const value = useContext(ExpensesContext)
  if (!value) {
    throw new Error('useExpenses must be used inside <ExpensesProvider>')
  }
  return value
}
