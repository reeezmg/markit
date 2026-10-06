# Cash / Primary Bank difference investigation

Read-only investigation on 2026-09-29, against the importer preview through 2026-09-29. Differences below mean projected new balance minus old balance AFTER the proposed history import; the import has not been applied.

| Company | Account | Difference | Exact explanation |
| --- | --- | ---: | --- |
| Markit | Cash | +550.00 | Nisarga DP-6, DP-7, DP-8 and DP-9 each appear twice in the old ledger: once as EXPENSE and once as DISTRIBUTOR_PAYMENT. Amounts 100 + 100 + 100 + 250. New accounting posts each linked payment once. |
| reezc | Primary Bank | +600.00 | Mohammed Irfan payment dated 2026-05-08 has payment_type RETURN. Old ledger deducts 600 from bank; the return has no cash/bank movement in new accounting. |
| ORIGINALS CLOTHING | Cash | -27,440.00 | Three source payments have new journals but no old ledger rows linked to either their payment or expense IDs: BAYMENS 10,500 and 14,940 on 2025-12-10; NOUFAL BHAI 2,000 on 2026-06-28. |
| ORIGINALS CLOTHING | Primary Bank | -249,242.00 | Nine source payments have new journals but no old ledger rows linked to payment/expense IDs; breakdown below. |
| Ubar Mobiles | Both | 0.00 | Projected balances match. |

Other accounts in the comparison match. ERP test postings and their reversals net to zero and do not explain these differences.

## ORIGINALS CLOTHING bank breakdown

| Distributor | Dates | Amounts | Total |
| --- | --- | --- | ---: |
| CB Garments | 2026-04-04 | 16,585 | 16,585 |
| NABEEL | 2026-04-13, 2026-04-23, 2026-07-10 | 9,000 + 15,255 + 4,975 | 29,230 |
| BAYMENS | 2026-04-25 | 25,000 | 25,000 |
| Swadeshi Holdings | 2026-05-13, 2026-05-15 | 35,437 + 112,192 + 3,078 | 150,707 |
| GRAPHAPER APPARELS | 2026-05-26 | 27,720 | 27,720 |
| Total | | | 249,242 |

The last NABEEL source amount is stored as 4974.99999999 and rounds to 4975.00; that precision artifact does not explain the balance difference.

## Patterns and unresolved meaning

- All 12 unmatched ORIGINALS payments have no payment number and dates at midnight. Ten have linked Paid expenses, also without expense numbers. Those expenses have July 15–18 expense_date timestamps, but older created_at/payment dates. This suggests historical/backdated entry through a different workflow; the records do not prove which workflow ran. Of 82 distributor payments in this company, 14 lack payment numbers and 12 lack linked legacy ledger rows, so a missing number alone is not sufficient to classify a record.
- The two BAYMENS cash payments total 25,440 and say `from owner`. Their payment type is CASH, which explains the new Cash deductions. The note does not establish whether store cash or the owner's personal funds paid them. Funding must be established before choosing the correct account.
- CB Garments has a possible duplicate: payment `4266d003-fd17-411c-99df-fff12646ec1a` (no number, linked expense, note `Chaina shirt no bill`, no PO) and payment `7f9102c7-3f5a-4979-aa5c-6532e3e0cc47` (DP-72, PO `f020eec8-c6cf-45a3-9295-7e79962021db`, no expense) are both BANK 16,585 dated 2026-04-04. DP-72 already has an old ledger row. They may be two payments or two representations of one payment; do not automatically add or delete one based only on this match.
- The same-date 9,000 old ledger candidate for NABEEL is an ACCOUNT_TRANSFER with note `NAUFAL CASH DEPOSITED 9000`, not a linked distributor payment. Equal amount/date does not establish equivalence.

## Code evidence

- `sql/account-ledger-backfill.sql` inserts Paid expenses and distributor payments independently, without excluding payments linked to expenses. It also treats every non-CASH payment type as PRIMARY_BANK, including RETURN. These rules reproduce the Markit and reezc patterns; this does not establish when that SQL was executed historically.
- `server/utils/account-ledger.ts`, `distributorPaymentLedgerRows`, also treats non-CASH payment types as PRIMARY_BANK without excluding RETURN.
- The current `server/api/distributor/payments.post.ts` route assigns payment numbers and writes either the linked expense ledger representation or the payment representation. The unnumbered historical records differ from that current route's normal output.

Record-level journal/source IDs are in `cash-bank-difference-trace.json`; `scripts/trace-cash-bank-differences.mjs` reproduces that trace using a read-only database transaction. Additional expense/date and same-amount candidate checks above were read-only queries. No balances, source rows or journals were changed.
