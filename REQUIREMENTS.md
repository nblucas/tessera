# Tessera — Frontend MVP Requirements

Clickable MVP with mocked data. No real backend or blockchain yet.

## Student

- [x] 1. Sign in with e-mail (fake, just to get in)
- [ ] 2. List of the association's events
- [ ] 3. Event page with batches and prices, and a "Buy" button
- [ ] 4. Pix checkout (QR code screen and a "simulate payment" button)
- [ ] 5. My tickets, with the QR code for each one
- [ ] 6. Resell a ticket: choose a price, within the resale cap
- [ ] 7. List of tickets for resale, with a button to buy

## Seller

- [ ] 8. Personal sales link (`/event/x?seller=y`)
- [ ] 9. "My sales" screen with accumulated commission

## Board

- [ ] 10. Create and edit events and batches (price, quantity, resale cap)
- [ ] 11. Register sellers and their commission percentage
- [ ] 12. Submit an expense (amount, category, event, receipt upload)
- [ ] 13. Approve or reject expenses proposed by other directors
- [ ] 14. Board handover: propose the new board and approve it

## Public dashboard (no login)

- [ ] 15. The association's income and expenses, per event
- [ ] 16. Balance and treasury summary
- [ ] 17. Download an expense's receipt

## Gate

- [ ] 18. Scan a ticket's QR code and show "valid", "already used" or "invalid"

## Suggested order

1. Main purchase flow: 1 → 2 → 3 → 4 → 5
2. Public dashboard: 15 → 16 (the project's main differentiator)
3. Everything else
