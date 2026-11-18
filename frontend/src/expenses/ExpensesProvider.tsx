import { useState, type ReactNode } from 'react'
import type { Expense } from '../data/expenses'
import { ExpensesContext, type NewExpense } from './context'

const STORAGE_KEY = 'tessera.expenses'

function loadExpenses(): Expense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Expense[]) : []
  } catch {
    return []
  }
}

function persist(expenses: Expense[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses))
  } catch {
    // Storage unavailable or full: keep expenses in memory only.
  }
}

export function ExpensesProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>(loadExpenses)

  function update(change: (current: Expense[]) => Expense[]) {
    setExpenses((current) => {
      const next = change(current)
      persist(next)
      return next
    })
  }

  function proposeExpense(input: NewExpense): Expense {
    const expense: Expense = {
      ...input,
      id: crypto.randomUUID(),
      approvals: [input.proposedBy],
      rejections: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    update((current) => [...current, expense])
    return expense
  }

  return (
    <ExpensesContext.Provider value={{ expenses, proposeExpense }}>
      {children}
    </ExpensesContext.Provider>
  )
}
