import { LocalFileStore } from './adapters/fileStore'
import { ConsoleMailer } from './adapters/mailer'
import { FakePixProvider } from './adapters/pix'
import { assertSeparateKeys, localSigner } from './adapters/signer'
import type { Config } from './config'
import { createDb } from './db/client'
import type { Deps } from './deps'
import { Indexer } from './indexer/indexer'
import type { Jobs } from './jobs'
import { FakeLedger } from './ledger/fakeLedger'
import { Relayer } from './relayer'

// Wires the demo implementations. The pilot replaces the fake ledger, Pix provider and mailer
// with real adapters behind the same interfaces.
export function createDeps(config: Config, jobs: Jobs) {
  if (!config.demoMode) {
    throw new Error(
      'Only DEMO_MODE is implemented: the real ledger, Pix provider and mailer adapters are pilot work.',
    )
  }
  const { pool, db } = createDb(config.databaseUrl)
  const oracle = localSigner(config.oraclePrivateKey)
  const relayerKey = localSigner(config.relayerPrivateKey)
  assertSeparateKeys(oracle, relayerKey)
  const ledger = new FakeLedger(db, {
    domain: config.ledgerDomain,
    oracle: oracle.address,
    relayer: relayerKey.address,
  })
  const indexer = new Indexer(db, ledger)
  const deps: Deps = {
    config,
    db,
    ledger,
    genesis: ledger,
    indexer,
    relayer: new Relayer(relayerKey, ledger, indexer),
    mailer: new ConsoleMailer(),
    pix: new FakePixProvider(config.pixWebhookSecret),
    files: new LocalFileStore(config.filesDir),
    jobs,
    oracle,
    now: () => new Date(),
  }
  return { deps, pool }
}
