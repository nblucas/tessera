import type { SignedAction, SignedKind } from '@tessera/shared'
import { badRequest } from './errors'

// Checks a signed action from a request body before it reaches the ledger: its kind, its
// association and the fields that must match the route. The ledger checks the signature.
export function expectAction<K extends SignedKind>(
  input: unknown,
  kinds: K | readonly K[],
  association: string,
  matches: Record<string, unknown> = {},
): SignedAction<K> {
  const allowed: readonly SignedKind[] = Array.isArray(kinds) ? kinds : [kinds]
  const action = input as SignedAction | undefined
  if (!action || !allowed.includes(action.kind)) {
    throw badRequest(`Expected a signed ${allowed.join(' or ')} action.`)
  }
  if (action.message.association !== association) {
    throw badRequest('The action is signed for another association.')
  }
  for (const [field, value] of Object.entries(matches)) {
    if ((action.message as Record<string, unknown>)[field] !== value) {
      throw badRequest(`The action is signed for a different ${field}.`)
    }
  }
  return action as SignedAction<K>
}
