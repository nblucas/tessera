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
| Batch rules for commission, resale cap and royalty *(roadmap)* | Same reason as the other batch rules |
| Seller of each sale and its commission *(roadmap)* | Ends commission disputes; anyone can add them up |
| Listing a ticket for resale, price within the cap *(roadmap)* | Blocks the ticket at the gate while listed |
| Resale: old ticket cancelled, new one issued, the three amounts *(roadmap)* | Buyer and reseller are strangers |
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
- **The payment oracle signs only ticket issuance.** Its key and the relayer's are separate.
- The rules (board role, majority of the **current** board, batches frozen after the first sale) are enforced by the ledger itself. The backend checks them early only to show friendly errors.

The MVP record types are listed in `BACKEND.md` ("Record types"). Income is derived from ticket issuance rather than written as a separate record.

## Limits

1. The ledger guarantees a record is not changed after it is written, not that every real-world transaction is written. An expense paid off the books never shows up.
2. The Pix oracle is a centralized point of trust. It may issue tickets (and settle resales, on the roadmap), but it must not be able to edit records or vote on expenses.

## Impact on the frontend

Each `localStorage` store in the MVP (`tickets`, `events`, `sellers`, `expenses`, `board`) mixes both kinds of data. With a real backend, each one splits into a **record** part (ledger) and a **detail** part (backend). For example, an expense becomes amount, category, event, receipt hash, approvals and rejections on the ledger, and the receipt file and description in the backend.
