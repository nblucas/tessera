# Tessera — Hybrid Architecture

What goes on the ledger and what stays in a regular centralized backend.

## Rule of thumb

Put a record on the ledger when **someone has a reason to dispute it and whoever keeps it is a party to the dispute**. Everything else (personal data, large files, data that must be deletable, data that changes often, UI conveniences) stays in the centralized backend.

## Ledger (public, append-only)

| Record | Why |
|---|---|
| Current board, authorized sellers and gate staff | Every other rule checks these roles; a handover cannot be faked |
| Board handover (proposal and approvals) | Each new board distrusts the records left by the previous one |
| Ticket batches and their rules (price, supply, commission, resale cap, royalty) | Frozen after the first sale, so rules can't change mid-event |
| Ticket issuance, owner and status (valid, listed, used, cancelled) | Prevents double sales and fake tickets |
| Seller of each sale and its commission | Ends commission disputes; anyone can add them up |
| Resale: old ticket cancelled, new one issued, the three amounts | Buyer and reseller are strangers |
| Listing a ticket for resale (price within the cap) | Blocks the ticket at the gate while listed |
| Income and expenses in BRL cents, per event | The core promise: accounts not even the board can change |
| Sponsorship amounts (as income) | Sponsors get proof of how their money was used |
| Expense approvals by director address | Proves a majority of the board approved |
| SHA-256 hash of each receipt | Proves the receipt file was not swapped |
| Check-ins, written in small batches | Makes "already used" verifiable |

## Centralized backend (private, editable, deletable)

| Data / service | Why |
|---|---|
| Name, CPF, e-mail and the person ↔ account mapping | LGPD deletion: erasing the mapping leaves the ledger history pseudonymous |
| Sign-in, sessions and embedded wallet (e-mail recovery) | Keeps the blockchain invisible to users |
| Pix integration: charges, webhooks, transaction details | Banking data is private; only the outcome reaches the ledger |
| Payment oracle and relayer (confirms payments, sponsors gas) | Services, not records |
| Receipt files and expense descriptions | May contain suppliers' personal data; only the hash goes on-chain |
| Sponsorship contracts and sponsor details | Only the amount is public |
| Indexer (dashboard, "My sales", balances built from ledger events) | A cache anyone could rebuild from the ledger |
| Temporary ticket reservation while Pix is pending | Changes often, no evidentiary value |
| Event texts, colors, locations, images; resale search and sorting | Storefront content nobody disputes |
| Rotating QR code (every 30 s) | Generated in the app and signed by the holder's key; nothing is stored |

## Limits

1. The ledger guarantees a record is not changed after it is written, not that every real-world transaction is written. An expense paid off the books never shows up.
2. The Pix oracle is a centralized point of trust. It may issue tickets and settle resales, but it must not be able to edit records or approve expenses.

## Impact on the frontend

Each `localStorage` store in the MVP (`tickets`, `events`, `sellers`, `expenses`, `board`) mixes both kinds of data. With a real backend, each one splits into a **record** part (ledger) and a **detail** part (backend). For example, an expense becomes amount, category, event, receipt hash and approvals on the ledger, and the receipt file and description in the backend.
