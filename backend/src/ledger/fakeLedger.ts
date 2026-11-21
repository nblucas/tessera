// Demo only: a ledger kept in Postgres. It checks signatures, nonces, deadlines and the shared
// rules exactly as the contracts will, and links every entry to the previous one by hash.
import {
  applyRecord,
  checkRecord,
  EMPTY_STATE,
  recordFromAction,
  recoverActionSigner,
  signedActionSchema,
  type GenesisRecord,
  type LedgerDomain,
  type LedgerRecord,
  type LedgerState,
  type SignedAction,
} from '@tessera/shared'
import { asc, desc, eq, gt, sql } from 'drizzle-orm'
import { getAddress, type Address, type Hex } from 'viem'
import type { Db } from '../db/client'
import { entries } from '../db/schema'
import { entryHash, GENESIS_PREV_HASH } from './hash'
import { LedgerRejection, type GenesisWriter, type Ledger, type LedgerEvent } from './types'

// Every write takes this advisory lock, so entries are appended one at a time in hash order.
const WRITE_LOCK = 7_461_001

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type FakeLedgerOptions = {
  domain: LedgerDomain
  oracle: Address
  now?: () => Date
}

export class FakeLedger implements Ledger, GenesisWriter {
  private readonly db: Db
  private readonly options: FakeLedgerOptions

  constructor(db: Db, options: FakeLedgerOptions) {
    this.db = db
    this.options = options
  }

  async submit(input: SignedAction): Promise<{ entryId: string }> {
    const parsed = signedActionSchema.safeParse(input)
    if (!parsed.success) throw new LedgerRejection('malformed', parsed.error.message)
    const action = parsed.data as SignedAction

    const signer = await recoverActionSigner(this.options.domain, action).catch(() => null)
    if (!signer || getAddress(signer) !== getAddress(action.message.actor)) {
      throw new LedgerRejection('bad_signature', 'signature does not match the actor')
    }
    const nowSeconds = Math.floor(this.now().getTime() / 1000)
    if (action.message.deadline < nowSeconds) {
      throw new LedgerRejection('expired', 'action deadline has passed')
    }

    const { association, nonce } = action.message
    const record = normalize(recordFromAction(action))

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${WRITE_LOCK})`)
      const expectedNonce = await this.nonceIn(tx, record.actor as Address)
      if (nonce !== expectedNonce) {
        throw new LedgerRejection('bad_nonce', `expected nonce ${expectedNonce}`)
      }
      const state = await this.stateIn(tx, association)
      const error = checkRecord(state, record, { oracle: this.options.oracle })
      if (error) throw new LedgerRejection('rule', error)

      const seq = await this.append(tx, association, record, nonce, action.signature)
      return { entryId: String(seq) }
    })
  }

  async writeGenesis(association: string, records: GenesisRecord[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${WRITE_LOCK})`)
      let state = await this.stateIn(tx, association)
      for (const input of records) {
        const record = normalize(input)
        const error = checkRecord(state, record, { oracle: this.options.oracle })
        if (error) throw new LedgerRejection('rule', error)
        state = applyRecord(state, record)
        await this.append(tx, association, record, null, null)
      }
    })
  }

  async readEvents(
    fromCursor: string | null,
    limit: number,
  ): Promise<{ events: LedgerEvent[]; next: string | null }> {
    const after = fromCursor === null ? 0 : Number(fromCursor)
    const rows = await this.db
      .select()
      .from(entries)
      .where(gt(entries.seq, after))
      .orderBy(asc(entries.seq))
      .limit(limit)

    const events = rows.map(
      (row): LedgerEvent => ({
        cursor: String(row.seq),
        association: row.association,
        record: row.record,
        signature: row.signature as Hex | null,
        prevHash: row.prevHash,
        hash: row.hash,
        recordedAt: row.recordedAt.toISOString(),
      }),
    )
    return { events, next: events.at(-1)?.cursor ?? fromCursor }
  }

  async nextNonce(actor: Address): Promise<number> {
    return this.nonceIn(this.db, actor)
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private async nonceIn(db: Db | Tx, actor: Address): Promise<number> {
    const [row] = await db
      .select({ nonce: entries.nonce })
      .from(entries)
      .where(eq(entries.actor, getAddress(actor)))
      .orderBy(desc(entries.nonce))
      .limit(1)
    return row?.nonce === null || row?.nonce === undefined ? 0 : row.nonce + 1
  }

  // Replays the association's entries through the shared rules. Fine at demo scale.
  private async stateIn(tx: Tx, association: string): Promise<LedgerState> {
    const rows = await tx
      .select({ record: entries.record })
      .from(entries)
      .where(eq(entries.association, association))
      .orderBy(asc(entries.seq))
    return rows.reduce((state, row) => applyRecord(state, row.record), EMPTY_STATE)
  }

  private async append(
    tx: Tx,
    association: string,
    record: LedgerRecord,
    nonce: number | null,
    signature: Hex | null,
  ): Promise<number> {
    const [last] = await tx
      .select({ hash: entries.hash })
      .from(entries)
      .orderBy(desc(entries.seq))
      .limit(1)
    const prevHash = last?.hash ?? GENESIS_PREV_HASH
    const hash = entryHash(prevHash, { association, record, nonce, signature })

    const [row] = await tx
      .insert(entries)
      .values({
        association,
        kind: record.kind,
        actor: record.actor,
        nonce,
        record,
        signature,
        prevHash,
        hash,
      })
      .returning({ seq: entries.seq })
    return row.seq
  }
}

// Stores every address in checksum form, so equal addresses are equal strings.
function normalize<R extends LedgerRecord>(record: R): R {
  const copy: Record<string, unknown> = { ...record }
  for (const field of ['actor', 'owner'] as const) {
    if (typeof copy[field] === 'string') copy[field] = getAddress(copy[field] as string)
  }
  if (Array.isArray(copy.members)) {
    copy.members = (copy.members as string[]).map((member) => getAddress(member))
  }
  return copy as R
}

