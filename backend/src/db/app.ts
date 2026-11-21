
import {
  bigint,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Private, editable and deletable backend data (see ARCHITECTURE.md).
export const appSchema = pgSchema('app')

const at = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () => at('created_at').notNull().defaultNow()

export const associations = appSchema.table('associations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

export const accounts = appSchema.table(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    association: text('association').notNull().references(() => associations.id),
    // E-mail and name are erased by DELETE /me; the address stays, so the ledger history
    // becomes pseudonymous.
    email: text('email'),
    name: text('name'),
    address: text('address').unique(),
    createdAt: createdAt(),
    deletedAt: at('deleted_at'),
  },
  (table) => [uniqueIndex('accounts_email_idx').on(table.association, table.email)],
)

export const authCodes = appSchema.table('auth_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  association: text('association').notNull(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: at('expires_at').notNull(),
  usedAt: at('used_at'),
  createdAt: createdAt(),
})

export const sessions = appSchema.table('sessions', {
  // SHA-256 of the cookie token; the token itself is never stored.
  id: text('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: at('expires_at').notNull(),
  createdAt: createdAt(),
})

export const addressChallenges = appSchema.table('address_challenges', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  challenge: text('challenge').notNull(),
  expiresAt: at('expires_at').notNull(),
})

// Storefront content. Batches and their rules live on the ledger.
export const events = appSchema.table('events', {
  id: text('id').primaryKey(),
  association: text('association').notNull().references(() => associations.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  date: at('date').notNull(),
  location: text('location').notNull(),
  color: text('color').notNull(),
  createdAt: createdAt(),
})

// A batch's display name. Its price and quantity are ledger records.
export const batchNames = appSchema.table(
  'batch_names',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    batchId: text('batch_id').notNull(),
    name: text('name').notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.batchId] })],
)

export type OrderStatus = 'pending_payment' | 'paid' | 'issued' | 'failed' | 'refunded'

// An open order (pending payment and not expired, or paid and not yet issued) holds one
// ticket of its batch: that is the reservation.
export const orders = appSchema.table('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  association: text('association').notNull(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  eventId: text('event_id').notNull(),
  batchId: text('batch_id').notNull(),
  priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
  status: text('status').$type<OrderStatus>().notNull(),
  txid: text('txid').notNull().unique(),
  pixCopyPaste: text('pix_copy_paste').notNull(),
  expiresAt: at('expires_at').notNull(),
  // Assigned before the first issuance attempt, so retries reuse the same ticket id.
  ticketId: text('ticket_id'),
  failureReason: text('failure_reason'),
  // Roadmap (sellers): who sold this ticket.
  sellerId: text('seller_id'),
  paidAt: at('paid_at'),
  createdAt: createdAt(),
})

export const receipts = appSchema.table('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  association: text('association').notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => accounts.id),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: createdAt(),
  erasedAt: at('erased_at'),
})

export const expenseDetails = appSchema.table('expense_details', {
  expenseId: text('expense_id').primaryKey(),
  association: text('association').notNull(),
  description: text('description').notNull(),
  receiptId: uuid('receipt_id')
    .notNull()
    .references(() => receipts.id),
})

export type DraftMember = { name: string; email: string }
export type HandoverDraftStatus = 'draft' | 'proposed' | 'cancelled'

// A handover proposal before it reaches the ledger: it waits here until every proposed
// director has registered an address.
export const handoverDrafts = appSchema.table('handover_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  association: text('association').notNull(),
  proposedBy: uuid('proposed_by')
    .notNull()
    .references(() => accounts.id),
  members: jsonb('members').$type<DraftMember[]>().notNull(),
  status: text('status').$type<HandoverDraftStatus>().notNull().default('draft'),
  createdAt: createdAt(),
})

