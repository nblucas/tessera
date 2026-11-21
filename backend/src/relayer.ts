import type { SignedAction } from '@tessera/shared'
import type { Signer } from './adapters/signer'
import type { Indexer } from './indexer/indexer'
import type { Ledger } from './ledger/types'

// Forwards signed actions to the ledger and pays the fees with its own key, separate from the
// oracle's. With the fake ledger there are no fees: the ledger records the relayer's address
// as the submitter, and the relayer lets the indexer catch up right away.
export class Relayer {
  readonly signer: Signer
  private readonly ledger: Ledger
  private readonly indexer: Indexer

  constructor(signer: Signer, ledger: Ledger, indexer: Indexer) {
    this.signer = signer
    this.ledger = ledger
    this.indexer = indexer
  }

  async submit(action: SignedAction): Promise<void> {
    await this.ledger.submit(action)
    await this.indexer.catchUp()
  }
}
