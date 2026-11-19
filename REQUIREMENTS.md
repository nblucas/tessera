# Tessera — Frontend MVP Requirements

Clickable MVP with mocked data. No real backend or blockchain yet.

**Focus:** open financial management for the association. Ticket sales are how money comes in, and every sale is recorded in the open accounts automatically.

> Event created → ticket sold with Pix → income lands in the open accounts → director submits an expense with its receipt → board majority approves → any member verifies → the next board takes over with the full history

## MVP

### Student

- [x] 1. Sign in with e-mail (fake, just to get in)
- [x] 2. List of the association's events
- [x] 3. Event page with batches and prices, and a "Buy" button
- [x] 4. Pix checkout (QR code screen and a "simulate payment" button)
- [x] 5. My tickets, with the QR code for each one

### Board

- [x] 10. Create and edit events and batches (price, quantity; resale cap only with `resale`)
- [x] 12. Submit an expense (amount, category, event, receipt upload)
- [x] 13. Approve or reject expenses proposed by other directors
- [x] 14. Board handover: propose the new board and approve it

### Public dashboard (no login)

- [x] 15. The association's income and expenses, per event
- [x] 16. Balance and treasury summary
- [x] 17. Download an expense's receipt

### Demo

- [x] 19. "Reset demo data" button that clears all saved data and restores the seed state

## Roadmap

Already built, but hidden from the MVP behind flags in `frontend/src/features.ts`. Presented in the pitch as next steps.

### Resale (`resale`)

- [x] 6. Resell a ticket: choose a price, within the resale cap
- [x] 7. List of tickets for resale, with a button to buy

### Sellers and commissions (`sellers`)

- [x] 8. Personal sales link (`/events/x?seller=y`)
- [x] 9. "My sales" screen with accumulated commission
- [x] 11. Register sellers and their commission percentage

### Gate (`gate`)

- [x] 18. Scan a ticket's QR code and show "valid", "already used" or "invalid"
