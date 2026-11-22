import { localSigner } from '../adapters/signer'
import type { Config } from '../config'
import type { Db } from '../db/client'
import { ChainLedger } from './chainLedger'
import { FakeLedger } from './fakeLedger'
import type { GenesisWriter, Ledger } from './types'

export function createLedger(config: Config, db: Db): Ledger & GenesisWriter {
  if (config.ledgerRpcUrl) {
    return new ChainLedger({
      rpcUrl: config.ledgerRpcUrl,
      chainId: config.ledgerDomain.chainId,
      contract: config.ledgerDomain.verifyingContract,
      relayerPrivateKey: config.relayerPrivateKey,
    })
  }

  return new FakeLedger(db, {
    domain: config.ledgerDomain,
    oracle: localSigner(config.oraclePrivateKey).address,
    relayer: localSigner(config.relayerPrivateKey).address,
  })
}
