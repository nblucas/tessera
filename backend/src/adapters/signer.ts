import type { LocalAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'

// A backend key: the oracle's (signs ticket issuance) or the relayer's (submits other
// people's signed actions and pays the fees). Demo: private keys from the environment.
// Pilot: a KMS or remote signer behind the same interface.
export type Signer = Pick<LocalAccount, 'address' | 'signTypedData'>

export function localSigner(privateKey: Hex): Signer {
  return privateKeyToAccount(privateKey)
}

export function assertSeparateKeys(oracle: Signer, relayer: Signer): void {
  if (oracle.address.toLowerCase() === relayer.address.toLowerCase()) {
    throw new Error('The oracle and the relayer must use different keys.')
  }
}

