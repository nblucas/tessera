// Drops the read tables and rebuilds them from the ledger: the open accounts are a cache
// anyone could rebuild.
import { loadConfig } from '../config'
import { createDb } from '../db/client'
import { Indexer } from '../indexer/indexer'
import { FakeLedger } from '../ledger/fakeLedger'
import { privateKeyToAccount } from 'viem/accounts'

const config = loadConfig()
const { db, pool } = createDb(config.databaseUrl)
const oracle = privateKeyToAccount(config.oraclePrivateKey)
const ledger = new FakeLedger(db, { domain: config.ledgerDomain, oracle: oracle.address })
const applied = await new Indexer(db, ledger).reindex()
console.info(`rebuilt the read tables from ${applied} ledger events`)
await pool.end()
