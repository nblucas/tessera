// Drops the read tables and rebuilds them from the ledger: the open accounts are a cache
// anyone could rebuild.
import { loadConfig } from '../config'
import { createDb } from '../db/client'
import { Indexer } from '../indexer/indexer'
import { createLedger } from '../ledger/factory'

const config = loadConfig()
const { db, pool } = createDb(config.databaseUrl)
const ledger = createLedger(config, db)
const applied = await new Indexer(db, ledger).reindex()
console.info(`rebuilt the read tables from ${applied} ledger events`)
await pool.end()
