import {
  typedDataFor,
  type ActionMessage,
  type LedgerDomain,
  type SignedAction,
  type SignedKind,
} from '@tessera/shared'
import type { PrivateKeyAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { api } from '../api/client'
import type { Me } from '../api/types'
import { loadOrCreateKey } from './keyStore'

export type ActionFields<K extends SignedKind> = Omit<
  ActionMessage<K>,
  'actor' | 'nonce' | 'deadline' | 'association'
>

export type Sign = <K extends SignedKind>(kind: K, fields: ActionFields<K>) => Promise<SignedAction<K>>

const DEADLINE_SECONDS = 15 * 60

type DomainResponse = LedgerDomain & { association: string }
let domainRequest: Promise<DomainResponse> | null = null

function ledgerDomain(): Promise<DomainResponse> {
  domainRequest ??= api.get<DomainResponse>('/ledger/domain')
  return domainRequest
}

// Makes sure the account has this browser's wallet address, registering it on first sign-in.
// Returns the updated account, or an error if the account already has another address.
export async function connectWallet(
  me: Me,
): Promise<{ me: Me; account: PrivateKeyAccount | null; error: string | null }> {
  if (!me.email) return { me, account: null, error: null }
  const account = privateKeyToAccount(await loadOrCreateKey(me.email))

  if (!me.address) {
    const { challenge } = await api.post<{ challenge: string }>('/me/address/challenge')
    const signature = await account.signMessage({ message: challenge })
    const updated = await api.post<Me>('/me/address', { address: account.address, signature })
    return { me: updated, account, error: null }
  }
  if (me.address.toLowerCase() !== account.address.toLowerCase()) {
    return {
      me,
      account: null,
      error:
        'Your wallet key is in another browser, so this one cannot sign board actions. Demo limitation: sign in from the browser you used first.',
    }
  }
  return { me, account, error: null }
}

// Signs a ledger action with the user's own key. The backend only relays it.
export function signerFor(account: PrivateKeyAccount): Sign {
  return async (kind, fields) => {
    const [{ association, chainId, verifyingContract }, { nonce }] = await Promise.all([
      ledgerDomain(),
      api.get<{ nonce: number }>('/me/nonce'),
    ])
    const message = {
      ...fields,
      actor: account.address,
      nonce,
      deadline: Math.floor(Date.now() / 1000) + DEADLINE_SECONDS,
      association,
    } as unknown as ActionMessage<typeof kind>
    const typed = typedDataFor({ chainId, verifyingContract }, kind, message)
    const signature = await account.signTypedData(
      typed as Parameters<typeof account.signTypedData>[0],
    )
    return { kind, message, signature } as SignedAction<typeof kind>
  }
}
