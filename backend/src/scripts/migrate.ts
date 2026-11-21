import { loadConfig } from '../config'
import { runMigrations } from '../db/migrate'

await runMigrations(loadConfig().databaseUrl)
console.info('migrations applied')
