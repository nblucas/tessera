// Example cases for the ledger rules. They are plain data so the ledger contracts can be
// tested against the same cases as the fake ledger.
//
// Each example applies `given` in order (every record must be accepted), then checks `when`.
import type { Address } from 'viem'
import type { ExpenseStatus, TicketStatus } from './rules'
import type { LedgerRecord } from './records'

export type RuleExample = {
  name: string
  given: LedgerRecord[]
  when: LedgerRecord
  then:
    | { rejected: string }
    | {
        accepted: {
          board?: Address[]
          term?: number
          handoverOpen?: boolean
          expenseStatus?: Record<string, ExpenseStatus>
          sold?: Record<string, number>
          ticketStatus?: Record<string, TicketStatus>
          ticketOwner?: Record<string, Address>
          oracle?: Address
        }
      }
}

export const ORACLE: Address = '0x0000000000000000000000000000000000000099'
const A: Address = '0x00000000000000000000000000000000000000a1'
const B: Address = '0x00000000000000000000000000000000000000b2'
const C: Address = '0x00000000000000000000000000000000000000c3'
const D: Address = '0x00000000000000000000000000000000000000d4'
const E: Address = '0x00000000000000000000000000000000000000e5'
const STUDENT: Address = '0x00000000000000000000000000000000000000f6'

const board: LedgerRecord = { kind: 'BoardSet', actor: null, members: [A, B, C] }

const expense = (actor: Address, expenseId = 'x1'): LedgerRecord => ({
  kind: 'ExpenseProposed',
  actor,
  expenseId,
  amountCents: 120000,
  category: 'Suppliers',
  eventId: 'party',
  receiptSha256: 'a'.repeat(64),
})

const vote = (actor: Address, approve: boolean, expenseId = 'x1'): LedgerRecord => ({
  kind: 'ExpenseVoted',
  actor,
  expenseId,
  approve,
})

const genesisBatch: LedgerRecord = {
  kind: 'BatchCreated',
  actor: null,
  eventId: 'party',
  batchId: 'b1',
  priceCents: 5500,
  quantity: 100,
  resaleCapPercent: 120,
}

const NEW_ORACLE: Address = '0x0000000000000000000000000000000000000088'

export const RULE_EXAMPLES: RuleExample[] = [
  {
    name: 'proposing an expense counts as the first approval',
    given: [board],
    when: expense(A),
    then: { accepted: { expenseStatus: { x1: 'pending' } } },
  },
  {
    name: 'a second approval from a 3-member board approves the expense',
    given: [board, expense(A)],
    when: vote(B, true),
    then: { accepted: { expenseStatus: { x1: 'approved' } } },
  },
  {
    name: 'two rejections from a 3-member board reject the expense',
    given: [board, expense(A), vote(B, false)],
    when: vote(C, false),
    then: { accepted: { expenseStatus: { x1: 'rejected' } } },
  },
  {
    name: 'one approval and one rejection keep the expense pending',
    given: [board, expense(A)],
    when: vote(B, false),
    then: { accepted: { expenseStatus: { x1: 'pending' } } },
  },
  {
    name: 'only board members can propose expenses',
    given: [board],
    when: expense(STUDENT),
    then: { rejected: 'not a board member' },
  },
  {
    name: 'only board members can vote',
    given: [board, expense(A)],
    when: vote(STUDENT, true),
    then: { rejected: 'not a board member' },
  },
  {
    name: 'each director votes once',
    given: [board, expense(A)],
    when: vote(A, true),
    then: { rejected: 'already voted' },
  },
  {
    name: 'a decided expense takes no more votes',
    given: [board, expense(A), vote(B, true)],
    when: vote(C, false),
    then: { rejected: 'not pending' },
  },
  {
    name: 'expense amounts must be positive whole cents',
    given: [board],
    when: { ...(expense(A) as object), amountCents: 0 } as LedgerRecord,
    then: { rejected: 'amount' },
  },
  {
    name: 'expense receipts need a SHA-256 hash',
    given: [board],
    when: { ...(expense(A) as object), receiptSha256: 'abc' } as LedgerRecord,
    then: { rejected: 'receipt hash' },
  },
  {
    name: 'a single-member board approves its own proposals at once',
    given: [{ kind: 'BoardSet', actor: null, members: [A] }],
    when: expense(A),
    then: { accepted: { expenseStatus: { x1: 'approved' } } },
  },

  // Handover
  {
    name: 'proposing a handover counts as the first approval',
    given: [board],
    when: propose(A, [D, E]),
    then: { accepted: { handoverOpen: true, board: [A, B, C], term: 1 } },
  },
  {
    name: 'a majority of the current board starts the new term',
    given: [board, propose(A, [D, E])],
    when: approveHandover(B),
    then: { accepted: { handoverOpen: false, board: [D, E], term: 2 } },
  },
  {
    name: 'only current directors can propose a handover',
    given: [board],
    when: propose(STUDENT, [D, E]),
    then: { rejected: 'not a board member' },
  },
  {
    name: 'only one handover can be open at a time',
    given: [board, propose(A, [D, E])],
    when: propose(B, [D]),
    then: { rejected: 'handover already open' },
  },
  {
    name: 'a proposed board needs at least one director',
    given: [board],
    when: propose(A, []),
    then: { rejected: 'at least one' },
  },
  {
    name: 'a proposed board cannot list the same address twice',
    given: [board],
    when: propose(A, [D, D]),
    then: { rejected: 'duplicate' },
  },
  {
    name: 'each director approves a handover once',
    given: [board, propose(A, [D, E])],
    when: approveHandover(A),
    then: { rejected: 'already approved' },
  },
  {
    name: 'approvals must name the open handover',
    given: [board, propose(A, [D, E])],
    when: { kind: 'HandoverApproved', actor: B, handoverId: 'other' },
    then: { rejected: 'no open handover' },
  },
  {
    name: 'the proposer can cancel an open handover',
    given: [board, propose(A, [D, E])],
    when: { kind: 'HandoverCancelled', actor: A, handoverId: 'h1' },
    then: { accepted: { handoverOpen: false, board: [A, B, C] } },
  },
  {
    name: 'only the proposer can cancel a handover',
    given: [board, propose(A, [D, E])],
    when: { kind: 'HandoverCancelled', actor: B, handoverId: 'h1' },
    then: { rejected: 'only the proposer' },
  },
  {
    name: 'former directors can no longer vote',
    given: [board, expense(A), propose(A, [D, E]), approveHandover(B)],
    when: vote(B, true),
    then: { rejected: 'not a board member' },
  },
  {
    name: 'votes from former directors stop counting after a handover',
    given: [board, expense(A), propose(A, [D, E]), approveHandover(B)],
    when: vote(D, true),
    then: { accepted: { expenseStatus: { x1: 'pending' } } },
  },
  {
    name: 'the new board decides pending expenses with its own votes',
    given: [board, expense(A), propose(A, [D, E]), approveHandover(B), vote(D, true)],
    when: vote(E, true),
    then: { accepted: { expenseStatus: { x1: 'approved' } } },
  },
  {
    name: 'a director who stays on the new board keeps their earlier vote',
    given: [board, expense(A), propose(A, [A, D, E]), approveHandover(B)],
    when: vote(D, true),
    then: { accepted: { expenseStatus: { x1: 'approved' } } },
  },
  {
    name: 'a handover recounts pending expenses at once',
    given: [board, expense(A), propose(B, [A]), approveHandover(C)],
    when: expense(A, 'x2'),
    then: { accepted: { expenseStatus: { x1: 'approved', x2: 'approved' } } },
  },
  {
    name: 'decided expenses stay decided after a handover',
    given: [board, expense(A), vote(B, true), propose(A, [D, E])],
    when: approveHandover(C),
    then: { accepted: { expenseStatus: { x1: 'approved' } } },
  },

  // Genesis
  {
    name: 'the board is set once',
    given: [board],
    when: board,
    then: { rejected: 'board already set' },
  },
  {
    name: 'genesis records are refused once a signed record exists',
    given: [board, expense(A)],
    when: genesisBatch,
    then: { rejected: 'genesis is closed' },
  },
  {
    name: 'opening sales count as sold tickets',
    given: [board, genesisBatch],
    when: openingSales(30),
    then: { accepted: { sold: { 'party/b1': 30 } } },
  },
  {
    name: 'opening sales cannot exceed the batch quantity',
    given: [board, genesisBatch],
    when: openingSales(101),
    then: { rejected: 'exceed the quantity' },
  },

  // Batches
  {
    name: 'directors create batches',
    given: [board],
    when: batch('BatchCreated', A),
    then: { accepted: { sold: { 'party/b1': 0 } } },
  },
  {
    name: 'only directors create batches',
    given: [board],
    when: batch('BatchCreated', STUDENT),
    then: { rejected: 'not a board member' },
  },
  {
    name: 'a batch id is used once per event',
    given: [board, batch('BatchCreated', A)],
    when: batch('BatchCreated', B),
    then: { rejected: 'batch already exists' },
  },
  {
    name: 'batch prices must be positive whole cents',
    given: [board],
    when: batch('BatchCreated', A, { priceCents: 0 }),
    then: { rejected: 'price' },
  },
  {
    name: 'batch quantities must be positive whole numbers',
    given: [board],
    when: batch('BatchCreated', A, { quantity: 1.5 }),
    then: { rejected: 'quantity' },
  },
  {
    name: 'a batch without sales can be changed',
    given: [board, batch('BatchCreated', A)],
    when: batch('BatchUpdated', B, { priceCents: 6000 }),
    then: { accepted: {} },
  },
  {
    name: 'a batch is frozen after its first sale',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: batch('BatchUpdated', B, { quantity: 200 }),
    then: { rejected: 'frozen' },
  },
  {
    name: 'a batch with sales cannot be removed',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: { kind: 'BatchRemoved', actor: A, eventId: 'party', batchId: 'b1' },
    then: { rejected: 'frozen' },
  },
  {
    name: 'a removed batch sells no tickets',
    given: [
      board,
      batch('BatchCreated', A),
      { kind: 'BatchRemoved', actor: A, eventId: 'party', batchId: 'b1' },
    ],
    when: ticket('t1'),
    then: { rejected: 'unknown batch' },
  },

  // Tickets
  {
    name: 'the oracle issues tickets',
    given: [board, batch('BatchCreated', A)],
    when: ticket('t1'),
    then: { accepted: { sold: { 'party/b1': 1 } } },
  },
  {
    name: 'only the oracle issues tickets',
    given: [board, batch('BatchCreated', A)],
    when: { ...(ticket('t1') as object), actor: A } as LedgerRecord,
    then: { rejected: 'only the oracle' },
  },
  {
    name: 'a ticket is issued at the batch price',
    given: [board, batch('BatchCreated', A)],
    when: { ...(ticket('t1') as object), priceCents: 100 } as LedgerRecord,
    then: { rejected: 'price' },
  },
  {
    name: 'a ticket id is issued once',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: ticket('t1'),
    then: { rejected: 'ticket already issued' },
  },
  {
    name: 'a sold-out batch issues no more tickets',
    given: [board, genesisBatch, openingSales(100)],
    when: ticket('t1'),
    then: { rejected: 'sold out' },
  },

  // Payment outcomes reported by the oracle
  {
    name: 'a payment produces one ticket only',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: { ...(ticket('t2') as object), paymentRef: ref('t1') } as LedgerRecord,
    then: { rejected: 'payment already reported' },
  },
  {
    name: 'a ticket needs a payment reference',
    given: [board, batch('BatchCreated', A)],
    when: { ...(ticket('t1') as object), paymentRef: 'abc' } as LedgerRecord,
    then: { rejected: 'payment reference' },
  },
  {
    name: 'the oracle reports a refunded payment once',
    given: [board, batch('BatchCreated', A), refund(ref('p1'))],
    when: refund(ref('p1')),
    then: { rejected: 'payment already reported' },
  },
  {
    name: 'a refunded payment cannot become a ticket',
    given: [board, batch('BatchCreated', A), refund(ref('t1'))],
    when: ticket('t1'),
    then: { rejected: 'payment already reported' },
  },
  {
    name: 'only the oracle reports refunds',
    given: [board],
    when: refund(ref('p1'), A),
    then: { rejected: 'only the oracle' },
  },
  {
    name: 'a reversed payment revokes its ticket and returns it to stock',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: reverse('t1'),
    then: { accepted: { ticketStatus: { t1: 'revoked' }, sold: { 'party/b1': 0 } } },
  },
  {
    name: 'a reversal must name the payment of that ticket',
    given: [board, batch('BatchCreated', A), ticket('t1'), ticket('t2')],
    when: { ...(reverse('t1') as object), paymentRef: ref('t2') } as LedgerRecord,
    then: { rejected: 'does not match the ticket' },
  },
  {
    name: 'a ticket is reversed once',
    given: [board, batch('BatchCreated', A), ticket('t1'), reverse('t1')],
    when: reverse('t1'),
    then: { rejected: 'already reversed' },
  },
  {
    name: 'only the oracle reports reversals',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: reverse('t1', A),
    then: { rejected: 'only the oracle' },
  },

  // Resale
  {
    name: 'the owner lists a ticket within the resale cap',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: list('t1', 6600),
    then: { accepted: { ticketStatus: { t1: 'listed' } } },
  },
  {
    name: 'a listing above the resale cap is refused',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: list('t1', 6601),
    then: { rejected: 'above the resale cap' },
  },
  {
    name: 'only the owner lists a ticket',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: list('t1', 5000, D),
    then: { rejected: 'only the owner' },
  },
  {
    name: 'a listed ticket cannot be listed again',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 5000)],
    when: list('t1', 5500),
    then: { rejected: 'not valid' },
  },
  {
    name: 'a revoked ticket cannot be resold',
    given: [board, batch('BatchCreated', A), ticket('t1'), reverse('t1')],
    when: list('t1', 5000),
    then: { rejected: 'not valid' },
  },
  {
    name: 'the owner cancels a listing',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 5000)],
    when: { kind: 'ListingCancelled', actor: STUDENT, ticketId: 't1' },
    then: { accepted: { ticketStatus: { t1: 'valid' } } },
  },
  {
    name: 'a paid resale moves the ticket to the buyer',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 6000)],
    when: settle('t1', 't2', 6000),
    then: {
      accepted: {
        ticketStatus: { t1: 'resold', t2: 'valid' },
        ticketOwner: { t2: D },
        sold: { 'party/b1': 1 },
      },
    },
  },
  {
    name: 'a resale is settled at the listed price',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 6000)],
    when: settle('t1', 't2', 5000),
    then: { rejected: 'listed price' },
  },
  {
    name: 'a resale splits royalty, platform fee and payout as fixed',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 6000)],
    when: { ...(settle('t1', 't2', 6000) as object), royaltyCents: 0, payoutCents: 5700 } as LedgerRecord,
    then: { rejected: 'split' },
  },
  {
    name: 'a ticket that is not listed cannot be bought',
    given: [board, batch('BatchCreated', A), ticket('t1')],
    when: settle('t1', 't2', 5500),
    then: { rejected: 'not listed' },
  },
  {
    name: 'nobody buys their own listing',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 6000)],
    when: settle('t1', 't2', 6000, STUDENT),
    then: { rejected: 'own listing' },
  },
  {
    name: 'a reversed resale revokes the new ticket',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 6000), settle('t1', 't2', 6000)],
    when: { kind: 'PaymentReversed', actor: ORACLE, paymentRef: ref('t2'), ticketId: 't2', amountCents: 6000 },
    then: { accepted: { ticketStatus: { t2: 'revoked' }, sold: { 'party/b1': 0 } } },
  },

  {
    name: 'a reversal after the ticket was resold is recorded, and the buyer keeps their ticket',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 6000), settle('t1', 't2', 6000)],
    when: reverse('t1'),
    then: { accepted: { ticketStatus: { t1: 'resold', t2: 'valid' }, sold: { 'party/b1': 1 } } },
  },
  {
    name: 'a payment is reversed once, even after a resale',
    given: [board, batch('BatchCreated', A), ticket('t1'), list('t1', 6000), settle('t1', 't2', 6000), reverse('t1')],
    when: reverse('t1'),
    then: { rejected: 'already reversed' },
  },

  // Replacing the oracle
  {
    name: 'a majority of the board replaces the oracle',
    given: [board, { kind: 'OracleChangeProposed', actor: A, proposalId: 'o1', newOracle: NEW_ORACLE }],
    when: { kind: 'OracleChangeApproved', actor: B, proposalId: 'o1' },
    then: { accepted: { oracle: NEW_ORACLE } },
  },
  {
    name: 'the former oracle can no longer issue tickets',
    given: [
      board,
      batch('BatchCreated', A),
      { kind: 'OracleChangeProposed', actor: A, proposalId: 'o1', newOracle: NEW_ORACLE },
      { kind: 'OracleChangeApproved', actor: B, proposalId: 'o1' },
    ],
    when: ticket('t1'),
    then: { rejected: 'only the oracle' },
  },
  {
    name: 'only directors propose a new oracle',
    given: [board],
    when: { kind: 'OracleChangeProposed', actor: STUDENT, proposalId: 'o1', newOracle: NEW_ORACLE },
    then: { rejected: 'not a board member' },
  },
  {
    name: 'one oracle change is open at a time',
    given: [board, { kind: 'OracleChangeProposed', actor: A, proposalId: 'o1', newOracle: NEW_ORACLE }],
    when: { kind: 'OracleChangeProposed', actor: B, proposalId: 'o2', newOracle: NEW_ORACLE },
    then: { rejected: 'oracle change already open' },
  },
  {
    name: 'the proposer cancels an oracle change',
    given: [board, { kind: 'OracleChangeProposed', actor: A, proposalId: 'o1', newOracle: NEW_ORACLE }],
    when: { kind: 'OracleChangeCancelled', actor: A, proposalId: 'o1' },
    then: { accepted: { oracle: ORACLE } },
  },
]


function openingSales(count: number): LedgerRecord {
  return {
    kind: 'OpeningSalesRecorded',
    actor: null,
    eventId: 'party',
    batchId: 'b1',
    count,
    amountCents: count * 5500,
  }
}

function batch(
  kind: 'BatchCreated' | 'BatchUpdated',
  actor: Address,
  fields: { priceCents?: number; quantity?: number } = {},
): LedgerRecord {
  return {
    kind,
    actor,
    eventId: 'party',
    batchId: 'b1',
    priceCents: 5500,
    quantity: 100,
    resaleCapPercent: 120,
    ...fields,
  }
}

function ticket(ticketId: string): LedgerRecord {
  return {
    kind: 'TicketIssued',
    actor: ORACLE,
    ticketId,
    eventId: 'party',
    batchId: 'b1',
    owner: STUDENT,
    priceCents: 5500,
    orderRef: `order-${ticketId}`,
    paymentRef: ref(ticketId),
  }
}

// A stand-in for SHA-256(e2eid): 64 hex characters derived from a label.
function ref(label: string): string {
  return Array.from(label, (char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(64, '0')
}


function refund(paymentRef: string, actor: Address = ORACLE): LedgerRecord {
  return { kind: 'PaymentRefunded', actor, paymentRef, amountCents: 5500, orderRef: 'order-r', reason: 'batch is sold out' }
}

function reverse(ticketId: string, actor: Address = ORACLE): LedgerRecord {
  return { kind: 'PaymentReversed', actor, paymentRef: ref(ticketId), ticketId, amountCents: 5500 }
}

function list(ticketId: string, priceCents: number, actor: Address = STUDENT): LedgerRecord {
  return { kind: 'TicketListed', actor, ticketId, priceCents }
}

function settle(listedTicketId: string, ticketId: string, priceCents: number, owner: Address = D): LedgerRecord {
  const royaltyCents = Math.round(priceCents * 0.1)
  const platformFeeCents = Math.round(priceCents * 0.05)
  return {
    kind: 'ResaleSettled',
    actor: ORACLE,
    paymentRef: ref(ticketId),
    listedTicketId,
    ticketId,
    owner,
    priceCents,
    royaltyCents,
    platformFeeCents,
    payoutCents: priceCents - royaltyCents - platformFeeCents,
    orderRef: `order-${ticketId}`,
  }
}

function propose(actor: Address, members: Address[]): LedgerRecord {
  return { kind: 'HandoverProposed', actor, handoverId: 'h1', members }
}

function approveHandover(actor: Address): LedgerRecord {
  return { kind: 'HandoverApproved', actor, handoverId: 'h1' }
}
