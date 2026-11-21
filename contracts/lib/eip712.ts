// EIP-712 types shared by the tests and the scripts.
// Copied from shared/src/eip712.ts. The contract must accept what the app signs.
import type { Address } from "viem";

const envelope = [
  { name: "actor", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
  { name: "association", type: "string" },
] as const;

const batchFields = [
  { name: "eventId", type: "string" },
  { name: "batchId", type: "string" },
  { name: "priceCents", type: "uint256" },
  { name: "quantity", type: "uint256" },
] as const;

export const types = {
  HandoverProposed: [
    ...envelope,
    { name: "handoverId", type: "string" },
    { name: "members", type: "address[]" },
  ],
  HandoverApproved: [...envelope, { name: "handoverId", type: "string" }],
  HandoverCancelled: [...envelope, { name: "handoverId", type: "string" }],
  BatchCreated: [...envelope, ...batchFields],
  BatchUpdated: [...envelope, ...batchFields],
  BatchRemoved: [
    ...envelope,
    { name: "eventId", type: "string" },
    { name: "batchId", type: "string" },
  ],
  TicketIssued: [
    ...envelope,
    { name: "ticketId", type: "string" },
    { name: "eventId", type: "string" },
    { name: "batchId", type: "string" },
    { name: "owner", type: "address" },
    { name: "priceCents", type: "uint256" },
    { name: "orderRef", type: "string" },
  ],
  ExpenseProposed: [
    ...envelope,
    { name: "expenseId", type: "string" },
    { name: "amountCents", type: "uint256" },
    { name: "category", type: "string" },
    { name: "eventId", type: "string" },
    { name: "receiptSha256", type: "bytes32" },
  ],
  ExpenseVoted: [
    ...envelope,
    { name: "expenseId", type: "string" },
    { name: "approve", type: "bool" },
  ],
} as const;

export type ActionKind = keyof typeof types;

export function ledgerDomain(chainId: number, verifyingContract: Address) {
  return { name: "Tessera", version: "1", chainId, verifyingContract } as const;
}
