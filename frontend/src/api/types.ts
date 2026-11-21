// Response shapes of the backend API (see BACKEND.md, "API").
import type { ExpenseCategory } from '@tessera/shared'
import type { Address } from 'viem'

export type AppConfig = {
  demoMode: boolean
  association: { id: string; name: string }
}

export type Me = {
  id: string
  email: string | null
  name: string | null
  address: Address | null
  isBoardMember: boolean
}

export type BatchView = {
  id: string
  name: string
  priceCents: number
  quantity: number
  sold: number
  available: number
}

export type EventView = {
  id: string
  title: string
  description: string
  date: string
  location: string
  color: string
  batches: BatchView[]
}

export type OrderStatus = 'pending_payment' | 'expired' | 'paid' | 'issued' | 'failed' | 'refunded'

export type Order = {
  id: string
  status: OrderStatus
  eventId: string
  batchId: string
  priceCents: number
  pixCopyPaste: string
  expiresAt: string
  ticketId: string | null
  failureReason: string | null
}

export type TicketView = {
  ticketId: string
  code: string
  eventId: string
  eventTitle: string
  eventDate: string
  location: string
  color: string
  batchId: string
  batchName: string
  priceCents: number
  issuedAt: string
}

export type Person = { address: Address; name: string | null }

export type ReceiptView = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  erased: boolean
}

export type ExpenseStatus = 'pending' | 'approved' | 'rejected'

export type ExpenseView = {
  id: string
  description: string
  amountCents: number
  category: ExpenseCategory
  eventId: string | null
  eventTitle: string | null
  status: ExpenseStatus
  proposedBy: Person
  approvals: Person[]
  rejections: Person[]
  proposedAt: string
  decidedAt: string | null
  receipt: ReceiptView
}

export type TermView = {
  term: number
  members: Person[]
  startedAt: string
  endedAt: string | null
}

export type HandoverView = {
  id: string
  status: 'draft' | 'open'
  proposedBy: { address: Address | null; name: string | null }
  members: { name: string; email: string; address: Address | null }[]
  missing: string[]
  approvals: Person[]
}

export type BoardView = {
  current: TermView
  past: TermView[]
  majority: number
  handover: HandoverView | null
}

export type AccountsExpense = {
  id: string
  description: string | null
  category: string
  amountCents: number
  approvedBy: string[]
  receiptSha256: string
  receipt: { id: string; fileName: string; erased: boolean } | null
}

export type EventLedger = {
  ticketsSold: number
  ticketIncome: number
  income: number
  expenses: AccountsExpense[]
  expenseTotal: number
  net: number
}

export type TreasurySummary = {
  ticketIncome: number
  income: number
  expenses: number
  balance: number
  byCategory: { category: string; amount: number }[]
}

export type Accounts = {
  summary: TreasurySummary
  events: (EventLedger & { event: { id: string; title: string; date: string; color: string } })[]
  general: EventLedger
}
