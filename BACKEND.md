# Tessera — Centralized Backend

Design for the centralized half of the hybrid architecture in `ARCHITECTURE.md`. Not implemented yet.

The backend holds everything private, editable or deletable, and runs the services that talk to the ledger: the **payment oracle**, the **relayer** and the **indexer**. The ledger itself (contracts and chain) is built separately; the backend reaches it only through the `Ledger` interface below.

## Goals and scope

- **Pitch demo now, built for a pilot.** Every outside dependency sits behind an interface with a fake implementation today. Going to a pilot with one real association swaps implementations, not code.
- **MVP features only:** sign-in, events and batches, Pix checkout, tickets, expenses with receipts, voting, handover and open accounts. Resale, sellers and gate stay on the roadmap; the schema leaves room for them (for example a nullable `seller_id` on orders).
- **One association in the product, many in the schema.** Every table has an `association_id` from day one.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript on Node |
| HTTP | Fastify, request and response schemas in zod |
| API style | REST + JSON, OpenAPI generated from the zod schemas |
| Database | Postgres |
| Data access | Drizzle |
| Background jobs | Postgres-backed queue (candidate: `pg-boss`), no Redis |
| EVM signatures | `viem` (server and frontend) |
| Tests | Vitest against real Postgres in Docker |
| Local run | Docker Compose (Postgres + backend) |
| Deploy | Dockerfile; host chosen later |

New packages are confirmed one by one when implementation starts.

## Repository layout

npm workspaces at the repo root:

```
frontend/   the existing React app; providers switch from localStorage to the API one by one
backend/    Fastify app, oracle, relayer, indexer, fake ledger, adapters
shared/     types, money helpers (cents, parseReais), zod schemas, rule functions, EIP-712 types
```

The frontend switch is done provider by provider as each backend area lands. Pages keep using the same context hooks; only the provider files change.

## Adapters

| Interface | Demo implementation | Pilot implementation |
|---|---|---|
| `Ledger` | Fake ledger: append-only, hash-chained Postgres table | Teammate's contracts on an EVM chain |
| `PixProvider` | Fake provider that sends a real, HMAC-signed webhook to the backend | A Brazilian PSP (chosen later) |
| `Mailer` | Prints the sign-in code to the server log | Transactional e-mail service |
| `FileStore` | Local disk | S3-compatible bucket |
| `Signer` (oracle, relayer) | Private keys from environment variables | KMS or remote signer |
| `Wallet` (frontend) | One `viem` key per e-mail in IndexedDB, no recovery | Wallet provider or PIN-encrypted backup (chosen later) |

`PixProvider` follows the shape of the BCB API Pix spec (charge with a `txid`, expiry, webhook on payment, refund). Check this against the chosen PSP before the pilot.

## Ledger boundary

### Interface

```ts
interface Ledger {
  submit(action: SignedAction): Promise<{ entryId: string }>
  readEvents(fromCursor: string | null, limit: number): Promise<{ events: LedgerEvent[]; next: string | null }>
}
```

This is the one contract shared with the ledger teammate. **Agree on the EIP-712 message types before building anything that signs.**

### Signed actions

- Every action is an **EIP-712 typed message** with `actor` (address), `nonce` (per address, prevents replay), `deadline` and the action payload.
- Users sign in their own browser through the `Wallet` interface. The **relayer** only forwards signed actions and pays gas; the backend cannot forge a vote, a proposal or a handover.
- The **oracle** signs as itself, and only `TicketIssued`. This is the trusted role `ARCHITECTURE.md` "Limits" #2 accepts.
- Oracle and relayer use **separate keys**, so a leak of one stays contained.
- The fake ledger checks signatures, nonces and deadlines exactly as the contracts will.

### Record types (v1)

| Record | Signed by | Notes |
|---|---|---|
| `BoardSet` | genesis | Initial board, written once by the seed |
| `HandoverProposed` | current director | New members' addresses; counts as the proposer's approval |
| `HandoverApproved` | current director | Majority of current directors starts the new term |
| `HandoverCancelled` | proposer | Only while the proposal is open |
| `BatchCreated` | current director | Event id, batch id, price in cents, quantity |
| `BatchUpdated` / `BatchRemoved` | current director | Only while the batch has no sales |
| `OpeningSalesRecorded` | genesis | Seed only: count and amount per batch, labelled as imported |
| `TicketIssued` | oracle | Ticket id, batch, owner address, price in cents, order reference |
| `ExpenseProposed` | current director | Amount in cents, category, event or general, receipt SHA-256; counts as the proposer's approval |
| `ExpenseVoted` | current director | Approve or reject |
| `IncomeRecorded` | — | Reserved for sponsorships; not used in v1 |

- **Income is derived** from `TicketIssued` and `OpeningSalesRecorded`. No separate income record, so the two can never disagree.
- **Genesis records** are accepted only while the ledger is empty.
- Descriptions, receipt files and event texts never go on the ledger.

### Rules

The rules live in the ledger: the fake ledger runs them, and the contracts implement the same ones. They are written once as **pure functions in `shared/rules`** with a table of example cases the teammate can reuse to test the contracts. The API runs them early only to return friendly errors.

- **Board role:** only addresses in the current term can sign board actions.
- **Majority:** `floor(n / 2) + 1` of the current board.
- **Expense status:** counted from votes by **current** directors only. Approvals reaching the majority → approved; rejections reaching it → rejected. A decided expense stays decided. When a handover happens, pending expenses are recounted with the new board's votes; earlier votes stay in the history but no longer count.
- **Batches:** frozen (price and quantity) after the first sale. To sell more, add a new batch.
- **Availability:** quantity − sold − active reservations, checked in one transaction (backend side, see Payments).

### Fake ledger

- Lives in its own Postgres schema (`ledger`).
- Each entry stores `prev_hash` and `hash = sha256(prev_hash ‖ canonical payload ‖ signature)`, so any edit breaks the chain.
- A trigger rejects `UPDATE` and `DELETE`. Only the dev-only demo reset may truncate it, and the code says so.

## Identity and signing

- **Sign-in:** `POST /auth/code` e-mails a 6-digit code; `POST /auth/session` exchanges it for a session. Codes expire after 10 minutes and allow 5 attempts.
- **Sessions:** httpOnly, same-site cookie backed by a `sessions` table, so they can be revoked (handover cuts old directors off at once).
- **Demo mode:** the `Mailer` logs the code, and a `DEMO_MODE` flag accepts any code so the demo stays one click.
- **Address registration:** on first sign-in the frontend creates its key and calls `POST /me/address` with a signed one-time challenge. One address per account.
- **Known demo limit:** clearing the browser loses that e-mail's key. The pilot wallet decision fixes this.

## Payments and ticket issuance

```
POST /orders ─► reserve stock + create Pix charge ─► status pending_payment
                                                     │
"Simulate payment" ─► fake PSP sends webhook ────────┘
                                                     ▼
POST /webhooks/pix ─► verify + dedupe by txid ─► status paid ─► job: oracle signs TicketIssued
                                                                       │
relayer submits ─► ledger ─► indexer ─► status issued ◄────────────────┘
```

- **Order states:** `pending_payment → paid → issued`, or `expired` (reservation ran out unpaid), or `failed → refunded`.
- **Reservations:** one per order, expiring together with the Pix charge (15 minutes). Created in the same transaction that checks availability, so the last ticket cannot be sold twice.
- **The frontend polls** `GET /orders/:id` every few seconds behind the existing "Confirming payment…" state.
- **Webhooks** are verified (HMAC in the demo; the PSP's signature or mTLS in the pilot) and deduplicated by `txid`.
- **Failures:** temporary errors (ledger down) retry with backoff. Permanent errors (reservation expired and batch sold out, batch removed) mark the order `failed` and refund through `PixProvider`. The fake provider supports refunds so this path can be demoed.

## Indexer

- Reads `Ledger.readEvents` in order and stores its cursor.
- Writes read tables in their own schema (`read`): tickets by owner, sales per batch, expenses and their status, the current board and past terms, open accounts per event.
- Idempotent: applying the same event twice changes nothing.
- `npm run reindex` drops the read tables and rebuilds them from the ledger, proving the "a cache anyone could rebuild" claim.
- Public endpoints read only from these tables.

## Expenses and receipts

- **Upload first:** `POST /receipts` stores the file through `FileStore`, recomputes its SHA-256 and rejects it if it differs from the hash the client sent. Images and PDFs up to 1 MB.
- **Then propose:** `POST /expenses` takes the description (backend), the receipt id and the signed `ExpenseProposed`.
- **Visibility:** proposals and votes are public on the ledger from the start, including pending and rejected ones; only amounts, categories and hashes are there. The open accounts page keeps showing approved expenses only.
- **Downloads:** public for approved expenses, directors only for pending and rejected ones. Check this against LGPD before the pilot.

## Board and handover

- The proposal form takes names and e-mails. It is stored as a **draft** in the backend.
- A draft can be created before every new director has an address. It shows "waiting for X to sign in" and cannot be approved yet.
- Once every address is known, the proposer signs `HandoverProposed`, and the other current directors sign `HandoverApproved`.
- The majority approval starts the new term; old directors' sessions lose board access immediately because roles are read from the indexer's current board.

## Events and batches

- Event texts, date, location and color are backend data. Batches are ledger records.
- Event ids stay as slugs, as in the frontend.
- Batches with sales cannot be edited or removed. The event form disables those fields.

## Personal data (LGPD)

- Stored: name and e-mail. **No CPF** in v1; the PSP collects payer data itself.
- `DELETE /me` erases name, e-mail and sessions, leaving only the address, so the ledger history becomes pseudonymous. It is refused while the account is a current director or has an order in progress.
- Deleting a receipt file for privacy leaves its hash on the ledger: it still proves a receipt existed, but the original can no longer be checked. The UI says so.

## API (draft)

| Method and path | Who | Purpose |
|---|---|---|
| `POST /auth/code` | anyone | Send a sign-in code |
| `POST /auth/session` / `DELETE /auth/session` | anyone / signed in | Sign in / sign out |
| `GET /me` | signed in | Account, address, roles |
| `POST /me/address/challenge`, `POST /me/address` | signed in | Register the wallet address |
| `GET /me/nonce` | signed in | Next nonce for signing |
| `DELETE /me` | signed in | Erase personal data |
| `GET /events`, `GET /events/:id` | signed in | Storefront and batch availability |
| `POST /events`, `PATCH /events/:id` | board | Event details plus signed batch actions |
| `POST /orders`, `GET /orders/:id` | signed in | Reserve and pay; poll status |
| `GET /me/tickets` | signed in | My tickets |
| `POST /webhooks/pix` | PSP | Payment confirmation |
| `POST /receipts`, `GET /receipts/:id` | board / see Expenses | Upload / download a receipt |
| `GET /expenses`, `POST /expenses`, `POST /expenses/:id/votes` | board | List, propose, vote |
| `GET /board`, `POST /handover`, `POST /handover/:id/approvals`, `DELETE /handover/:id` | board | Handover flow |
| `GET /accounts` | public | Open accounts summary and per event |
| `GET /ledger/events` | public | Raw ledger feed, so anyone can rebuild the accounts |
| `POST /demo/orders/:id/pay`, `POST /demo/reset` | demo mode only | Simulate a payment; reset all data |

## Database schemas

| Schema | Holds |
|---|---|
| `app` | Associations, accounts (e-mail, name, address), auth codes, sessions, event details, orders, reservations, receipts metadata, expense descriptions, handover drafts |
| `ledger` | Fake ledger entries and nonces (demo only) |
| `read` | Indexer read tables and its cursor |

Money is stored as integer cents (`bigint`), timestamps as `timestamptz`.

## Demo seed and reset

- The seed writes the association, the event details, `BoardSet` with the three seed directors, one `BatchCreated` per batch and one `OpeningSalesRecorded` per batch with past sales.
- `POST /demo/reset`, available only with `DEMO_MODE`, wipes all three schemas and reruns the seed. The frontend's **Reset demo data** button calls it.

## Testing

- Vitest against real Postgres in Docker.
- Most effort on the shared rule functions (with the example table shared with the ledger teammate), reservations under concurrency, the oracle's failure paths and `reindex` producing the same read tables.

## Changes from the current frontend

- Only current directors' votes count; pending expenses are recounted after a handover (`voteOnExpense`, `SPECS.md` §10).
- Batch price and quantity are frozen after the first sale (`EventFormPage`, `SPECS.md` §7).
- "X left" goes down with each sale, because availability comes from the ledger and reservations.

## Open items

- **Chain:** assumed EVM; confirm with the ledger teammate.
- **EIP-712 message types:** agree with the ledger teammate first.
- **Receipt downloads and LGPD:** check public downloads before the pilot.
- **Product idea:** show pending and rejected expenses in the open accounts.
- **Pilot choices:** wallet (provider or PIN backup), PSP, e-mail service, host, KMS.
