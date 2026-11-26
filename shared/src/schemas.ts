// zod schemas shared by the API (request validation) and the frontend (forms and signing).
import { z } from 'zod'
import type { Address, Hex } from 'viem'
import { EXPENSE_CATEGORIES } from './records'

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'invalid address')
  .transform((value) => value as Address)

const hexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, 'invalid hex')
  .transform((value) => value as Hex)

const idSchema = z.string().min(1).max(100)
const uintSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const envelope = {
  actor: addressSchema,
  nonce: uintSchema,
  deadline: uintSchema,
  association: idSchema,
}

const batchFields = {
  eventId: idSchema,
  batchId: idSchema,
  priceCents: uintSchema,
  quantity: uintSchema,
  resaleCapPercent: uintSchema,
}

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'invalid SHA-256')

function action<K extends string, S extends z.ZodRawShape>(kind: K, fields: S) {
  return z.object({
    kind: z.literal(kind),
    message: z.object({ ...envelope, ...fields }),
    signature: hexSchema,
  })
}

export const signedActionSchema = z.discriminatedUnion('kind', [
  action('BatchCreated', batchFields),
  action('BatchUpdated', batchFields),
  action('BatchRemoved', { eventId: idSchema, batchId: idSchema }),
  action('HandoverProposed', { handoverId: idSchema, members: z.array(addressSchema) }),
  action('HandoverApproved', { handoverId: idSchema }),
  action('HandoverCancelled', { handoverId: idSchema }),
  action('TicketIssued', {
    ticketId: idSchema,
    eventId: idSchema,
    batchId: idSchema,
    owner: addressSchema,
    priceCents: uintSchema,
    orderRef: idSchema,
    paymentRef: sha256Schema,
  }),
  action('ExpenseProposed', {
    expenseId: idSchema,
    amountCents: uintSchema,
    category: z.enum(EXPENSE_CATEGORIES),
    eventId: z.string().max(100),
    receiptSha256: z.string().regex(/^[0-9a-f]{64}$/, 'invalid SHA-256'),
  }),
  action('ExpenseVoted', { expenseId: idSchema, approve: z.boolean() }),
  action('PaymentRefunded', {
    paymentRef: sha256Schema,
    amountCents: uintSchema,
    orderRef: idSchema,
    reason: z.string().max(200),
  }),
  action('PaymentReversed', { paymentRef: sha256Schema, ticketId: idSchema, amountCents: uintSchema }),
  action('TicketListed', { ticketId: idSchema, priceCents: uintSchema }),
  action('ListingCancelled', { ticketId: idSchema }),
  action('ResaleSettled', {
    paymentRef: sha256Schema,
    listedTicketId: idSchema,
    ticketId: idSchema,
    owner: addressSchema,
    priceCents: uintSchema,
    royaltyCents: uintSchema,
    platformFeeCents: uintSchema,
    payoutCents: uintSchema,
    orderRef: idSchema,
  }),
  action('OracleChangeProposed', { proposalId: idSchema, newOracle: addressSchema }),
  action('OracleChangeApproved', { proposalId: idSchema }),
  action('OracleChangeCancelled', { proposalId: idSchema }),
])
