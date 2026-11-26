# Tessera — Revenue and Cost Sensitivity

How sensitive Tessera's revenue per association is to payment, support and user-acquisition costs. Every number below is an assumption that can be changed; the sources are listed for the ones taken from outside.

> **Replace before using:** the repository only defines the resale split (10% royalty to the association, 5% platform fee, `shared/src/records.ts`). The **service fee on primary sales (5%)** is an assumption of this model, not a decision recorded anywhere else. Use the business plan's figure.

## Model

Per association per year:

```
GMV           = events × tickets per event × average ticket price
revenue       = GMV × primary service fee + resale GMV × 5% platform fee
Pix cost      = (GMV + resale GMV) × Pix receiving fee
support cost  = events × support hours per event × hourly cost
acquisition   = cost to acquire the association ÷ years it stays
reversal cost = GMV × reversal rate × handling cost (time spent per reversed payment, valued at the amount)
contribution  = revenue − Pix − support − acquisition − reversal handling
break-even    = fixed costs per year ÷ contribution per association
```

The reversed ticket value itself is the association's loss and appears in its open accounts as "Payments reversed by the bank"; Tessera bears only the handling.

## Assumptions

| Parameter | Best | Base | Worst | Source or reasoning |
|---|---|---|---|---|
| Events per year | 8 | 8 | 8 | One association, as in the seed data |
| Tickets per event | 400 | 400 | 400 | Seed data: 250 to 700 per event |
| Average ticket price | R$ 50 | R$ 50 | R$ 50 | Seed data: R$ 25 to R$ 180 |
| Primary service fee | 5% | 5% | 5% | **Assumption** (see the note above) |
| Tickets resold | 10% | 10% | 10% | Assumption; resales at about 110% of face value |
| Pix receiving fee | 0% | 1.19% | 1.89% | Mercado Pago 0% for most sellers; Efí and Stripe 1.19%; PagBank up to 1.89% (third-party, unverified) |
| Reversal rate (share of GMV) | 0.01% | 0.05% | 0.1% | BCB open data: accepted fraud claims about 0.004–0.006% of all Pix (Sep 2025 – Sep 2026), mostly person-to-person scams; widened for a merchant's own exposure |
| Support hours per event | 1.5 h | 3 h | 8 h | Assumption: onboarding the event, answering buyers, reversal follow-up |
| Hourly support cost | R$ 60 | R$ 60 | R$ 60 | Assumption |
| Acquisition cost per association | R$ 500 | R$ 1.500 | R$ 4.000 | Assumption: visits, demo, onboarding |
| Years an association stays | 3 | 3 | 2 | Assumption: one board term is a year; boards change |
| Fixed costs per year (hosting, operations) | R$ 24.000 | R$ 24.000 | R$ 24.000 | Assumption |

Sources for fees and reversal rates: [Mercado Pago](https://www.mercadopago.com.br/blog/quanto-custa-receber-pagamentos-via-pix-e-codigo-qr), [Efí](https://sejaefi.com.br/tarifas), [Stripe](https://stripe.com/br/pricing/local-payment-methods), [BCB EstatisticasFraudesPix](https://olinda.bcb.gov.br/olinda/servico/Pix_DadosAbertos/versao/v1/odata/EstatisticasFraudesPix(Database=@Database)?@Database='202509'&$format=json). Checked on 2026-11-26; fees change often and depend on the contract.

## Scenarios (per association per year)

GMV is R$ 160.000 in every scenario; revenue is R$ 8.880 (R$ 8.000 primary fee + R$ 880 resale fee).

| Scenario | Pix | Support | Acquisition | Reversal handling | **Contribution** | **Break-even** |
|---|---|---|---|---|---|---|
| Best | R$ 0 | R$ 720 | R$ 167 | R$ 16 | **R$ 7.977** | **3 associations** |
| Base | R$ 2.113 | R$ 1.440 | R$ 500 | R$ 80 | **R$ 4.747** | **5.1 associations** |
| Worst | R$ 3.357 | R$ 3.840 | R$ 2.000 | R$ 160 | **−R$ 477** | **never** |

## One parameter at a time (from the base case)

| Parameter | Value | Contribution | Break-even |
|---|---|---|---|
| Primary service fee | 3% | R$ 1.547 | 15.5 associations |
| | 5% | R$ 4.747 | 5.1 |
| | 8% | R$ 9.547 | 2.5 |
| Support hours per event | 1.5 h | R$ 5.467 | 4.4 |
| | 3 h | R$ 4.747 | 5.1 |
| | 8 h | R$ 2.347 | 10.2 |
| Pix receiving fee | 0% | R$ 6.860 | 3.5 |
| | 1.19% | R$ 4.747 | 5.1 |
| | 1.89% | R$ 3.503 | 6.9 |
| Acquisition cost | R$ 500 | R$ 5.080 | 4.7 |
| | R$ 1.500 | R$ 4.747 | 5.1 |
| | R$ 4.000 | R$ 3.913 | 6.1 |

## What it says

- **The service fee and support time dominate.** At a 3% fee the model needs three times as many associations; 8 support hours per event halve the contribution.
- **The Pix provider matters more than reversals.** Moving from a 0% to a 1.89% provider costs about R$ 3.400 per association per year; reversals at the system-wide rate cost under R$ 100.
- **Acquisition cost is spread over the years an association stays.** Board turnover is the risk: if a new board drops Tessera after one term, the worst case turns negative. The handover feature (the history stays with the association) is the retention argument.
- **The worst case loses money** because all bad assumptions stack. Keeping support under about 4 hours per event and choosing a low-fee Pix provider are enough to stay positive even with a high acquisition cost.

## Risks the numbers do not show

- **False fraud claims (MED).** Pix has no chargeback for commercial disputes, but a buyer can claim fraud. The receiver's provider decides within 7 days, and the money is blocked meanwhile. Tessera records each reversal on the ledger, so the association sees the loss, but it cannot recover it.
- **Provider pricing changes.** Free tiers depend on volume and seller type.
