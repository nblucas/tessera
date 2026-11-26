import {
  signedActionSchema,
  type ActionMessage,
  type GenesisRecord,
  type LedgerRecord,
  type SignedAction,
} from '@tessera/shared'
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  defineChain,
  getAddress,
  http,
  zeroAddress,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { tesseraLedgerAbi } from '../../../contracts/abi/TesseraLedger'
import { GENESIS_PREV_HASH } from './hash'
import {
  LedgerRejection,
  LedgerResetUnavailable,
  type GenesisWriter,
  type Ledger,
  type LedgerEvent,
} from './types'

const ecdsaErrors = [
  { type: 'error', name: 'ECDSAInvalidSignature', inputs: [] },
  {
    type: 'error',
    name: 'ECDSAInvalidSignatureLength',
    inputs: [{ name: 'length', type: 'uint256' }],
  },
  { type: 'error', name: 'ECDSAInvalidSignatureS', inputs: [{ name: 's', type: 'bytes32' }] },
] as const

const abi = [...tesseraLedgerAbi, ...ecdsaErrors] as const

type DecodedLog = {
  eventName: string
  args: Record<string, unknown>
  blockNumber: bigint
  logIndex: number
  transactionHash: Hex
}

type Cursor = { block: bigint; index: number }

const BAD_SIGNATURE_ERRORS = new Set([
  'BadSignature',
  'ECDSAInvalidSignature',
  'ECDSAInvalidSignatureLength',
  'ECDSAInvalidSignatureS',
])

const RULE_MESSAGES: Record<string, string> = {
  NotGenesisAuthority: 'genesis is closed',
  GenesisClosed: 'genesis is closed',
  BoardAlreadySet: 'board already set',
  EmptyBoard: 'the board needs at least one director',
  DuplicateDirector: 'duplicate director address',
  NotBoardMember: 'not a board member',
  HandoverAlreadyOpen: 'handover already open',
  NoOpenHandoverWithThisId: 'no open handover with this id',
  AlreadyApproved: 'already approved',
  OnlyProposerCanCancel: 'only the proposer can cancel',
  InvalidPrice: 'price must be positive whole cents',
  InvalidQuantity: 'quantity must be a positive whole number',
  InvalidCount: 'count must be a positive whole number',
  InvalidAmount: 'amount must be positive whole cents',
  BatchAlreadyExists: 'batch already exists',
  UnknownBatch: 'unknown batch',
  BatchFrozen: 'batch is frozen after its first sale',
  OpeningSalesExceedQuantity: 'opening sales exceed the quantity',
  OnlyOracle: 'only the oracle issues tickets',
  TicketAlreadyIssued: 'ticket already issued',
  BatchSoldOut: 'batch is sold out',
  PriceMismatch: 'price does not match the batch',
  ExpenseAlreadyExists: 'expense already exists',
  UnknownCategory: 'unknown category',
  UnknownExpense: 'unknown expense',
  ExpenseNotPending: 'expense is not pending',
  AlreadyVoted: 'already voted',
}

export type ChainLedgerOptions = {
  rpcUrl: string
  chainId: number
  contract: Address
  relayerPrivateKey: Hex
}

export class ChainLedger implements Ledger, GenesisWriter {
  private readonly publicClient: PublicClient
  private readonly walletClient: WalletClient
  private readonly account: PrivateKeyAccount
  private readonly chain: Chain
  private readonly contract: Address
  private queue: Promise<unknown> = Promise.resolve()
  private associationValue: Promise<string> | null = null
  private snapshotId: Hex | null = null
  private readonly blockTimes = new Map<bigint, Promise<string>>()
  private readonly transactions = new Map<
    Hex,
    Promise<{ from: Address; signature: Hex | null }>
  >()

  constructor(options: ChainLedgerOptions) {
    this.account = privateKeyToAccount(options.relayerPrivateKey)
    this.chain = defineChain({
      id: options.chainId,
      name: 'Tessera',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [options.rpcUrl] } },
    })
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(options.rpcUrl) })
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(options.rpcUrl),
    })
    this.contract = options.contract
  }

  // Fails fast when the deployed contract does not match the backend's settings. Otherwise
  // a wrong oracle key would only show up later, as every ticket failing to issue.
  async checkDeployment(expected: {
    association: string
    oracle: Address
    relayer: Address
  }): Promise<void> {
    const read = (functionName: 'association' | 'oracle' | 'genesisAuthority' | 'genesisClosed') =>
      this.publicClient.readContract({ address: this.contract, abi, functionName })
    let deployed: [string, Address, Address, boolean]
    try {
      deployed = await Promise.all([
        read('association') as Promise<string>,
        read('oracle') as Promise<Address>,
        read('genesisAuthority') as Promise<Address>,
        read('genesisClosed') as Promise<boolean>,
      ])
    } catch (error) {
      throw new Error(
        `No TesseraLedger contract answers at ${this.contract}. Check LEDGER_RPC_URL and LEDGER_CONTRACT, or deploy with npm run deploy:local.`,
        { cause: error },
      )
    }
    const [association, oracle, genesisAuthority, genesisClosed] = deployed

    if (association !== expected.association) {
      throw new Error(
        `The contract belongs to association "${association}", but the backend is set up for "${expected.association}".`,
      )
    }
    if (getAddress(oracle) !== getAddress(expected.oracle)) {
      throw new Error(
        `The contract's oracle is ${oracle}, but ORACLE_PRIVATE_KEY belongs to ${expected.oracle}. Deploy again with the backend's oracle key.`,
      )
    }
    if (!genesisClosed && getAddress(genesisAuthority) !== getAddress(expected.relayer)) {
      throw new Error(
        `The contract's genesis authority is ${genesisAuthority}, not the backend's relayer ${expected.relayer}, so the backend cannot write the seed. Deploy with npm run deploy:local (not deploy:local:demo).`,
      )
    }
  }

  async submit(input: SignedAction): Promise<{ entryId: string }> {
    const parsed = signedActionSchema.safeParse(input)
    if (!parsed.success) throw new LedgerRejection('malformed', parsed.error.message)
    const action = parsed.data as SignedAction
    const entryId = await this.send(action)
    return { entryId }
  }

  async nextNonce(actor: Address): Promise<number> {
    const nonce = await this.publicClient.readContract({
      address: this.contract,
      abi,
      functionName: 'nonces',
      args: [getAddress(actor)],
    })
    return Number(nonce)
  }

  async writeGenesis(association: string, records: GenesisRecord[]): Promise<void> {
    const onChain = await this.association()
    if (association !== onChain) throw new LedgerRejection('malformed', 'wrong association')
    await this.takeSnapshotIfPristine()

    for (const record of records) {
      switch (record.kind) {
        case 'BoardSet':
          await this.transact('setBoard', [record.members])
          break
        case 'BatchCreated':
          await this.transact('createGenesisBatch', [
            record.eventId,
            record.batchId,
            BigInt(record.priceCents),
            BigInt(record.quantity),
          ])
          break
        case 'OpeningSalesRecorded':
          await this.transact('recordOpeningSales', [
            record.eventId,
            record.batchId,
            BigInt(record.count),
            BigInt(record.amountCents),
          ])
          break
        default:
          assertNever(record)
      }
    }
  }

  async reset(): Promise<void> {
    if (!this.snapshotId) {
      throw new LedgerResetUnavailable(
        'The chain ledger cannot be reset without a fresh deployment. Restart the node, run npm run deploy:local and reset the backend again.',
      )
    }
    await this.evm({ method: 'evm_revert', params: [this.snapshotId] })
    this.snapshotId = null
    // The revert reuses block numbers and drops transactions, so cached lookups are stale.
    this.blockTimes.clear()
    this.transactions.clear()
  }

  async readEvents(
    fromCursor: string | null,
    limit: number,
  ): Promise<{ events: LedgerEvent[]; next: string | null }> {
    const association = await this.association()
    const logs = (await this.publicClient.getContractEvents({
      address: this.contract,
      abi,
      fromBlock: 0n,
      toBlock: 'latest',
    })) as unknown as DecodedLog[]

    const recordLogs = logs
      .filter((log) => log.eventName !== 'TermStarted' && log.eventName !== 'ExpenseDecided')
      .sort(compareLogs)

    const all: { log: DecodedLog; event: LedgerEvent }[] = []
    let prevHash = GENESIS_PREV_HASH
    for (const log of recordLogs) {
      const hash = `${log.transactionHash}:${log.logIndex}`
      all.push({ log, event: await this.toEvent(log, association, hash, prevHash) })
      prevHash = hash
    }

    const after = parseCursor(fromCursor)
    const page = all
      .filter(({ log }) => after === null || isAfter(log, after))
      .slice(0, limit)
      .map(({ event }) => event)
    return { events: page, next: page.at(-1)?.cursor ?? fromCursor }
  }

  private async send(action: SignedAction): Promise<Hex> {
    switch (action.kind) {
      case 'BatchCreated': {
        const message = action.message
        return this.transact('createBatch', [
          {
            ...envelope(message),
            eventId: message.eventId,
            batchId: message.batchId,
            priceCents: BigInt(message.priceCents),
            quantity: BigInt(message.quantity),
          },
          action.signature,
        ])
      }
      case 'BatchUpdated': {
        const message = action.message
        return this.transact('updateBatch', [
          {
            ...envelope(message),
            eventId: message.eventId,
            batchId: message.batchId,
            priceCents: BigInt(message.priceCents),
            quantity: BigInt(message.quantity),
          },
          action.signature,
        ])
      }
      case 'BatchRemoved': {
        const message = action.message
        return this.transact('removeBatch', [
          {
            ...envelope(message),
            eventId: message.eventId,
            batchId: message.batchId,
          },
          action.signature,
        ])
      }
      case 'HandoverProposed': {
        const message = action.message
        return this.transact('proposeHandover', [
          {
            ...envelope(message),
            handoverId: message.handoverId,
            members: message.members,
          },
          action.signature,
        ])
      }
      case 'HandoverApproved': {
        const message = action.message
        return this.transact('approveHandover', [
          { ...envelope(message), handoverId: message.handoverId },
          action.signature,
        ])
      }
      case 'HandoverCancelled': {
        const message = action.message
        return this.transact('cancelHandover', [
          { ...envelope(message), handoverId: message.handoverId },
          action.signature,
        ])
      }
      case 'TicketIssued': {
        const message = action.message
        return this.transact('issueTicket', [
          {
            ...envelope(message),
            ticketId: message.ticketId,
            eventId: message.eventId,
            batchId: message.batchId,
            owner: message.owner,
            priceCents: BigInt(message.priceCents),
            orderRef: message.orderRef,
          },
          action.signature,
        ])
      }
      case 'ExpenseProposed': {
        const message = action.message
        return this.transact('proposeExpense', [
          {
            ...envelope(message),
            expenseId: message.expenseId,
            amountCents: BigInt(message.amountCents),
            category: message.category,
            eventId: message.eventId,
            receiptSha256: `0x${message.receiptSha256}` as Hex,
          },
          action.signature,
        ])
      }
      case 'ExpenseVoted': {
        const message = action.message
        return this.transact('voteExpense', [
          { ...envelope(message), expenseId: message.expenseId, approve: message.approve },
          action.signature,
        ])
      }
      default:
        return assertNever(action)
    }
  }

  private async transact(functionName: string, args: readonly unknown[]): Promise<Hex> {
    return this.enqueue(async () => {
      const parameters = {
        address: this.contract,
        abi,
        functionName,
        args,
        account: this.account,
        chain: this.chain,
      }

      try {
        await this.publicClient.simulateContract(parameters as never)
      } catch (error) {
        const rejection = rejectionFor(error)
        if (rejection) throw rejection
        throw error
      }

      const hash = await this.walletClient.writeContract(parameters as never)
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error(`transaction ${hash} reverted`)
      return hash
    })
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private association(): Promise<string> {
    this.associationValue ??= this.publicClient.readContract({
      address: this.contract,
      abi,
      functionName: 'association',
    })
    return this.associationValue
  }

  private async takeSnapshotIfPristine(): Promise<void> {
    if (this.snapshotId) return
    const [closed, term] = await Promise.all([
      this.publicClient.readContract({ address: this.contract, abi, functionName: 'genesisClosed' }),
      this.publicClient.readContract({ address: this.contract, abi, functionName: 'term' }),
    ])
    if (closed || term !== 0n) return
    try {
      this.snapshotId = (await this.evm({ method: 'evm_snapshot' })) as Hex
    } catch {
      this.snapshotId = null
    }
  }

  private evm(request: { method: string; params?: readonly unknown[] }): Promise<unknown> {
    return (
      this.publicClient.request as (input: {
        method: string
        params?: readonly unknown[]
      }) => Promise<unknown>
    )(request)
  }

  private async toEvent(
    log: DecodedLog,
    association: string,
    hash: string,
    prevHash: string,
  ): Promise<LedgerEvent> {
    const record = toRecord(log)
    const signed = record.actor !== null
    let signature: Hex | null = null
    let submittedBy: Address | null = null
    if (signed) {
      const transaction = await this.transaction(log.transactionHash)
      signature = transaction.signature
      submittedBy = transaction.from
    }
    return {
      cursor: `${log.blockNumber}:${log.logIndex}`,
      association,
      record,
      signature,
      submittedBy,
      prevHash,
      hash,
      recordedAt: await this.blockTime(log.blockNumber),
    }
  }

  private transaction(hash: Hex): Promise<{ from: Address; signature: Hex | null }> {
    let transaction = this.transactions.get(hash)
    if (!transaction) {
      transaction = (async () => {
        const tx = await this.publicClient.getTransaction({ hash })
        const decoded = decodeFunctionData({ abi, data: tx.input })
        const callArgs = decoded.args
        const signature =
          Array.isArray(callArgs) && typeof callArgs[1] === 'string' ? (callArgs[1] as Hex) : null
        return { from: getAddress(tx.from), signature }
      })()
      this.transactions.set(hash, transaction)
    }
    return transaction
  }

  private blockTime(blockNumber: bigint): Promise<string> {
    let time = this.blockTimes.get(blockNumber)
    if (!time) {
      time = this.publicClient
        .getBlock({ blockNumber })
        .then((block) => new Date(Number(block.timestamp) * 1000).toISOString())
      this.blockTimes.set(blockNumber, time)
    }
    return time
  }
}

function envelope(message: ActionMessage) {
  return {
    actor: message.actor,
    nonce: BigInt(message.nonce),
    deadline: BigInt(message.deadline),
    association: message.association,
  }
}

function toRecord(log: DecodedLog): LedgerRecord {
  const args = log.args ?? {}
  const record: Record<string, unknown> = { kind: log.eventName }
  for (const [key, value] of Object.entries(args)) {
    if (key === 'actor') continue
    record[key] = convertField(key, value)
  }
  const actor = args.actor
  record.actor = typeof actor === 'string' && actor !== zeroAddress ? getAddress(actor) : null
  return record as LedgerRecord
}

function convertField(key: string, value: unknown): unknown {
  if (key === 'owner') return getAddress(value as Address)
  if (key === 'members') return (value as Address[]).map((member) => getAddress(member))
  if (key === 'receiptSha256') return (value as Hex).slice(2).toLowerCase()
  if (typeof value === 'bigint') return Number(value)
  return value
}

function parseCursor(cursor: string | null): Cursor | null {
  if (cursor === null) return null
  const [block, index] = cursor.split(':')
  return { block: BigInt(block), index: index === undefined ? -1 : Number(index) }
}

function isAfter(log: DecodedLog, cursor: Cursor): boolean {
  return (
    log.blockNumber > cursor.block ||
    (log.blockNumber === cursor.block && log.logIndex > cursor.index)
  )
}

function compareLogs(a: DecodedLog, b: DecodedLog): number {
  if (a.blockNumber < b.blockNumber) return -1
  if (a.blockNumber > b.blockNumber) return 1
  return a.logIndex - b.logIndex
}

function rejectionFor(error: unknown): LedgerRejection | null {
  const revert = findRevert(error)
  if (!revert) return null

  const { errorName, args } = revert
  if (BAD_SIGNATURE_ERRORS.has(errorName)) {
    return new LedgerRejection('bad_signature', 'signature does not match the actor')
  }
  if (errorName === 'DeadlineExpired') {
    return new LedgerRejection('expired', 'action deadline has passed')
  }
  if (errorName === 'BadNonce') {
    return new LedgerRejection('bad_nonce', `expected nonce ${String(args?.[0] ?? '')}`)
  }
  if (errorName === 'WrongAssociation') {
    return new LedgerRejection('malformed', 'wrong association')
  }
  const message = RULE_MESSAGES[errorName]
  if (message) return new LedgerRejection('rule', message)
  return null
}

function findRevert(error: unknown): { errorName: string; args?: readonly unknown[] } | null {
  let current: unknown = error
  for (let depth = 0; current && depth < 10; depth++) {
    const candidate = current as {
      data?: { errorName?: unknown; args?: unknown }
      errorName?: unknown
      args?: unknown
      cause?: unknown
    }
    const data = candidate.data
    if (data && typeof data === 'object' && typeof data.errorName === 'string') {
      return { errorName: data.errorName, args: data.args as readonly unknown[] | undefined }
    }
    if (typeof candidate.errorName === 'string') {
      return {
        errorName: candidate.errorName,
        args: candidate.args as readonly unknown[] | undefined,
      }
    }
    current = candidate.cause
  }
  return null
}

function assertNever(value: never): never {
  throw new Error(`unhandled ledger record: ${JSON.stringify(value)}`)
}
