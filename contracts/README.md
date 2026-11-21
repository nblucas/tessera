# Tessera Contracts

The on-chain half of Tessera. This folder holds the Solidity contract that stores the records nobody should be able to change: the board, ticket batches, ticket issuance, expenses and votes. See `../ARCHITECTURE.md` for what goes on the ledger and why.

The contract favours being easy to read over being production-ready.

## Status

| Step | What | Done |
|---|---|---|
| 1 | Environment: Hardhat, OpenZeppelin, local chain | yes |
| 2 | Verify an EIP-712 signature | yes |
| 3 | Board and board handover | yes |
| 4 | Ticket batches and tickets | yes |
| 5 | Expenses and votes | yes |
| 6 | Deploy to the local chain | yes |

## Getting started

Requires Node 22 or newer. Run every command inside this folder.

```bash
npm install
npm run build   # compile the contracts
npm test        # run the tests on a temporary in-memory chain
npm run node    # start a local chain at http://127.0.0.1:8545 (Ctrl+C to stop)
```

`npm run node` prints 20 accounts funded with test ETH. Their private keys are public, so never use them on a real network.

### Two ways to deploy

Both need the local chain running in another terminal (`npm run node`).

| Command | For | Genesis |
|---|---|---|
| `npm run deploy:local` | running with the backend | left empty. The backend's relayer is the genesis authority, and the backend seed writes the genesis through its ledger adapter |
| `npm run deploy:local:demo` | the contracts-only demo below | written by the deployer, with the same data as the backend seed |

Both fund the backend's relayer with test ETH, print the backend settings `LEDGER_CHAIN_ID` and `LEDGER_CONTRACT`, and save the deployment in `deployments/localhost.json`. The first deploy on a fresh chain always gets the same address, `0x5fbdb2315678afecb367f032d93f642f64180aa3`.

The chain lives in memory: stopping `npm run node` erases everything. Start it again and deploy again for a clean state.

To run this contract with the backend and the app, see [ADAPTER.md](ADAPTER.md).

### Contracts-only demo

```bash
# terminal 1: the local chain, keep it running
npm run node

# terminal 2
npm run deploy:local:demo   # deploy and write the demo genesis
npm run demo:local          # create a batch, issue a ticket, propose and approve an expense
```

`demo:local` signs as the demo directors and the oracle, sends as a relayer, and also tries actions the contract must refuse. It can run several times on the same deployment.

### Exported ABI

`abi/TesseraLedger.ts` holds the contract's ABI and is committed, so the backend can import it without compiling this package. After any change to the contract, run `npm run export-abi`. A test fails while the file is out of date.

## Layout

```
contracts/          Solidity sources, Hardhat's default folder name
  TesseraLedger.sol the ledger contract
abi/TesseraLedger.ts generated ABI, committed, for the backend's ledger adapter
test/               TypeScript tests (node:test + viem), one file per area
test-support/       helpers shared by the tests: deploy, sign an action
lib/eip712.ts       EIP-712 types used by the tests and the scripts
scripts/
  demo-data.ts      demo genesis copied from the backend seed, and the demo keys
  deploy-common.ts  deploy, fund the relayer, save the deployment
  deploy.ts         deploy for the backend (empty genesis)
  deploy-demo.ts    deploy for the contracts-only demo (with genesis)
  demo.ts           use the deployed contract like the app does
  export-abi.ts     write abi/TesseraLedger.ts
ADAPTER.md          guide for the backend's ledger adapter
hardhat.config.ts   Solidity version and plugins
```

## Design decisions

### A separate package

This folder has its own `package.json` and is not part of the npm workspaces at the repository root. Once deployed, the contract lives on the chain and the backend talks to it over JSON-RPC, never by importing its code. Keeping the folder apart mirrors that, and nothing outside it has to change.

### Hardhat with viem

Hardhat compiles Solidity, runs a local chain and runs tests. It uses viem, the same library the app uses to sign actions, so tests can sign exactly like the real app does.

### A local chain only

The demo runs on Hardhat's local chain. Its chain id is 31337, which is the backend's default `LEDGER_CHAIN_ID`. A public testnet would add faucets, RPC providers and waiting for blocks without changing what the contract does.

### OpenZeppelin

Signature checking uses OpenZeppelin's audited `EIP712` and `ECDSA` helpers instead of hand-written cryptography.

### Signed actions instead of `msg.sender`

The backend's relayer sends every transaction and pays the gas, so `msg.sender` is always the relayer. Trusting it would let the backend vote or act on anyone's behalf. Instead, each user signs their action in the browser and the contract recovers the signer from the signature. The relayer only delivers it. Changing any field after signing makes the signature recover to a different address, so the action is refused.

### EIP-712 typed data

Actions are signed as EIP-712 typed data with the domain `{ name: "Tessera", version: "1", chainId, verifyingContract }`. The domain ties a signature to this contract on this chain, so it cannot be replayed elsewhere. The app already signs in this format (`../shared/src/eip712.ts`). The contract's type strings must match those definitions field by field, in the same order. Strings are hashed with `keccak256` inside the struct hash, as the standard requires.

The tests copy the type definitions from `shared/` instead of importing them, to keep this package independent. If a type changes in `shared/`, change it here too.

In Solidity the message structs are named `...Message` (for example `HandoverProposedMessage`), because the events use the record names. Only the type string inside each typehash has to match the app.

### Checks on every signed action

Every signed action goes through the same four checks, in the same order as the backend's fake ledger (`../backend/src/ledger/fakeLedger.ts`):

| Check | Refuses | Error |
|---|---|---|
| Signature | an action not signed by its `actor` | `BadSignature` |
| Deadline | an action sent after its `deadline` | `DeadlineExpired` |
| Nonce | an action sent twice, or out of order. Each address signs with 0, 1, 2 and so on | `BadNonce` |
| Association | an action signed for another association | `WrongAssociation` |

### One association per contract

The product has one association, so the contract stores its name at deploy time and refuses actions for any other. The `association` field stays in the messages because the app already signs it.

### Genesis

The genesis authority is an address given at deploy time. It writes the initial board with `setBoard` (once), the batches that already existed with `createGenesisBatch`, and the sales made before the app existed with `recordOpeningSales`, all before the first signed action.

With the backend, the genesis authority is the backend's relayer. The backend seed already writes the genesis through the `Ledger` interface when it starts with an empty database, so it works the same with the fake ledger and with this contract, and the backend needs no special case. For the contracts-only demo, the deployer is the genesis authority instead. After that, `genesisClosed` is true and every change must be signed by a director. This matches the fake ledger, where genesis records are accepted only while the ledger is empty.

### Board terms

Each board is a numbered term (1, 2, 3 and so on), and membership is stored per term. Starting a new term makes the former directors lose their role at once, without deleting anything.

### Board handover

| Rule | Where |
|---|---|
| Only current directors propose and approve | `_requireBoardMember` |
| Proposing counts as the proposer's approval | `proposeHandover` |
| A majority of the current board, `floor(n / 2) + 1`, starts the new term | `_approveHandover`, `majorityOf` |
| One open handover at a time | `proposeHandover` |
| The new board has at least one director and no duplicates | `_checkNewBoard` |
| Each director approves once | `approvedInRound` |
| Only the proposer cancels, while the proposal is open | `cancelHandover` |

Approvals are stored per proposal round, so approvals from a cancelled proposal never count toward the next one.

### Payment oracle

The oracle's address is set at deploy time and cannot change. It is the backend key that confirms Pix payments, and the only address allowed to issue tickets. It cannot do anything else: it is not a director, so it cannot create batches, propose expenses or vote. This is the one trusted role `../ARCHITECTURE.md` accepts ("Limits" #2).

### Batches and tickets

| Rule | Where |
|---|---|
| Only current directors create, update and remove batches | `createBatch`, `updateBatch`, `removeBatch` |
| A batch id is used once per event | `_createBatch` |
| Price and quantity are positive whole numbers, at most `MAX_SAFE_INTEGER` | `_checkBatchFields` |
| A batch is frozen after its first sale: no update, no removal | `updateBatch`, `removeBatch` |
| Only the oracle issues tickets | `issueTicket` |
| A ticket is issued at the batch price, while stock lasts | `issueTicket` |
| A ticket id is issued once | `issuedTickets` |
| Opening sales cannot exceed the batch quantity | `recordOpeningSales` |

A batch is keyed by `keccak256(abi.encode(eventId, batchId))`. `abi.encode` keeps the two ids apart, so `("a/b", "c")` and `("a", "b/c")` are different batches.

### Amounts as JavaScript-safe integers

Amounts are integer cents. The backend and the app read them as JavaScript numbers, which lose precision above 2^53 − 1, so the contract refuses anything larger (`MAX_SAFE_INTEGER`).

### Income is derived

There is no income record. Income is the sum of `TicketIssued` and `OpeningSalesRecorded`, so the two can never disagree. `IncomeRecorded`, reserved for sponsorships in `../BACKEND.md`, is not part of the MVP.

### Expenses and votes

Only the amount, category, event and the SHA-256 hash of the receipt go on-chain. The description and the receipt file stay in the backend, and anyone holding the file can check it against the hash.

| Rule | Where |
|---|---|
| Only current directors propose and vote | `proposeExpense`, `voteExpense` |
| Proposing counts as the proposer's approval | `proposeExpense` |
| Amount is positive whole cents, at most `MAX_SAFE_INTEGER` | `proposeExpense` |
| Category is one of the app's list (`EXPENSE_CATEGORIES` in `../shared/src/records.ts`) | `_isKnownCategory` |
| Each director votes once on each expense | `hasVoted` |
| A majority of approvals approves, a majority of rejections rejects | `_updateExpenseStatus` |
| A decided expense takes no more votes and never changes | `voteExpense`, `_updateExpenseStatus` |

### Only the current board's votes count

Each expense keeps every vote ever cast, but its status counts only votes from directors of the current term (`_countCurrentDirectors`). When a handover starts a new term, every pending expense is recounted at once with the new board (`_recountPendingExpenses`):

- a director who stays on the new board keeps their earlier vote,
- votes from directors who left stay in the history but no longer count,
- a pending expense may be decided by the recount itself, for example when the new board is a single director who had already approved it,
- decided expenses are not touched.

The contract keeps a list of expenses that may still be pending, so the recount does not go through every expense ever proposed. Expenses decided by a vote leave the list at the next recount.

**Known limit:** the recount costs gas for each pending expense, all in the transaction that completes the handover. An association has a handful of pending expenses at a time, so this is fine here, but thousands of them could make the handover too expensive to run.

### Deploy with the backend's demo data

The deploy scripts use the backend's demo keys: the oracle is `DEMO_ORACLE_KEY` and the relayer is `DEMO_RELAYER_KEY` (`../backend/src/config.ts`). `deploy-demo.ts` writes the same genesis as the backend seed (`../backend/src/seed/`): the three demo directors, the eight batches and their opening sales. Keys and data are copied into `scripts/demo-data.ts` rather than imported, to keep this package independent. Every key in that file is public demo data.

The backend's relayer key is not one of the accounts Hardhat funds, so both deploy scripts send it 100 test ETH. Without that, it could not pay for any transaction.

The scripts are plain Hardhat scripts instead of Hardhat Ignition modules. Ignition tracks deployments and resumes failed ones, which a single contract on a local chain does not need.

### Connecting the backend

The backend talks to the ledger through the `Ledger` interface in `../backend/src/ledger/types.ts`. Today the fake ledger implements it. Using this contract needs an adapter on the backend side, which is backend work and not part of this folder. [ADAPTER.md](ADAPTER.md) describes everything that adapter must do.

### Struct hashes in their own functions

Each message type has its own `_hash...` function at the end of the contract. Keeping the hashing apart keeps the action functions short and avoids Solidity's "stack too deep" limit on functions with many variables.

### Events

Each record emits an event with the same name and the same field names as the backend's ledger record (`../shared/src/records.ts`): `BoardSet`, `HandoverProposed`, `HandoverApproved`, `HandoverCancelled`, `BatchCreated`, `BatchUpdated`, `BatchRemoved`, `OpeningSalesRecorded`, `TicketIssued`, `ExpenseProposed` and `ExpenseVoted`. So the adapter turns an event into a record field by field. `actor` is the signer, and `address(0)` on genesis records, which nobody signs. Strings such as `handoverId` go in the events in plain text, so they can be read back.

Two more events are conveniences, not records: `TermStarted` when a board takes office, and `ExpenseDecided` when an expense leaves pending, after a vote or a handover recount. The backend's indexer works both out itself, so its adapter skips them.
