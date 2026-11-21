import type { LedgerRecord } from '@tessera/shared'
import type { Address } from 'viem'
import { bigint, bigserial, index, jsonb, pgSchema, text, timestamp } from 'drizzle-orm/pg-core'

// Demo only: the fake ledger. On a real chain this data lives in the contracts.
export const ledgerSchema = pgSchema('ledger')

export const entries = ledgerSchema.table(
  'entries',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    association: text('association').notNull(),
    kind: text('kind').notNull(),
    // Null for genesis records written by the seed.
    actor: text('actor').$type<Address>(),
    nonce: bigint('nonce', { mode: 'number' }),
    record: jsonb('record').$type<LedgerRecord>().notNull(),
    signature: text('signature'),
    // The relayer that submitted the entry and paid for it (msg.sender on a real chain).
    submittedBy: text('submitted_by').$type<Address>(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull().unique(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('entries_association_idx').on(table.association, table.seq),
    index('entries_actor_idx').on(table.actor, table.nonce),
  ],
)
