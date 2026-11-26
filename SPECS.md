# Tessera — Usage Flows

A guided tour of everything you can do in the clickable MVP, written so anyone can open the app and try each flow.

Tessera gives a student association (*atlética*) **open accounts**: every income and every approved expense is public, and no one, not even the board, can change it later. Ticket sales are how money comes in, and each sale is recorded in the open accounts automatically.

> The app runs against the demo backend (`BACKEND.md`): real sign-in sessions, a Postgres database and a fake ledger that checks every signature. Payments, e-mail and the blockchain are still simulated. See `ARCHITECTURE.md` for what each part will become.

## Getting started

You need Node 22 and Docker.

```bash
npm install
npm run db:up                           # Postgres in Docker
cp backend/.env.example backend/.env    # demo mode
npm run dev:backend                     # API on http://localhost:3000
npm run dev:frontend                    # in another terminal
```

Open the URL Vite prints (usually http://localhost:5173). The frontend reaches the API through `/api`.

### Test accounts

There are no passwords. In demo mode **any valid e-mail signs you in** without a code (outside demo mode a 6-digit code is e-mailed). Some e-mails have extra roles:

| Role | E-mails | What they see |
|---|---|---|
| Student | any other e-mail, e.g. `student@demo.com` | Events, checkout, My tickets |
| Board | `diego@demo.com`, `elisa@demo.com`, `felipe@demo.com` | Everything a student sees, plus **Board** |
| Anyone (signed out) | — | **Open accounts** only |

The board has 3 directors, so a **majority is 2**.

### Seed data

The app starts with four events from *Atlética Integrada*:

| Event | Date | Tickets |
|---|---|---|
| Halloween Night | Dec 5, 2026 | Sold out |
| End of Year Party | Dec 12, 2026 | 1st batch sold out; 2nd and 3rd on sale |
| Freshers Welcome 2027 | Feb 20, 2027 | Freshers and General batches |
| Interuniversity Games | Apr 16, 2027 | Full pass and Single day |

Their past sales already count as income in the open accounts. There are no expenses yet.

### Where data lives

Everything is saved by the backend in Postgres, so every browser sees the same data. Each account also gets a wallet key, created in the browser on first sign-in and kept in IndexedDB; board actions (votes, batches, handovers) are signed with it. The three seed directors have fixed demo keys, so they can sign from any browser.

To test flows that involve two people (a director approving another director's expense, for example), **sign out and sign in with the other e-mail in the same browser**.

### Starting over

On the sign-in page, click **Reset demo data** and confirm. The backend deletes everything and brings back the seed data above. Everyone is signed out.

---

## 5-minute demo

The whole story, end to end:

1. Sign in as `student@demo.com`, open **End of Year Party**, buy a ticket from the 2nd batch and click **Simulate payment**.
2. Sign out and open **Open accounts**: the sale shows up as income for that event.
3. Sign in as `diego@demo.com`, go to **Board → Expenses → New expense**, enter "Sound system rental", R$ 1.200,00, category *Suppliers*, event *End of Year Party*, and attach any image or PDF.
4. Sign out, sign in as `elisa@demo.com`, go to **Board → Expenses** and click **Approve**. The expense becomes *Approved*.
5. Sign out and open **Open accounts**: the expense appears under the event, the balance drops, and the receipt can be downloaded and verified.
6. Sign in as a director, go to **Board → Handover** and propose a new board (for example `elisa@demo.com` and `student@demo.com`). Sign in once as each new director, then as the proposer click **Submit proposal**, and approve it as a second director. The old directors lose access; the history stays.

The sections below describe each step in detail.

---

## Student flows

### 1. Sign in

1. Open the app. You land on the sign-in page.
2. Type any e-mail and click **Sign in**. An invalid e-mail shows an error under the field.
3. You are taken to **Events**. Your e-mail and a **Sign out** button are in the top bar.

If you open a protected page while signed out, you are sent to sign in and then taken back to that page.

### 2. Browse events

- **Events** lists upcoming events sorted by date, each with its date, location and the lowest available price ("From R$ 55,00"), or **Sold out**.
- Click a card to open the event page: description and the list of batches, each with price and tickets left. Sold-out batches have a disabled **Buy** button.

### 3. Buy a ticket with Pix

1. On an event page, click **Buy** on a batch.
2. The checkout shows the event, batch and price, a Pix QR code and a "copy and paste" Pix code with a **Copy** button.
3. Click **Simulate payment**. The button shows "Confirming payment…" for about 2 seconds.
4. **Payment confirmed** appears with the ticket number. Click **View my tickets**.

The QR code and Pix code are fake: they look real but no bank app can read them.

### 4. My tickets

- **My tickets** lists your tickets, newest first, with event, batch, price paid, ticket code (e.g. `#3F9A12BC`) and status.
- Valid tickets show a QR code to present at the entrance.
- If you have no tickets, a **Browse events** button takes you back to the list.

---

## Public flows (no sign-in needed)

### 5. Open accounts

Open **Open accounts** from the top bar, or **See the association's open accounts →** on the sign-in page.

**Summary at the top**

- **Balance**: income minus approved expenses (red if negative).
- **Total income**: everything from ticket sales.
- **Total expenses**: only expenses approved by a majority of the board.
- **Expenses by category**: one bar per category, largest first, with amount and share of the total. Hover a bar for details.

**Per event**

One card per event, with its net result and:

- **Ticket sales**: number of tickets and amount.
- Each **approved expense**: description, category, who approved it and the amount.

Expenses not tied to an event appear in a **General** card. Pending and rejected expenses never appear here.

### 6. Verify a receipt

Under each approved expense in **Open accounts**:

1. Click **Download receipt** to get the original file.
2. The **Recorded SHA-256** shows the hash saved when the expense was submitted.
3. Click **Verify a copy** and pick a file. The app computes its SHA-256:
   - Same file → green "✓ Matches the recorded hash. The receipt is unchanged."
   - Any other or edited file → red "✗ Does not match", with the file's hash for comparison.

This is how a member checks that the board did not swap a receipt after the fact.

---

## Board flows

Sign in as `diego@demo.com`, `elisa@demo.com` or `felipe@demo.com` and click **Board**. The board area has three tabs: **Events**, **Expenses** and **Handover**. Anyone else who opens `/board` sees "Board only".

### 7. Create and edit events

1. **Board → Events** lists every event with date, number of batches, tickets sold out of capacity and revenue.
2. Click **New event** (or **Edit** on an existing one).
3. Fill in title, description, date and time, location and pick a color.
4. Under **Batches**, set name, price (e.g. `40,00`) and quantity for each. Use **+ Add batch** and **Remove** as needed.
5. Click **Create event** / **Save changes**. The event shows up for students right away.

Rules:

- Title, date and location are required; prices must be valid and quantities whole numbers.
- A batch that already has sales is frozen: it cannot be removed (it shows "X sold" instead of **Remove**) and its price and quantity cannot change. To sell more, add a new batch.

### 8. Submit an expense

1. **Board → Expenses → New expense**.
2. Enter a description, amount, category (Venue, Suppliers, Drinks, Security, Marketing, Seller commissions or Other) and the event, or *General* if it is not tied to one.
3. Attach the receipt: an image or PDF up to 1 MB. Its **SHA-256** appears as soon as it is read.
4. Click **Submit expense**.

The expense starts as **Pending** with 1 approval: submitting counts as your own vote.

### 9. Approve or reject an expense

1. Sign out and sign in as **another** director.
2. **Board → Expenses** shows a **Pending** section and a **Decided** section.
3. On a pending expense, click **Download receipt** to review it, then **Approve** or **Reject**.

- Each director votes once. After voting you see "Waiting for the rest of the board".
- **2 approvals** → *Approved*: the expense now appears in **Open accounts**.
- **2 rejections** → *Rejected*: it stays in the board history but never reaches the open accounts.

### 10. Board handover

1. **Board → Handover** shows the current board (Term 1) and a form for the next one.
2. Enter the name and e-mail of each new director (3 rows by default; add or remove as needed) and click **Propose handover**.
3. The proposal waits until every new director has signed in once, which creates their wallet. It shows who is still missing.
4. When everyone has signed in, the proposer clicks **Submit proposal**. Submitting counts as their approval, and the proposal shows its approval count ("1/2 approvals"). The proposer can **Cancel proposal** at any time.
5. Sign in as another current director and click **Approve handover**.

Once a majority approves:

- **Term 2** starts with the new directors; Term 1 moves to **Past terms** with its start and end dates.
- The old directors lose access to **Board** immediately. The new ones get it.
- Events, expenses and every past approval stay with the association. Expenses already approved or rejected stay that way.
- Pending expenses are recounted with the new board's votes only. Votes from the old directors stay in the history but no longer count, so the new board decides them.

Tip: use **Reset demo data** to get the original board back.

---

## Resale

### Resell a ticket

1. In **My tickets**, click **Resell** on a valid ticket.
2. Enter a price. The form shows the maximum allowed (the batch's resale cap, e.g. 120% of face value) and how the price splits: 10% to the association, 5% platform fee, the rest to you via Pix.
3. Click **List for sale**. The listing is signed with your wallet and checked by the ledger: only the owner can list, only a valid ticket (not revoked, not already listed) and only within the cap. A refusal shows the ledger's reason, for example "price is above the resale cap of 6600 cents".
4. The ticket becomes *Listed for resale*, loses its QR code and gets a **Cancel listing** button.

### Buy a resale ticket

1. Sign in with another e-mail and open **Resale** (or the **Resale** section on the event page). Your own listings show *Your listing* instead of **Buy**.
2. Click **Buy**, then **Simulate payment**.
3. The oracle settles the resale on the ledger: the seller's ticket becomes *Resold*, the buyer gets a new valid ticket, and the seller's share is paid by Pix.
4. In **Open accounts**, the association's 10% shows up as **Resale royalties**.

The event form has a **Resale cap (%)** field, applied to every batch without sales.

---

## PD3 demo: payments you can verify

Run everything on the local chain so the ledger claims are real (see `contracts/ADAPTER.md`): `npm run node` and `npm run deploy:local` in `contracts/`, then the backend with `LEDGER_RPC_URL` and an empty database, then the frontend. The **Demo console** (top bar, demo mode only) plays the bank's part: every button sends what a Pix provider would send, through the same signed webhook.

**Who is trusted.** Open **Open accounts → Payments**. The box **Who reports payments** names the payment oracle (its address), what it may and may not do, and how many tickets, resales, refunds and reversals it reported. The five reconciliation checks compare its reports with the payments the bank confirmed. A board majority can replace the oracle in **Board → Handover → Payment oracle**.

1. **Sale → payment → ticket.** Sign in as `ana@student.edu`, buy a ticket for **End of Year Party** and click **Simulate payment**. The ticket appears in **My tickets**. In the console the order shows its payment reference (SHA-256 of the Pix end-to-end id), and **Open accounts** lists it as *Ticket issued*.
2. **Duplicate callback.** In the console, click **Resend webhook (duplicate)** on that order. The notifications list shows *Duplicate callback ignored*; there is still one ticket, and the ledger would refuse a second outcome for the same payment reference anyway.
3. **Reversed payment.** Click **Reverse payment (MED)**: the bank returns the money to the payer. The ticket becomes *Revoked: payment reversed by the bank*, its place goes back on sale, and **Open accounts** shows *Payments reversed by the bank −R$ 55,00* under the event.
4. **Failed settlement.** Start another purchase, leave the checkout and in the console click **Pay, settlement fails**. The payment is refunded and reported: **Open accounts** lists it as *Refunded*, with the reason.
5. **Invalid resale.** In **My tickets**, try to resell a ticket above its cap: the ledger refuses it. In the console, click **Try to resell it as me** on someone else's ticket: refused, *only the owner lists a ticket*. Trying to resell the revoked ticket from step 3 is refused too.
6. **Valid resale.** List a ticket within the cap, sign in as another student and buy it. The royalty appears in **Open accounts**.
7. **Reconciliation.** Back in **Open accounts → Payments**, every check shows ✓: each payment has one outcome, every outcome matches a payment the bank confirmed, every confirmed payment has its outcome, and every reversal points to the ticket it paid for.

---

## Roadmap flows (hidden in the MVP)

These features are built but turned off to keep the MVP focused. To try them, set the flag to `true` in `frontend/src/features.ts` and reload:

```ts
export const FEATURES = {
  resale: true,
  sellers: false,
  gate: false,
}
```

### Sellers and commissions (`sellers: true`)

Seed sellers: `ana@demo.com` (10%), `bruno@demo.com` (8%), `carla@demo.com` (10%).

1. Sign in as `ana@demo.com` and open any event: a **Your sales link** box shows a link like `/events/end-of-year-party?seller=ana` with a **Copy** button.
2. Sign out, sign in as a student and open that link. The page says "You're buying through Ana Souza's link", and the checkout shows "Sold by Ana Souza".
3. Buy the ticket.
4. Sign in as `ana@demo.com` again and open **My sales**: tickets sold, total sales, commission earned and a list of each sale.
5. As a director, **Board → Sellers** lets you add sellers (name, e-mail, %), change a commission (applies to new sales only) and remove sellers.

### Gate check-in (`gate: true`)

1. Sign in as a director and open **Gate**.
2. Pick the event. The page shows how many tickets have been checked in.
3. Type a ticket code (e.g. `#3F9A12BC` from **My tickets**) and click **Scan**, or pick a ticket from **Demo: simulate a scan**.
4. The result appears in a large colored box:
   - **Valid** (green): "Let them in." The ticket becomes *Used*.
   - **Already used** (yellow): shows when it was checked in.
   - **Invalid** (red): unknown code, another event, listed for resale or cancelled.
5. **Recent scans** keeps the last 10 results.

With this flag on, the QR code in **My tickets** changes every 30 seconds, so a screenshot quickly stops working.

---

## Known limitations

- **Demo backend.** Payments, e-mail and the ledger are simulated (see `BACKEND.md`).
- **Wallet keys live in one browser.** An account created in one browser cannot sign board actions from another; clearing the browser data loses the key. The seed directors are the exception.
- **Fake QR and Pix codes.** They cannot be read by a camera or bank app; the gate uses the ticket code instead.
- **No sponsorships yet.** The open accounts only show ticket income.
- **Roadmap features keep local data.** Sellers and gate are not supported by the backend yet; with their flags on they use the browser or show an error.
- **Reversals.** Only full reversals are recorded; a partial devolução is not. Reversing a payment whose ticket was already resold is recorded as an income loss, and the buyer keeps their ticket.
- **One trusted oracle.** The oracle can still lie about a payment it never received; the reconciliation checks and the payment references let a treasurer with the bank statement catch it, and the board can replace it.
