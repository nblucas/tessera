import type { ExpenseStatus } from '@tessera/shared'
import type { Address } from 'viem'
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// Read tables built by the indexer from ledger events. Anyone could rebuild them from the
// ledger; `npm run reindex` does exactly that.
export const readSchema = pgSchema('read')

const at = (name: string) => timestamp(name, { withTimezone: true })

export const indexerCursor = readSchema.table('indexer_cursor', {
  name: text('name').primaryKey(),
  cursor: text('cursor'),
})

export const boardTerms = readSchema.table(
  'board_terms',
  {
    association: text('association').notNull(),
    term: integer('term').notNull(),
    members: jsonb('members').$type<Address[]>().notNull(),
    startedAt: at('started_at').notNull(),
    endedAt: at('ended_at'),
  },
  (table) => [primaryKey({ columns: [table.association, table.term] })],
)

export type HandoverStatus = 'open' | 'approved' | 'cancelled'

export const handovers = readSchema.table(
  'handovers',
  {
    association: text('association').notNull(),
    handoverId: text('handover_id').notNull(),
    proposer: text('proposer').$type<Address>().notNull(),
    members: jsonb('members').$type<Address[]>().notNull(),
    approvals: jsonb('approvals').$type<Address[]>().notNull(),
    status: text('status').$type<HandoverStatus>().notNull(),
    proposedAt: at('proposed_at').notNull(),
    closedAt: at('closed_at'),
  },
  (table) => [primaryKey({ columns: [table.association, table.handoverId] })],
)

export const batches = readSchema.table(
  'batches',
  {
    association: text('association').notNull(),
    eventId: text('event_id').notNull(),
    batchId: text('batch_id').notNull(),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    quantity: integer('quantity').notNull(),
    sold: integer('sold').notNull().default(0),
    openingSold: integer('opening_sold').notNull().default(0),
    openingAmountCents: bigint('opening_amount_cents', { mode: 'number' }).notNull().default(0),
    removed: boolean('removed').notNull().default(false),
    createdAt: at('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.association, table.eventId, table.batchId] })],
)

export const tickets = readSchema.table('tickets', {
  ticketId: text('ticket_id').primaryKey(),
  association: text('association').notNull(),
  eventId: text('event_id').notNull(),
  batchId: text('batch_id').notNull(),
  owner: text('owner').$type<Address>().notNull(),
  priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
  orderRef: text('order_ref').notNull(),
  issuedAt: at('issued_at').notNull(),
})

export const expenses = readSchema.table('expenses', {
  expenseId: text('expense_id').primaryKey(),
  association: text('association').notNull(),
  proposer: text('proposer').$type<Address>().notNull(),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  category: text('category').notNull(),
  // Null for a general expense not tied to an event.
  eventId: text('event_id'),
  receiptSha256: text('receipt_sha256').notNull(),
  approvals: jsonb('approvals').$type<Address[]>().notNull(),
  rejections: jsonb('rejections').$type<Address[]>().notNull(),
  status: text('status').$type<ExpenseStatus>().notNull(),
  proposedAt: at('proposed_at').notNull(),
  decidedAt: at('decided_at'),
})
