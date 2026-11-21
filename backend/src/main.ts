import { eq } from 'drizzle-orm'
import { buildApp } from './app'
import { loadConfig } from './config'
import { associations } from './db/schema'
import { runMigrations } from './db/migrate'
import { PgBossJobs } from './jobs'
import { registerOracle } from './oracle'
import { seed } from './seed/seed'
import { createDeps } from './wiring'

const INDEXER_POLL_MS = 2000

const config = loadConfig()
await runMigrations(config.databaseUrl)

const jobs = new PgBossJobs(config.databaseUrl)
await jobs.start()
const { deps } = createDeps(config, jobs)

const [existing] = await deps.db
  .select()
  .from(associations)
  .where(eq(associations.id, config.association.id))
if (!existing) await seed(deps)

await registerOracle(deps)

// The relayer already catches up after each submit; polling picks up anything written by
// another process (and, on a real chain, confirmations that arrive later).
setInterval(() => {
  deps.indexer.catchUp().catch((error: unknown) => console.error('[indexer]', error))
}, INDEXER_POLL_MS)

const app = buildApp(deps, { logger: true })
await app.listen({ port: config.port, host: '0.0.0.0' })
