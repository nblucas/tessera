export const EXPENSE_CATEGORIES = [
  'Venue',
  'Suppliers',
  'Drinks',
  'Security',
  'Marketing',
  'Seller commissions',
  'Other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export type ExpenseStatus = 'pending' | 'approved' | 'rejected'

export type Receipt = {
  fileName: string
  mimeType: string
  dataUrl: string
  sha256: string
}

export type Expense = {
  id: string
  description: string
  amountCents: number
  category: ExpenseCategory
  eventId?: string
  receipt: Receipt
  proposedBy: string
  approvals: string[]
  rejections: string[]
  status: ExpenseStatus
  createdAt: string
}
