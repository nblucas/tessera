// EIP-712 typed messages for every signed ledger action. The ledger contracts must use the
// same domain and types, so a signature made in the app is valid on the real chain too.
import { recoverTypedDataAddress, type Address, type Hex, type TypedDataDomain } from 'viem'
import type { SignedKind, SignedRecord } from './records'

const envelope = [
  { name: 'actor', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'association', type: 'string' },
] as const

const batchFields = [
  { name: 'eventId', type: 'string' },
  { name: 'batchId', type: 'string' },
  { name: 'priceCents', type: 'uint256' },
  { name: 'quantity', type: 'uint256' },
  { name: 'resaleCapPercent', type: 'uint256' },
] as const

export const EIP712_TYPES = {
  BatchCreated: [...envelope, ...batchFields],
  BatchUpdated: [...envelope, ...batchFields],
  BatchRemoved: [
    ...envelope,
    { name: 'eventId', type: 'string' },
    { name: 'batchId', type: 'string' },
  ],
  HandoverProposed: [
    ...envelope,
    { name: 'handoverId', type: 'string' },
    { name: 'members', type: 'address[]' },
  ],
  HandoverApproved: [...envelope, { name: 'handoverId', type: 'string' }],
  HandoverCancelled: [...envelope, { name: 'handoverId', type: 'string' }],
  TicketIssued: [
    ...envelope,
    { name: 'ticketId', type: 'string' },
    { name: 'eventId', type: 'string' },
    { name: 'batchId', type: 'string' },
    { name: 'owner', type: 'address' },
    { name: 'priceCents', type: 'uint256' },
    { name: 'orderRef', type: 'string' },
    { name: 'paymentRef', type: 'bytes32' },
  ],
  ExpenseProposed: [
    ...envelope,
    { name: 'expenseId', type: 'string' },
    { name: 'amountCents', type: 'uint256' },
    { name: 'category', type: 'string' },
    { name: 'eventId', type: 'string' },
    { name: 'receiptSha256', type: 'bytes32' },
  ],
  ExpenseVoted: [
    ...envelope,
    { name: 'expenseId', type: 'string' },
    { name: 'approve', type: 'bool' },
  ],
  PaymentRefunded: [
    ...envelope,
    { name: 'paymentRef', type: 'bytes32' },
    { name: 'amountCents', type: 'uint256' },
    { name: 'orderRef', type: 'string' },
    { name: 'reason', type: 'string' },
  ],
  PaymentReversed: [
    ...envelope,
    { name: 'paymentRef', type: 'bytes32' },
    { name: 'ticketId', type: 'string' },
    { name: 'amountCents', type: 'uint256' },
  ],
  TicketListed: [
    ...envelope,
    { name: 'ticketId', type: 'string' },
    { name: 'priceCents', type: 'uint256' },
  ],
  ListingCancelled: [...envelope, { name: 'ticketId', type: 'string' }],
  ResaleSettled: [
    ...envelope,
    { name: 'paymentRef', type: 'bytes32' },
    { name: 'listedTicketId', type: 'string' },
    { name: 'ticketId', type: 'string' },
    { name: 'owner', type: 'address' },
    { name: 'priceCents', type: 'uint256' },
    { name: 'royaltyCents', type: 'uint256' },
    { name: 'platformFeeCents', type: 'uint256' },
    { name: 'payoutCents', type: 'uint256' },
    { name: 'orderRef', type: 'string' },
  ],
  OracleChangeProposed: [
    ...envelope,
    { name: 'proposalId', type: 'string' },
    { name: 'newOracle', type: 'address' },
  ],
  OracleChangeApproved: [...envelope, { name: 'proposalId', type: 'string' }],
  OracleChangeCancelled: [...envelope, { name: 'proposalId', type: 'string' }],
} as const satisfies Record<SignedKind, readonly { name: string; type: string }[]>

// What the client signs: the record's fields without `kind`, plus the envelope.
export type ActionMessage<K extends SignedKind = SignedKind> = K extends SignedKind
  ? Omit<Extract<SignedRecord, { kind: K }>, 'kind'> & {
      nonce: number
      deadline: number
      association: string
    }
  : never

export type SignedAction<K extends SignedKind = SignedKind> = K extends SignedKind
  ? { kind: K; message: ActionMessage<K>; signature: Hex }
  : never

export type LedgerDomain = { chainId: number; verifyingContract: Address }

export function ledgerDomain({ chainId, verifyingContract }: LedgerDomain): TypedDataDomain {
  return { name: 'Tessera', version: '1', chainId, verifyingContract }
}

// Builds the argument for viem's signTypedData / recoverTypedDataAddress.
export function typedDataFor(domain: LedgerDomain, kind: SignedKind, message: ActionMessage) {
  const fields = EIP712_TYPES[kind]
  const typed: Record<string, unknown> = {}
  for (const { name, type } of fields) {
    const value = (message as Record<string, unknown>)[name]
    if (type === 'uint256') typed[name] = BigInt(value as number)
    else if (type === 'bytes32') typed[name] = `0x${value as string}`
    else typed[name] = value
  }
  return {
    domain: ledgerDomain(domain),
    types: { [kind]: fields },
    primaryType: kind,
    message: typed,
  } as const
}

export async function recoverActionSigner(
  domain: LedgerDomain,
  action: SignedAction,
): Promise<Address> {
  // The types are built dynamically per kind, so viem cannot infer them statically here.
  const data = typedDataFor(domain, action.kind, action.message) as Parameters<
    typeof recoverTypedDataAddress
  >[0]
  return recoverTypedDataAddress({ ...data, signature: action.signature })
}

export function recordFromAction(action: SignedAction): SignedRecord {
  const { nonce: _nonce, deadline: _deadline, association: _association, ...fields } =
    action.message
  return { kind: action.kind, ...fields } as SignedRecord
}
