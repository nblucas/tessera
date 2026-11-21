# Connecting the Backend to TesseraLedger

A guide for whoever implements the backend's ledger adapter: the class that implements `Ledger` and `GenesisWriter` (`../backend/src/ledger/types.ts`) on top of this contract, in place of the fake ledger.

Nothing in this guide has been built on the backend side yet. Everything about the contract has been checked: a script using the backend's demo relayer and oracle keys wrote a genesis, issued a ticket and read the events back as described below.

## What changes and what does not

The adapter replaces `FakeLedger` only. The rest stays as it is:

- The app keeps signing in the browser with `../shared/src/eip712.ts`, against the domain from `GET /ledger/domain`. The contract accepts those signatures as they are.
- The oracle keeps signing `TicketIssued`. The relayer keeps sending every transaction and paying the gas.
- The seed keeps writing the genesis through `GenesisWriter`. With `npm run deploy:local`, the relayer is the contract's genesis authority, so that just works.
- The indexer keeps reading `readEvents` and rebuilding its tables.
- `DEMO_MODE` stays on: Pix and e-mail are still fake. Only the ledger becomes real.

## Running everything locally

```bash
# terminal 1, in contracts/: the local chain
npm install
npm run node

# terminal 2, in contracts/: deploy for the backend (empty genesis)
npm run deploy:local
```

`deploy:local` prints the values below and saves them in `contracts/deployments/localhost.json`:

| Setting | Value on a fresh chain |
|---|---|
| `LEDGER_CHAIN_ID` | `31337` |
| `LEDGER_CONTRACT` | `0x5fbdb2315678afecb367f032d93f642f64180aa3` |
| RPC URL | `http://127.0.0.1:8545` |
| Association | `atletica-integrada` |
| Oracle | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` (from `DEMO_ORACLE_KEY`) |
| Relayer and genesis authority | `0x560197b299019E46EE2b5c4Da5027B7CD9008a6a` (from `DEMO_RELAYER_KEY`, funded with 100 test ETH) |

Then start the backend with those settings and an **empty database**, so its seed writes the genesis on the chain, and start the frontend as usual (`../SPECS.md`).

The backend has no setting for the RPC URL yet. The adapter needs one, for example `LEDGER_RPC_URL`, and `../backend/src/wiring.ts` needs a way to choose the adapter instead of `FakeLedger`.

The deploy scripts use the backend's **demo** oracle and relayer keys (`scripts/demo-data.ts`). If the backend runs with other keys (`ORACLE_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`), change them there too and deploy again: the oracle address and the genesis authority are fixed at deploy time.

### Starting over

The chain lives in memory and the backend's database does not, so both must be reset together:

1. Stop `npm run node`, start it again and run `npm run deploy:local`.
2. Then reset the backend (the app's **Reset demo data** button, `POST /demo/reset`). It wipes the database and runs the seed again, which writes the genesis on the new deployment.

Resetting the backend without a new deployment fails: the old contract already has a genesis and refuses another one (`BoardAlreadySet` or `GenesisClosed`). Today `resetDemo` (`../backend/src/seed/reset.ts`) truncates the fake ledger's table, which does not exist with the contract. Two options for the adapter: let the reset require a fresh deployment, as above, or take an `evm_snapshot` right after deploying and call `evm_revert` on reset (Hardhat's local chain supports both).

## The ABI

Import it from `contracts/abi/TesseraLedger.ts`:

```ts
import { tesseraLedgerAbi } from '../../../contracts/abi/TesseraLedger'
```

It is declared `as const`, so viem types every function, event and error. `../backend/tsconfig.json` only includes `src` and `test`, and `../backend/Dockerfile` does not copy `contracts/`, so the adapter needs to adjust them, or copy the file into the backend.

## `submit(action)`

### Function per record kind

Every signed function takes `(message, signature)`, where `message` is `action.message` with its numbers converted as below.

| `action.kind` | Contract function |
|---|---|
| `BatchCreated` | `createBatch` |
| `BatchUpdated` | `updateBatch` |
| `BatchRemoved` | `removeBatch` |
| `HandoverProposed` | `proposeHandover` |
| `HandoverApproved` | `approveHandover` |
| `HandoverCancelled` | `cancelHandover` |
| `TicketIssued` | `issueTicket` |
| `ExpenseProposed` | `proposeExpense` |
| `ExpenseVoted` | `voteExpense` |

### Converting the message

The backend keeps numbers as JavaScript numbers and the receipt hash without `0x`. The contract takes the EIP-712 types, which is what `typedDataFor` in `../shared/src/eip712.ts` already produces:

- `uint256` fields (`nonce`, `deadline`, `priceCents`, `quantity`, `amountCents`) become `BigInt`.
- `receiptSha256` becomes `` `0x${receiptSha256}` ``.
- Everything else passes as it is. `eventId` is an empty string for a general expense.

### Sending

1. Validate with `signedActionSchema` first and throw `LedgerRejection('malformed', ...)`, as the fake ledger does.
2. Call `simulateContract` before sending. A revert comes back with the custom error's name (see below) and costs no gas.
3. Send with `writeContract` from the relayer's key and **wait for the receipt** before returning. `Relayer.submit` calls `indexer.catchUp()` right after `submit`, so the event must already be on the chain.
4. Return `{ entryId }`, for example the transaction hash.

All transactions come from the one relayer account, so sending two at the same time can make them collide on the account's transaction nonce. Send them one at a time, for example behind a promise queue.

### Errors

The backend shows a `LedgerRejection` as HTTP 409 with its message (`../backend/src/app.ts`), and the oracle **matches on the message** to choose between a refund and a retry (`PERMANENT_FAILURES` and `'already issued'` in `../backend/src/oracle.ts`). Use the same messages as the shared rules (`../shared/src/rules.ts`):

| Contract error | `code` | `message` |
|---|---|---|
| `BadSignature`, OpenZeppelin's `ECDSAInvalidSignature`, `ECDSAInvalidSignatureLength`, `ECDSAInvalidSignatureS` | `bad_signature` | signature does not match the actor |
| `DeadlineExpired` | `expired` | action deadline has passed |
| `BadNonce(expected)` | `bad_nonce` | expected nonce `{expected}` |
| `WrongAssociation` | `malformed` | wrong association |
| `NotGenesisAuthority`, `GenesisClosed` | `rule` | genesis is closed |
| `BoardAlreadySet` | `rule` | board already set |
| `EmptyBoard` | `rule` | the board needs at least one director |
| `DuplicateDirector` | `rule` | duplicate director address |
| `NotBoardMember` | `rule` | not a board member |
| `HandoverAlreadyOpen` | `rule` | handover already open |
| `NoOpenHandoverWithThisId` | `rule` | no open handover with this id |
| `AlreadyApproved` | `rule` | already approved |
| `OnlyProposerCanCancel` | `rule` | only the proposer can cancel |
| `InvalidPrice` | `rule` | price must be positive whole cents |
| `InvalidQuantity` | `rule` | quantity must be a positive whole number |
| `InvalidCount` | `rule` | count must be a positive whole number |
| `InvalidAmount` | `rule` | amount must be positive whole cents |
| `BatchAlreadyExists` | `rule` | batch already exists |
| `UnknownBatch` | `rule` | unknown batch |
| `BatchFrozen` | `rule` | batch is frozen after its first sale |
| `OpeningSalesExceedQuantity` | `rule` | opening sales exceed the quantity |
| `OnlyOracle` | `rule` | only the oracle issues tickets |
| `TicketAlreadyIssued` | `rule` | ticket already issued |
| `BatchSoldOut` | `rule` | batch is sold out |
| `PriceMismatch` | `rule` | price does not match the batch |
| `ExpenseAlreadyExists` | `rule` | expense already exists |
| `UnknownCategory` | `rule` | unknown category |
| `UnknownExpense` | `rule` | unknown expense |
| `ExpenseNotPending` | `rule` | expense is not pending |
| `AlreadyVoted` | `rule` | already voted |

Any other failure (chain down, out of gas) is not a `LedgerRejection`. Let it throw, so the oracle's job retries with backoff.

The contract checks in the fake ledger's order: signature, deadline, nonce, association, then the rules. So an action sent twice fails on its nonce (`bad_nonce`) before any rule. The oracle handles this already: its retry signs again with a fresh nonce, and then gets `ticket already issued` and marks the order issued.

## `nextNonce(actor)`

Read `nonces(actor)` and return it as a number. Nonces are per address, across the whole contract, like the fake ledger's.

## `writeGenesis(association, records)`

Send each record in order from the relayer's key, which is the genesis authority:

| Record | Contract call |
|---|---|
| `BoardSet` | `setBoard(members)` |
| `BatchCreated` (with `actor: null`) | `createGenesisBatch(eventId, batchId, priceCents, quantity)` |
| `OpeningSalesRecorded` | `recordOpeningSales(eventId, batchId, count, amountCents)` |

`association` must be the contract's (`association()` returns it). Genesis is refused after the first signed action.

## `readEvents(fromCursor, limit)`

### Which events

Read the contract's logs in order (`getContractEvents` with the ABI). Skip `TermStarted` and `ExpenseDecided`: they are conveniences, and the indexer works both out itself. Every other event is one ledger record.

### From event to record

Each record event has the record's name and field names (`../shared/src/records.ts`), so:

```
record = { kind: log.eventName, actor, ...the other args }
```

- `actor` is `args.actor` in checksum form (`getAddress`), or `null` when the event has no `actor` (`BoardSet`, `OpeningSalesRecorded`) or when it is `address(0)` (a genesis `BatchCreated`).
- `bigint` values become numbers.
- `receiptSha256` drops its `0x` and stays lowercase.
- Addresses (`owner`, `members`) in checksum form, as the fake ledger stores them.

### The other `LedgerEvent` fields

| Field | Value |
|---|---|
| `cursor` | `` `${blockNumber}:${logIndex}` ``, so events sort and resume in chain order |
| `association` | the contract's association |
| `signature` | for signed records, the second argument of the transaction's call (`getTransaction`, then `decodeFunctionData` with the ABI). `null` for genesis records |
| `submittedBy` | the transaction's `from` for signed records, `null` for genesis records, as in the fake ledger |
| `hash` | unique per event, for example `` `${transactionHash}:${logIndex}` ``. The indexer stores it in `read.applied_events` to apply each event once |
| `prevHash` | the previous event's `hash`, or 64 zeros for the first. The chain already links blocks, but the field keeps the feed's shape |
| `recordedAt` | the block's timestamp as an ISO string |

Return at most `limit` events after `fromCursor`, and `next` as the last returned cursor, or `fromCursor` when there are none.

### Example

From the check run against `npm run deploy:local` (numbers shown as numbers):

```
block 3 log 0: BoardSet          {"members":["0xE72C…1122"]}
block 3 log 1: TermStarted       {"term":1,"members":["0xE72C…1122"]}            ← skipped
block 4 log 0: BatchCreated      {"actor":"0x0000…0000","eventId":"party","batchId":"b1","priceCents":5500,"quantity":10}
block 5 log 0: OpeningSalesRecorded {"eventId":"party","batchId":"b1","count":2,"amountCents":11000}
block 6 log 0: TicketIssued      {"actor":"0x9965…A4dc","owner":"0x5601…8a6a","ticketId":"t1","eventId":"party","batchId":"b1","priceCents":5500,"orderRef":"order-1"}
```

## Checking it works

With the backend on the adapter and the frontend running:

1. Sign in as `diego@demo.com` and check that the board and the events show up. The genesis was read back from the chain.
2. Buy a ticket and simulate the Pix payment. The order should reach `issued`.
3. Propose an expense as Diego, then approve it as `elisa@demo.com`. It should show as approved in the open accounts.
4. Run `npm run reindex -w backend`. The read tables should come back the same, rebuilt from the chain.
