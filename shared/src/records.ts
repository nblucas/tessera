import type { Address } from 'viem'

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

// A record signed by a user (or by the oracle, for TicketIssued).
type Signed<Kind extends string, Fields> = { kind: Kind; actor: Address } & Fields

// Genesis records are written once by the seed, before any signed record, and have no actor.
type Genesis<Kind extends string, Fields> = { kind: Kind; actor: null } & Fields

export type BatchFields = {
  eventId: string
  batchId: string
  priceCents: number
  quantity: number
}

export type BoardSet = Genesis<'BoardSet', { members: Address[] }>
export type GenesisBatchCreated = Genesis<'BatchCreated', BatchFields>
export type OpeningSalesRecorded = Genesis<
  'OpeningSalesRecorded',
  { eventId: string; batchId: string; count: number; amountCents: number }
>

export type BatchCreated = Signed<'BatchCreated', BatchFields>
export type BatchUpdated = Signed<'BatchUpdated', BatchFields>
export type BatchRemoved = Signed<'BatchRemoved', { eventId: string; batchId: string }>
export type HandoverProposed = Signed<'HandoverProposed', { handoverId: string; members: Address[] }>
export type HandoverApproved = Signed<'HandoverApproved', { handoverId: string }>
export type HandoverCancelled = Signed<'HandoverCancelled', { handoverId: string }>
export type TicketIssued = Signed<
  'TicketIssued',
  {
    ticketId: string
    eventId: string
    batchId: string
    owner: Address
    priceCents: number
    orderRef: string
  }
>
export type ExpenseProposed = Signed<
  'ExpenseProposed',
  {
    expenseId: string
    amountCents: number
    category: ExpenseCategory
    // Empty string for a general expense not tied to an event.
    eventId: string
    receiptSha256: string
  }
>
export type ExpenseVoted = Signed<'ExpenseVoted', { expenseId: string; approve: boolean }>

export type GenesisRecord = BoardSet | GenesisBatchCreated | OpeningSalesRecorded

export type SignedRecord =
  | BatchCreated
  | BatchUpdated
  | BatchRemoved
  | HandoverProposed
  | HandoverApproved
  | HandoverCancelled
  | TicketIssued
  | ExpenseProposed
  | ExpenseVoted

export type LedgerRecord = GenesisRecord | SignedRecord

export type SignedKind = SignedRecord['kind']
export type RecordKind = LedgerRecord['kind']
