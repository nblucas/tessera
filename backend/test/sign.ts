import {
  typedDataFor,
  type ActionMessage,
  type LedgerDomain,
  type SignedAction,
  type SignedKind,
} from '@tessera/shared'
import type { PrivateKeyAccount } from 'viem'

export const TEST_DOMAIN: LedgerDomain = {
  chainId: 31337,
  verifyingContract: '0x0000000000000000000000000000000000000001',
}

type Fields<K extends SignedKind> = Omit<ActionMessage<K>, 'actor' | 'nonce' | 'deadline' | 'association'>

export async function signAction<K extends SignedKind>(
  account: PrivateKeyAccount,
  kind: K,
  fields: Fields<K>,
  options: { nonce: number; association?: string; deadline?: number; domain?: LedgerDomain },
): Promise<SignedAction<K>> {
  const message = {
    ...fields,
    actor: account.address,
    nonce: options.nonce,
    deadline: options.deadline ?? Math.floor(Date.now() / 1000) + 3600,
    association: options.association ?? 'test-association',
  } as unknown as ActionMessage<K>
  const data = typedDataFor(options.domain ?? TEST_DOMAIN, kind, message)
  const signature = await account.signTypedData(data as Parameters<typeof account.signTypedData>[0])
  return { kind, message, signature } as SignedAction<K>
}
