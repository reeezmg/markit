# ORIGINALS CLOTHING stock difference

Read-only trace, 2026-09-29. No source quantities or journals changed.

| Calculation | Product records | Accounting |
| --- | ---: | ---: |
| Starting stock basis | Initial quantities × current purchase prices: 3,253,506.95 | Posted purchase stock: 2,493,925.51 |
| Reduction | Initial minus remaining quantities × price: 1,514,322.84 | Posted sales cost: 1,748,454.79 |
| Remaining value | 1,739,184.11 | 745,470.72 |

The difference is exactly **759,581.44 in the starting stock basis + 234,131.95 in
the stock reduction = 993,713.39**.

## Purchase-side evidence

106 purchase-order records containing 496 item rows have no distributor. Their
initial-quantity value is 1,226,770.00 and remaining value is 677,395.00. Examples:
PO-179 initial product value 75,090; PO-50 67,100; PO-76 48,750. These three headers
have zero total, no payment type and no distributor, and no posted purchase stock.
They represent product stock records without equivalent supplier purchase sources.

The net starting-basis gap also includes offsetting differences. For example,
PO-260 has 39,000 in initial product value / PO total but 156,000 in recorded credit
and posted Stock. The importer preserved recorded credits per the user's prior
instruction. PO-273 has initial product value 42,500 and posted stock 89,250.
Some standalone credits have no PO link; do not infer that every unlinked PO is
financially missing or add it again based only on equal amounts.

## Quantity-side evidence

45 current item rows fail `remaining = initial - net billed quantity`, with a net
value effect of 233,531.97 at current purchase prices. Restocks, resets or other
adjustments could explain some rows, but their cause is not proven by this check.

Examples:

| Barcode | Product / PO | Initial | Net billed | Remaining recorded | Excess over initial less billed | Value effect |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 25A000498 | Shirt / 180 | 60 | 47 | 60 | 47 | 44,650.00 |
| 25A000597 | Pant / 210 | 48 | 41 | 48 | 41 | 21,115.00 |
| 25A000610 | Track Pant / 234 | 30 | 28 | 30 | 28 | 19,844.72 |

Current-price cost of all posted bill entries is 1,748,454.81 versus journal COGS
1,748,454.79: only 0.02 rounding difference. Thus changed valuation rates do not
explain the large gap in this dataset. The reduction gap also includes 600.00 of
sold cost without a matching current item row, less 0.02 rounding.

Neither valuation alone proves the physical stock on hand. Fixing the difference
requires establishing genuine starting inventory and stock movements, while avoiding
duplicate standalone supplier credits. No balancing adjustment was fabricated.

Record-level data: `originals-stock-difference-trace.json`.
