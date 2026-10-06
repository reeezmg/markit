# Historical ERP adoption — 2026-09-29

Applied through 2026-09-29 to Markit, Ubar Mobiles, reezc and ORIGINALS CLOTHING.

| Company | Historical documents processed | Current ERP journals | Non-posting documents | Replaced cash-migration journals |
| --- | ---: | ---: | ---: | ---: |
| Markit | 72 | 62 | 10 | 54 |
| Ubar Mobiles | 318 | 290 | 28 | 287 |
| reezc | 235 | 216 | 19 | 212 |
| ORIGINALS CLOTHING | 1,620 | 1,579 | 41 | 1,532 |
| Total | 2,245 | 2,147 | 98 | 2,085 |

Non-posting documents include inactive/non-bill/zero-value sources and supplier
expenses already represented by distributor accounting. Original source records
were not edited. The 2,085 cash-migration entries were cancelled with audited
reversals, not deleted; full ERP postings replace them without duplicating cash.

One document remains excluded: Markit invoice 13, dated 2025-07-15, total 90.25,
source ID `fc8d698a-5db5-40ce-9666-38538393a5a9`. It says Split / PAID but has an
empty split-payment array and no old cash/bank ledger row. Payment allocation is
awaiting the user's answer. It was explicitly deferred, not silently skipped.

## Verification

- ERP source re-synchronization proposes no changes for imported sources.
- Current ERP journal account/amount lines match their source-derived signatures.
- All distributor source account/amount lines still match.
- No unbalanced published journals.
- Repeat import verification creates no further postings or reversals.
- Cash/Primary Bank match the approved cash-migration baseline plus full ERP history
  movements. Ubar cash changed by -33,572 because invoice 290 has a negative total
  and no old cash-ledger movement. reezc cash changed by -210 for invoice 129, a
  negative-total bill containing a return entry. These follow recorded source totals;
  they are not invented reconciliation adjustments.

## Stock comparison is not an exact match

| Company | Product quantity × current purchase price | Stock ledger | Product value minus ledger |
| --- | ---: | ---: | ---: |
| Markit | 47,280.00 | 14,780.00 | 32,500.00 |
| Ubar Mobiles | 667,936.00 | -36,742.00 | 704,678.00 |
| reezc | 101,225.01 | -20,469.99 | 121,695.00 |
| ORIGINALS CLOTHING | 1,739,184.11 | 745,470.72 | 993,713.39 |

These use different records and valuation bases: current product quantities/prices
versus recorded purchases/returns and sale cost snapshots. Their differences have
not been converted to opening inventory or adjustment journals. Importing source
transactions does not establish that all historic stock acquisitions/adjustments
exist as financial source documents.

Reports: `erp-history-three-import.json`, `erp-history-markit-import.json`, and
`source-accounting-current-verification.json`. Script and production workflow:
`scripts/import-erp-history.mjs`, `scripts/ERP-HISTORY-IMPORT.md`.
