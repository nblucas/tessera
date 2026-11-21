import type { SignedAction } from '@tessera/shared'
import type { Indexer } from './indexer/indexer'
import type { Ledger } from './ledger/types'

// Forwards signed actions to the ledger and pays the fees. With the fake ledger there are no
// fees, so it only submits and then lets the indexer catch up. A real chain adapter will hold
// its own gas key behind the Signer interface.
export class Relayer {
  private readonly ledger: Ledger
  private readonly indexer: Indexer

  constructor(ledger: Ledger, indexer: Indexer) {
    this.ledger = ledger
    this.indexer = indexer
  }

  async submit(action: SignedAction): Promise<void> {
    await this.ledger.submit(action)
    await this.indexer.catchUp()
  }
}
