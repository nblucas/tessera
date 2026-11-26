# Tessera — Hybrid Architecture

What goes on the ledger and what stays in a regular centralized backend.

## Rule of thumb

Put a record on the ledger when **someone has a reason to dispute it and whoever keeps it is a party to the dispute**. Everything else (personal data, large files, data that must be deletable, data that changes often, UI conveniences) stays in the centralized backend.

Rows marked *(roadmap)* belong to features outside the MVP scope: resale, sellers and commissions, and gate check-in (see `REQUIREMENTS.md`).

## Ledger (public, append-only)

| Record | Why |
|---|---|
| Current board | Every other rule checks this role; a handover cannot be faked |
| Board handover (proposal and approvals) | Each new board distrusts the records left by the previous one |
| Ticket batches and their rules (price, supply) | Frozen after the first sale, so rules can't change mid-event |
| Ticket issuance and owner | Prevents double sales and fake tickets |
| Income and expenses in BRL cents, per event | The core promise: accounts not even the board can change |
| Sponsorship amounts (as income) | Sponsors get proof of how their money was used |
| Expense approvals and rejections by director address | Proves a majority of the board decided, and who voted each way |
| SHA-256 hash of each receipt | Proves the receipt file was not swapped |
| Authorized sellers and gate staff *(roadmap)* | Roles for the features below |
| Batch resale cap; fixed royalty and platform fee | Same reason as the other batch rules |
| Batch commission *(roadmap)* | Same reason |
| Seller of each sale and its commission *(roadmap)* | Ends commission disputes; anyone can add them up |
| Listing a ticket for resale, price within the cap | Blocks the ticket at the gate while listed |
| Resale: old ticket cancelled, new one issued, the three amounts | Buyer and reseller are strangers |
| Every Pix payment outcome: ticket, resale, refund, reversal, with its payment reference | Makes the off-chain payment boundary verifiable (see below) |
| The payment oracle and its replacement by the board | Who is trusted to report payments, and how that trust is revoked |
| Check-ins, written in small batches *(roadmap)* | Makes "already used" verifiable |

## Centralized backend (private, editable, deletable)

| Data / service | Why |
|---|---|
| Name, CPF, e-mail and the person ↔ account mapping | LGPD deletion: erasing the mapping leaves the ledger history pseudonymous |
| Sign-in, sessions and embedded wallet (e-mail recovery) | Keeps the blockchain invisible to users |
| Pix integration: charges, webhooks, transaction details | Banking data is private; only the outcome reaches the ledger |
| Payment oracle and relayer (confirms payments, sponsors gas; settles resales on the roadmap) | Services, not records |
| Receipt files and expense descriptions | May contain suppliers' personal data; only the hash goes on-chain |
| Sponsorship contracts and sponsor details | Only the amount is public |
| Indexer (dashboard, "My sales", balances built from ledger events) | A cache anyone could rebuild from the ledger |
| Temporary ticket reservation while Pix is pending | Changes often, no evidentiary value |
| Event texts, colors, locations, images | Storefront content nobody disputes |
| Resale search and sorting *(roadmap)* | Built by the indexer from ledger listings |
| Rotating QR code, every 30 s *(roadmap)* | Generated in the app and signed by the holder's key; nothing is stored |

## Who signs ledger records

- **Users sign their own records** (board actions, batches, expenses, votes) as EIP-712 typed messages, with a key that never leaves their device. The relayer only forwards signed records and pays gas, so the backend cannot forge a vote or a handover.
- **The payment oracle signs only payment outcomes:** ticket issued, resale settled, payment refunded, payment reversed. Its key and the relayer's are separate.
- The rules (board role, majority of the **current** board, batches frozen after the first sale) are enforced by the ledger itself. The backend checks them early only to show friendly errors.

The MVP record types are listed in `BACKEND.md` ("Record types"). Income is derived from ticket issuance rather than written as a separate record.

## The payment trust boundary

Pix payments happen off the ledger, so someone must report them. That party is the **payment oracle**: one key, named on the ledger and in the app's open accounts.

| Step | Off the ledger (backend) | On the ledger (oracle-signed) |
|---|---|---|
| Payment confirmed | The provider's signed webhook; logged with what was done about it | — |
| Ticket bought | — | `TicketIssued` with the payment reference: SHA-256 of the Pix end-to-end id |
| Same callback again | Logged as *duplicate*, ignored | A second outcome for the same reference is refused |
| Settlement fails (sold out, simulated failure, wrong amount) | Refund through the API Pix (`PUT /pix/{e2eid}/devolucao/{id}`, idempotent) | `PaymentRefunded` with the reference and reason |
| Bank reverses the payment (devolução, MED) | Notified in the same webhook (`devolucoes[]`) | `PaymentReversed`: the ticket is revoked, its place returns to stock, income drops |
| Resale paid | Reseller paid by Pix | `ResaleSettled` with the reference and the split |

**What makes it verifiable.** Each payment reference has exactly one outcome on the ledger, enforced by the contract. Anyone can compare the oracle's reports with the payments the backend received (`GET /reconciliation`, shown in the open accounts), and a treasurer holding the bank statement can hash each end-to-end id and find its record.

**What is still trusted.** The oracle could report a payment that never happened, or stay silent about one that did. Both show up as a mismatch against the bank statement, and a board majority can replace the oracle with a signed vote.

## Limits

1. The ledger guarantees a record is not changed after it is written, not that every real-world transaction is written. An expense paid off the books never shows up.
2. The Pix oracle is a centralized point of trust. It may report payment outcomes (tickets, resales, refunds, reversals), but it cannot edit records, vote, change batches or move a ticket without a payment, and the board can replace it.

## Impact on the frontend

Each `localStorage` store in the MVP (`tickets`, `events`, `sellers`, `expenses`, `board`) mixes both kinds of data. With a real backend, each one splits into a **record** part (ledger) and a **detail** part (backend). For example, an expense becomes amount, category, event, receipt hash, approvals and rejections on the ledger, and the receipt file and description in the backend.
