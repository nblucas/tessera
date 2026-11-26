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

// A record signed by a user, or by the payment oracle for the records that report an
// off-chain Pix payment outcome (TicketIssued, PaymentRefunded, PaymentReversed, ResaleSettled).
type Signed<Kind extends string, Fields> = { kind: Kind; actor: Address } & Fields

// Genesis records are written once by the seed, before any signed record, and have no actor.
type Genesis<Kind extends string, Fields> = { kind: Kind; actor: null } & Fields

export type BatchFields = {
  eventId: string
  batchId: string
  priceCents: number
  quantity: number
  // Highest resale price, as a percentage of the batch price (at least 100).
  resaleCapPercent: number
}

// Resale split, fixed for now (see BACKEND.md, "Resale").
export const RESALE_ROYALTY_PERCENT = 10
export const RESALE_PLATFORM_FEE_PERCENT = 5

// paymentRef: SHA-256 (hex, no 0x) of the Pix end-to-end id (e2eid). Anyone holding the bank
// statement can hash the e2eid and find the record; the public never sees bank identifiers.

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
    paymentRef: string
  }
>
// A confirmed payment that did not become a ticket (failed settlement) was returned.
export type PaymentRefunded = Signed<
  'PaymentRefunded',
  { paymentRef: string; amountCents: number; orderRef: string; reason: string }
>
// A payment that had produced a ticket was reversed by the bank (devolução or MED). The ticket
// is revoked and returns to stock.
export type PaymentReversed = Signed<
  'PaymentReversed',
  { paymentRef: string; ticketId: string; amountCents: number }
>
// The owner offers a ticket for resale, at most the batch price times its resale cap.
export type TicketListed = Signed<'TicketListed', { ticketId: string; priceCents: number }>
export type ListingCancelled = Signed<'ListingCancelled', { ticketId: string }>
// A resale was paid: the listed ticket is cancelled and a new one issued to the buyer.
export type ResaleSettled = Signed<
  'ResaleSettled',
  {
    paymentRef: string
    listedTicketId: string
    ticketId: string
    owner: Address
    priceCents: number
    royaltyCents: number
    platformFeeCents: number
    payoutCents: number
    orderRef: string
  }
>
// The board replaces the payment oracle by majority, like a handover.
export type OracleChangeProposed = Signed<
  'OracleChangeProposed',
  { proposalId: string; newOracle: Address }
>
export type OracleChangeApproved = Signed<'OracleChangeApproved', { proposalId: string }>
export type OracleChangeCancelled = Signed<'OracleChangeCancelled', { proposalId: string }>
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
  | PaymentRefunded
  | PaymentReversed
  | TicketListed
  | ListingCancelled
  | ResaleSettled
  | OracleChangeProposed
  | OracleChangeApproved
  | OracleChangeCancelled

export type LedgerRecord = GenesisRecord | SignedRecord

export type SignedKind = SignedRecord['kind']
export type RecordKind = LedgerRecord['kind']

// Records only the payment oracle may sign.
export const ORACLE_KINDS = [
  'TicketIssued',
  'PaymentRefunded',
  'PaymentReversed',
  'ResaleSettled',
] as const satisfies readonly SignedKind[]

export function resaleSplit(priceCents: number) {
  const royaltyCents = Math.round((priceCents * RESALE_ROYALTY_PERCENT) / 100)
  const platformFeeCents = Math.round((priceCents * RESALE_PLATFORM_FEE_PERCENT) / 100)
  return { royaltyCents, platformFeeCents, payoutCents: priceCents - royaltyCents - platformFeeCents }
}

export function maxResalePrice(batchPriceCents: number, resaleCapPercent: number): number {
  return Math.floor((batchPriceCents * resaleCapPercent) / 100)
}
