import { localSigner } from '../adapters/signer'
import type { Config } from '../config'
import type { Db } from '../db/client'
import { ChainLedger } from './chainLedger'
import { FakeLedger } from './fakeLedger'
import type { GenesisWriter, Ledger } from './types'

// Checks a chain ledger against the backend's keys before the server starts.
export async function checkLedger(ledger: Ledger, config: Config): Promise<void> {
  if (!(ledger instanceof ChainLedger)) return
  await ledger.checkDeployment({
    association: config.association.id,
    oracle: localSigner(config.oraclePrivateKey).address,
    relayer: localSigner(config.relayerPrivateKey).address,
  })
}

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
