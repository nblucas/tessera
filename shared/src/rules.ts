// Ledger rules as pure functions. The fake ledger runs them on every record, and the ledger
// contracts must implement the same ones (see rules.examples.ts for the shared test cases).
import type { Address } from 'viem'
import type { LedgerRecord } from './records'
import { EXPENSE_CATEGORIES, maxResalePrice, resaleSplit } from './records'

export type ExpenseStatus = 'pending' | 'approved' | 'rejected'

export type ExpenseState = {
  proposer: Address
  approvals: Address[]
  rejections: Address[]
  status: ExpenseStatus
}

export type HandoverState = {
  id: string
  proposer: Address
  members: Address[]
  approvals: Address[]
}

export type BatchState = {
  priceCents: number
  quantity: number
  sold: number
  resaleCapPercent: number
}

// valid: can enter or be listed; listed: offered for resale; resold: replaced by the buyer's
// ticket; revoked: its payment was reversed.
export type TicketStatus = 'valid' | 'listed' | 'resold' | 'revoked'

export type TicketState = {
  eventId: string
  batchId: string
  owner: Address
  priceCents: number
  paymentRef: string
  status: TicketStatus
  listingPriceCents: number | null
}

export type OracleChangeState = {
  id: string
  proposer: Address
  newOracle: Address
  approvals: Address[]
}

export type LedgerState = {
  // True once the first signed record is accepted; genesis records are refused after that.
  sealed: boolean
  board: Address[] | null
  term: number
  handover: HandoverState | null
  // Keyed by batchKey(eventId, batchId).
  batches: Record<string, BatchState>
  expenses: Record<string, ExpenseState>
  tickets: Record<string, TicketState>
  // Payment references already reported, so one payment has exactly one outcome.
  payments: Record<string, 'ticket' | 'refunded' | 'reversed'>
  // Set once the board replaces the oracle given at deploy time.
  oracle: Address | null
  oracleChange: OracleChangeState | null
}

export const EMPTY_STATE: LedgerState = {
  sealed: false,
  board: null,
  term: 0,
  handover: null,
  batches: {},
  expenses: {},
  tickets: {},
  payments: {},
  oracle: null,
  oracleChange: null,
}

// oracle: the payment oracle set at deploy time.
export type RuleContext = { oracle: Address }

export function currentOracle(state: LedgerState, ctx: RuleContext): Address {
  return state.oracle ?? ctx.oracle
}

export function batchKey(eventId: string, batchId: string): string {
  return `${eventId}/${batchId}`
}

export function majorityOf(count: number): number {
  return Math.floor(count / 2) + 1
}

function sameAddress(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export function includesAddress(list: readonly Address[], address: Address): boolean {
  return list.some((item) => sameAddress(item, address))
}

export function isHandoverApproved(
  approvals: readonly Address[],
  members: readonly Address[],
): boolean {
  return approvals.length >= majorityOf(members.length)
}

// Only votes from the board in office count. Votes from former directors stay in the
// history but no longer decide anything.
export function expenseStatus(
  approvals: readonly Address[],
  rejections: readonly Address[],
  members: readonly Address[],
): ExpenseStatus {
  const majority = majorityOf(members.length)
  const count = (votes: readonly Address[]) =>
    votes.filter((voter) => includesAddress(members, voter)).length
  if (count(approvals) >= majority) return 'approved'
  if (count(rejections) >= majority) return 'rejected'
  return 'pending'
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function hasDuplicates(addresses: readonly Address[]): boolean {
  return new Set(addresses.map((address) => address.toLowerCase())).size !== addresses.length
}

function checkBatchFields(record: {
  priceCents: number
  quantity: number
  resaleCapPercent: number
}): string | null {
  if (!isPositiveInteger(record.priceCents)) return 'price must be positive whole cents'
  if (!isPositiveInteger(record.quantity)) return 'quantity must be a positive whole number'
  if (!Number.isSafeInteger(record.resaleCapPercent) || record.resaleCapPercent < 100) {
    return 'resale cap must be a whole percentage of at least 100'
  }
  return null
}

function checkNewPayment(state: LedgerState, paymentRef: string): string | null {
  if (!SHA256_PATTERN.test(paymentRef)) return 'payment reference must be a SHA-256 hex'
  if (state.payments[paymentRef]) return 'payment already reported'
  return null
}

// Returns why the record is not allowed in this state, or null if it is.
export function checkRecord(
  state: LedgerState,
  record: LedgerRecord,
  ctx: RuleContext,
): string | null {
  if (record.actor === null && state.sealed) return 'genesis is closed'

  const isMember = (actor: Address) => includesAddress(state.board ?? [], actor)
  const isOracle = (actor: Address) => sameAddress(actor, currentOracle(state, ctx))
  const batch = (eventId: string, batchId: string) => state.batches[batchKey(eventId, batchId)]

  switch (record.kind) {
    case 'BoardSet':
      if (state.board) return 'board already set'
      if (record.members.length === 0) return 'the board needs at least one director'
      if (hasDuplicates(record.members)) return 'duplicate director address'
      return null

    case 'OpeningSalesRecorded': {
      const target = batch(record.eventId, record.batchId)
      if (!target) return 'unknown batch'
      if (!isPositiveInteger(record.count)) return 'count must be a positive whole number'
      if (!Number.isSafeInteger(record.amountCents) || record.amountCents < 0) {
        return 'amount must be whole cents'
      }
      if (target.sold + record.count > target.quantity) return 'opening sales exceed the quantity'
      return null
    }

    case 'BatchCreated':
      if (record.actor !== null && !isMember(record.actor)) return 'not a board member'
      if (batch(record.eventId, record.batchId)) return 'batch already exists'
      return checkBatchFields(record)

    case 'BatchUpdated':
    case 'BatchRemoved': {
      if (!isMember(record.actor)) return 'not a board member'
      const target = batch(record.eventId, record.batchId)
      if (!target) return 'unknown batch'
      if (target.sold > 0) return 'batch is frozen after its first sale'
      return record.kind === 'BatchUpdated' ? checkBatchFields(record) : null
    }

    case 'TicketIssued': {
      if (!isOracle(record.actor)) return 'only the oracle issues tickets'
      if (state.tickets[record.ticketId]) return 'ticket already issued'
      const paymentError = checkNewPayment(state, record.paymentRef)
      if (paymentError) return paymentError
      const target = batch(record.eventId, record.batchId)
      if (!target) return 'unknown batch'
      if (target.sold >= target.quantity) return 'batch is sold out'
      if (record.priceCents !== target.priceCents) return 'price does not match the batch'
      return null
    }

    case 'ExpenseProposed':
      if (!isMember(record.actor)) return 'not a board member'
      if (state.expenses[record.expenseId]) return 'expense already exists'
      if (!isPositiveInteger(record.amountCents)) return 'amount must be positive whole cents'
      if (!EXPENSE_CATEGORIES.includes(record.category)) return 'unknown category'
      if (!SHA256_PATTERN.test(record.receiptSha256)) return 'receipt hash must be a SHA-256 hex'
      return null

    case 'ExpenseVoted': {
      if (!isMember(record.actor)) return 'not a board member'
      const expense = state.expenses[record.expenseId]
      if (!expense) return 'unknown expense'
      if (expense.status !== 'pending') return 'expense is not pending'
      const voted = [...expense.approvals, ...expense.rejections]
      if (includesAddress(voted, record.actor)) return 'already voted'
      return null
    }

    case 'HandoverProposed':
      if (!isMember(record.actor)) return 'not a board member'
      if (state.handover) return 'handover already open'
      if (record.members.length === 0) return 'the new board needs at least one director'
      if (hasDuplicates(record.members)) return 'duplicate director address'
      return null

    case 'HandoverApproved':
      if (!isMember(record.actor)) return 'not a board member'
      if (state.handover?.id !== record.handoverId) return 'no open handover with this id'
      if (includesAddress(state.handover.approvals, record.actor)) return 'already approved'
      return null

    case 'PaymentRefunded':
      if (!isOracle(record.actor)) return 'only the oracle reports payments'
      if (!isPositiveInteger(record.amountCents)) return 'amount must be positive whole cents'
      return checkNewPayment(state, record.paymentRef)

    case 'PaymentReversed': {
      if (!isOracle(record.actor)) return 'only the oracle reports payments'
      const ticket = state.tickets[record.ticketId]
      if (!ticket) return 'unknown ticket'
      if (ticket.paymentRef !== record.paymentRef) return 'payment does not match the ticket'
      if (state.payments[record.paymentRef] === 'reversed') return 'payment already reversed'
      if (ticket.status === 'revoked') return 'ticket is not valid'
      if (!isPositiveInteger(record.amountCents)) return 'amount must be positive whole cents'
      return null
    }

    case 'TicketListed': {
      const ticket = state.tickets[record.ticketId]
      if (!ticket) return 'unknown ticket'
      if (!sameAddress(ticket.owner, record.actor)) return 'only the owner lists a ticket'
      if (ticket.status !== 'valid') return 'ticket is not valid for resale'
      if (!isPositiveInteger(record.priceCents)) return 'price must be positive whole cents'
      const batch = state.batches[batchKey(ticket.eventId, ticket.batchId)]
      const cap = maxResalePrice(batch.priceCents, batch.resaleCapPercent)
      if (record.priceCents > cap) return `price is above the resale cap of ${cap} cents`
      return null
    }

    case 'ListingCancelled': {
      const ticket = state.tickets[record.ticketId]
      if (!ticket) return 'unknown ticket'
      if (!sameAddress(ticket.owner, record.actor)) return 'only the owner cancels a listing'
      if (ticket.status !== 'listed') return 'ticket is not listed'
      return null
    }

    case 'ResaleSettled': {
      if (!isOracle(record.actor)) return 'only the oracle reports payments'
      const listed = state.tickets[record.listedTicketId]
      if (!listed || listed.status !== 'listed') return 'ticket is not listed'
      if (sameAddress(listed.owner, record.owner)) return 'nobody buys their own listing'
      if (state.tickets[record.ticketId]) return 'ticket already issued'
      if (record.priceCents !== listed.listingPriceCents) return 'price does not match the listed price'
      const split = resaleSplit(record.priceCents)
      if (
        record.royaltyCents !== split.royaltyCents ||
        record.platformFeeCents !== split.platformFeeCents ||
        record.payoutCents !== split.payoutCents
      ) {
        return 'resale split does not match the fixed percentages'
      }
      return checkNewPayment(state, record.paymentRef)
    }

    case 'OracleChangeProposed':
      if (!isMember(record.actor)) return 'not a board member'
      if (state.oracleChange) return 'oracle change already open'
      if (isOracle(record.newOracle)) return 'this is already the oracle'
      return null

    case 'OracleChangeApproved':
      if (!isMember(record.actor)) return 'not a board member'
      if (state.oracleChange?.id !== record.proposalId) return 'no open oracle change with this id'
      if (includesAddress(state.oracleChange.approvals, record.actor)) return 'already approved'
      return null

    case 'OracleChangeCancelled':
      if (state.oracleChange?.id !== record.proposalId) return 'no open oracle change with this id'
      if (!sameAddress(state.oracleChange.proposer, record.actor)) {
        return 'only the proposer can cancel'
      }
      return null

    case 'HandoverCancelled':
      if (state.handover?.id !== record.handoverId) return 'no open handover with this id'
      if (!sameAddress(state.handover.proposer, record.actor)) {
        return 'only the proposer can cancel'
      }
      return null
  }
}

// Applies a record that checkRecord accepted. Returns a new state.
export function applyRecord(state: LedgerState, record: LedgerRecord): LedgerState {
  const next = structuredClone(state)
  if (record.actor !== null) next.sealed = true

  switch (record.kind) {
    case 'BoardSet':
      next.board = [...record.members]
      next.term = 1
      break

    case 'BatchCreated':
    case 'BatchUpdated': {
      const key = batchKey(record.eventId, record.batchId)
      next.batches[key] = {
        priceCents: record.priceCents,
        quantity: record.quantity,
        resaleCapPercent: record.resaleCapPercent,
        sold: next.batches[key]?.sold ?? 0,
      }
      break
    }

    case 'BatchRemoved':
      delete next.batches[batchKey(record.eventId, record.batchId)]
      break

    case 'OpeningSalesRecorded':
      next.batches[batchKey(record.eventId, record.batchId)].sold += record.count
      break

    case 'TicketIssued':
      next.tickets[record.ticketId] = {
        eventId: record.eventId,
        batchId: record.batchId,
        owner: record.owner,
        priceCents: record.priceCents,
        paymentRef: record.paymentRef,
        status: 'valid',
        listingPriceCents: null,
      }
      next.payments[record.paymentRef] = 'ticket'
      next.batches[batchKey(record.eventId, record.batchId)].sold += 1
      break

    case 'PaymentRefunded':
      next.payments[record.paymentRef] = 'refunded'
      break

    case 'PaymentReversed': {
      const ticket = next.tickets[record.ticketId]
      next.payments[record.paymentRef] = 'reversed'
      // A ticket already resold stays with its buyer, who paid in good faith: the reversal is
      // only an income loss. Otherwise the ticket is revoked and its place goes back on sale.
      if (ticket.status === 'resold') break
      ticket.status = 'revoked'
      ticket.listingPriceCents = null
      next.batches[batchKey(ticket.eventId, ticket.batchId)].sold -= 1
      break
    }

    case 'TicketListed':
      next.tickets[record.ticketId].status = 'listed'
      next.tickets[record.ticketId].listingPriceCents = record.priceCents
      break

    case 'ListingCancelled':
      next.tickets[record.ticketId].status = 'valid'
      next.tickets[record.ticketId].listingPriceCents = null
      break

    case 'ResaleSettled': {
      const listed = next.tickets[record.listedTicketId]
      listed.status = 'resold'
      listed.listingPriceCents = null
      next.tickets[record.ticketId] = {
        eventId: listed.eventId,
        batchId: listed.batchId,
        owner: record.owner,
        priceCents: record.priceCents,
        paymentRef: record.paymentRef,
        status: 'valid',
        listingPriceCents: null,
      }
      next.payments[record.paymentRef] = 'ticket'
      break
    }

    case 'OracleChangeProposed':
      next.oracleChange = {
        id: record.proposalId,
        proposer: record.actor,
        newOracle: record.newOracle,
        approvals: [record.actor],
      }
      completeOracleChangeIfMajority(next)
      break

    case 'OracleChangeApproved':
      next.oracleChange!.approvals.push(record.actor)
      completeOracleChangeIfMajority(next)
      break

    case 'OracleChangeCancelled':
      next.oracleChange = null
      break

    case 'ExpenseProposed': {
      const approvals = [record.actor]
      next.expenses[record.expenseId] = {
        proposer: record.actor,
        approvals,
        rejections: [],
        status: expenseStatus(approvals, [], next.board ?? []),
      }
      break
    }

    case 'ExpenseVoted': {
      const expense = next.expenses[record.expenseId]
      if (record.approve) expense.approvals.push(record.actor)
      else expense.rejections.push(record.actor)
      expense.status = expenseStatus(expense.approvals, expense.rejections, next.board ?? [])
      break
    }

    case 'HandoverProposed':
      next.handover = {
        id: record.handoverId,
        proposer: record.actor,
        members: [...record.members],
        approvals: [record.actor],
      }
      completeHandoverIfMajority(next)
      break

    case 'HandoverApproved':
      next.handover!.approvals.push(record.actor)
      completeHandoverIfMajority(next)
      break

    case 'HandoverCancelled':
      next.handover = null
      break
  }
  return next
}

// Mutates `state`: once a majority of the current board approved, the new board takes office
// and every pending expense is recounted with the new board's votes only.
function completeHandoverIfMajority(state: LedgerState) {
  const { handover, board } = state
  if (!handover || !board) return
  if (!isHandoverApproved(handover.approvals, board)) return

  state.board = handover.members
  state.term += 1
  state.handover = null
  for (const expense of Object.values(state.expenses)) {
    if (expense.status === 'pending') {
      expense.status = expenseStatus(expense.approvals, expense.rejections, state.board)
    }
  }
}

function completeOracleChangeIfMajority(state: LedgerState) {
  const { oracleChange, board } = state
  if (!oracleChange || !board) return
  if (!isHandoverApproved(oracleChange.approvals, board)) return
  state.oracle = oracleChange.newOracle
  state.oracleChange = null
}
