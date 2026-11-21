import type { FileStore } from './adapters/fileStore'
import type { Mailer } from './adapters/mailer'
import type { PixProvider } from './adapters/pix'
import type { Signer } from './adapters/signer'
import type { Config } from './config'
import type { Db } from './db/client'
import type { Indexer } from './indexer/indexer'
import type { Jobs } from './jobs'
import type { GenesisWriter, Ledger } from './ledger/types'
import type { Relayer } from './relayer'

// Everything the app needs from the outside world. main.ts wires the real implementations;
// tests wire fakes at the same interfaces.
export type Deps = {
  config: Config
  db: Db
  ledger: Ledger
  genesis: GenesisWriter
  indexer: Indexer
  relayer: Relayer
  mailer: Mailer
  pix: PixProvider
  files: FileStore
  jobs: Jobs
  oracle: Signer
  now: () => Date
}
