import type { LocalAccount } from 'viem'
import type { Mailer } from './adapters/mailer'
import type { Config } from './config'
import type { Db } from './db/client'
import type { Indexer } from './indexer/indexer'
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
  oracle: LocalAccount
  now: () => Date
}
