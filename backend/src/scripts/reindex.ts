// Drops the read tables and rebuilds them from the ledger: the open accounts are a cache
// anyone could rebuild.
import { loadConfig } from '../config'
import { createDb } from '../db/client'
import { localSigner } from '../adapters/signer'
import { Indexer } from '../indexer/indexer'
import { FakeLedger } from '../ledger/fakeLedger'

const config = loadConfig()
const { db, pool } = createDb(config.databaseUrl)
const ledger = new FakeLedger(db, {
  domain: config.ledgerDomain,
  oracle: localSigner(config.oraclePrivateKey).address,
  relayer: localSigner(config.relayerPrivateKey).address,
})
const applied = await new Indexer(db, ledger).reindex()
console.info(`rebuilt the read tables from ${applied} ledger events`)
await pool.end()
