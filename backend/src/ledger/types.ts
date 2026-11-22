import type { GenesisRecord, LedgerRecord, SignedAction } from '@tessera/shared'
import type { Address, Hex } from 'viem'

export type LedgerEvent = {
  cursor: string
  association: string
  record: LedgerRecord
  signature: Hex | null
  // The relayer that submitted the entry; null for genesis records.
  submittedBy: Address | null
  prevHash: string
  hash: string
  recordedAt: string
}

// The one boundary shared with the ledger contracts. The fake ledger implements it for the
// demo; the real chain adapter will implement the same interface.
export interface Ledger {
  submit(action: SignedAction): Promise<{ entryId: string }>
  readEvents(fromCursor: string | null, limit: number): Promise<{
    events: LedgerEvent[]
    next: string | null
  }>
  nextNonce(actor: Address): Promise<number>
}

// Seed-only: writes genesis records before any signed record exists.
export interface GenesisWriter {
  writeGenesis(association: string, records: GenesisRecord[]): Promise<void>
  // Returns the chain to its pre-genesis state when the ledger supports it.
  reset?(): Promise<void>
}

export type RejectionCode = 'malformed' | 'bad_signature' | 'bad_nonce' | 'expired' | 'rule'

export class LedgerRejection extends Error {
  readonly code: RejectionCode

  constructor(code: RejectionCode, message: string) {
    super(message)
    this.code = code
    this.name = 'LedgerRejection'
  }
}
