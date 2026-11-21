import { sql } from 'drizzle-orm'
import { receipts } from '../db/schema'
import type { Deps } from '../deps'
import { seed } from './seed'

// Demo only: wipes everything, including the fake ledger (which is otherwise append-only),
// and loads the seed again. Never available outside DEMO_MODE.
export async function resetDemo(deps: Deps) {
  if (!deps.config.demoMode) throw new Error('resetDemo is only available in DEMO_MODE')

  const files = await deps.db.select({ key: receipts.storageKey }).from(receipts)
  await deps.db.execute(sql`
    TRUNCATE
      app.associations, app.accounts, app.auth_codes, app.sessions, app.address_challenges,
      app.events, app.batch_names, app.orders, app.receipts, app.expense_details,
      app.handover_drafts,
      ledger.entries,
      read.indexer_cursor, read.board_terms, read.handovers, read.batches, read.tickets,
      read.expenses, read.applied_events
    RESTART IDENTITY CASCADE
  `)
  for (const file of files) await deps.files.delete(file.key)
  await seed(deps)
}
