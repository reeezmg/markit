# Accounting workflow verification — 2026-09-29

Passed against PostgreSQL using isolated schemas or rollback-only fixtures. The
API harness invokes real handlers and company middleware with test authentication;
it flushes deferred accounting triggers at each simulated commit. It is not a
Playwright/browser-login test.

## Passed suites

- `npm run test:erp-accounting`: sales/tax/COGS, cost snapshots, credit and split
  payments, returns, edits, delete/restore, expense tax recovery, paid/unpaid status,
  client/staff attribution, supplier-expense deduplication, locks and company isolation.
- `npm run test:erp-accounting:api`: real billing and expense create/edit/delete
  handlers, duplicate retry rejection, invalid tax rejection and zero net movement
  after deletion.
- `npm run test:distributor-accounting`: historical import, tax, returns,
  edit/delete reversals, repeat synchronization, account selection and company isolation.
- `npm run test:products-distributor-accounting:api`: product + credit purchase;
  purchase-cost edit; cash settlement; rejected unsafe PO payment rewrite; settlement
  edit to bank; settlement reversal; purchase return create/edit/delete with physical
  quantity assertions; linked payment create/edit/delete without duplicate ERP expense;
  supplier receipt create/edit/delete; sale of purchased stock and quantity edit with
  COGS assertions; sale deletion; purchased product deletion; catalogue-only CRUD;
  bank-paid batch purchase; PO cascade deletion. Every generated journal balances.
- `npx tsx tests/distributor-accounting-pages.test.ts`: relevant ERP/product/distributor
  Vue templates compile; account selectors render; product-list delete route regression.

## Fixed

Products list deletion previously used the generic model delete and bypassed PO
recalculation. It now calls `/api/products/delete` with the selected row's company,
uses server media cleanup, invalidates affected caches and refreshes the list.
That endpoint's accounting and quantity effects are covered by the API suite.

## Existing-data verification

`scripts/verify-erp-accounting.mjs` checked eight active ERP sources across four
enabled companies: zero synchronization changes and zero unbalanced ERP journals.
The read-only check in `accounting-crud-verification.json` found no unbalanced
ERP/distributor journals and no distributor payable differences against the current
accounting source projection. This does not assert equality with legacy due figures.

Test products, purchases, bills, payments, returns, counters and journals were rolled
back; temporary test schemas were removed. No fixture images or external messages
were used. Browser interaction, login and visual refresh were not exercised.


## Stock control validation ? 2026-09-29

- `npm run test:stock-accounting`: passed isolated PostgreSQL opening, no-PO quantity
  and cost changes, linked PO/native sale deduplication, deletes, negative stock,
  company isolation, locked-period rollback, double-entry balance and repeat no-op.
- `npm run test:products-distributor-accounting:api`: passed with stock control
  enabled inside the rollback-only fixture transaction. Covers native deferred
  purchase/return/sale posting alongside source inventory mutations.
- `npx tsx tests/accountant-v2-pages.test.ts`: passed Vue template compilation/render.
- `npx prisma validate` and `node scripts/check-db-meta.mjs`: passed.
- `node scripts/reconcile-stock-accounting.mjs --all-connected --apply`: committed
  one opening Stock/Opening Inventory journal per company. Subsequent preview
  produced zero additional journals, zero account differences.
- Independent read-only source verification: all four stock balances match source;
  no ERP/distributor line mismatches and no unbalanced published journals.
  See `stock-accounting-import.json` and `source-accounting-current-verification.json`.

Valuation is remaining quantity ? current variant purchase price, effective at the
reconciliation date. It does not reconstruct historical FIFO or past stock balances.

Broader validation limitations: Accountant TypeScript check reports TS2347 in
`server/utils/accountant/accounts.ts:152` and `erp.ts:17`, and TS2353 for `paidAmount`
in `server/utils/distributorPayment.middleware.ts:40`, outside this stock change.
ZenStack wrote and validated `prisma/schema.prisma`, but client regeneration hit a
Windows lock on `query_engine-windows.dll.node` (EPERM). Stock control uses SQL and
requires no new Prisma delegate at runtime. Regenerate normally after releasing the
dev server's engine lock before using the new Prisma model directly. Browser login
and interactive UI navigation were not tested.


## Salary and staff credit connection ? new activity only

`test:user-accounting` passes real PostgreSQL salary accrual/edit/deletion (including
negative net pay), actual payout vs embedded credit cut, credit/repayment, non-cash
payroll deduction, bill-source deduplication, named bank selection, cross-company
rejection, date locks, reversible edits, immutable employee attribution and no-op
repeats. It also verifies historical source exclusions across recreated ledger IDs,
additional deductions on an older cumulative payroll cut, and the real staff ledger
read API with company-scoped journal links.

`test:user-accounting:api` exercises the real salary and credit API handlers against
installed triggers with fixture writes rolled back. It covers payout/credit/repayment
CRUD, mixed payroll cash plus credit settlements, multiple payouts, editing and
deleting an embedded-credit payout, and payroll-cycle deletion restoring both source
and accounting balances. User-ledger rows expose account lines and journal IDs.

Salary safety tests, Accountant Vue render tests, affected Users Vue compilation,
Prisma schema validation, database-catalog checks and the ERP accounting regression
suite passed. Broader Accountant type checking still reports the pre-existing errors
listed above. Prisma's native engine was locked during regeneration; its updated
client schema was checked, then enhancer/policy/Zod artifacts were regenerated using
that client without replacing the loaded engine. No browser session was exercised.

Enabled new-only staff posting for the four existing ERP companies. Read-only checks
showed no staff journal imports, no line mismatches and no repeat changes. The
production runner now includes staff setup without a historical payroll import.


## Reports verification ? 2026-09-30

- `tests/report-accounting.integration.test.ts`: rollback-isolated fixtures verify accrual sale, settlement without duplicate income, COGS, unpaid expense, multiple banks, internal transfers, reversals, draft/deleted exclusion, exchange rates, date boundaries, company/currency isolation and linked bill detail.
- `tests/report-gst-source.test.ts`: inclusive invoice discounts, signed returns, zero-rate items, one invoice total across multiple entries, and missing tax detail.
- `tests/report-pages.integration.test.ts`: repeatable-read, read-only database transaction across all four connected companies; Accounts/Profit/Daily/Summary shared totals agree and balance-sheet difference is zero. GST/Daily Excel and Profit/Daily/Summary PDF exports generate successfully.
- All seven report pages and both shared report components compile with Vue compiler-sfc. No browser interaction coverage is claimed. These tests confirm posted accounting consistency, not completeness of unposted source history or statutory GST eligibility.


## Report query refactor ? 2026-09-30

Before/after full JSON report snapshots agree across the four companies. Daily report data queries: 18 to 3; Summary: 14 to 4; Accounts: 4 to 1; Profit: 5 to 2; Online: 3 to 1; GST-1: 6 to 2; GST-2B: 8 to 2; GST-3B: 7 to 3. Counts exclude authorization. Daily PDF/Excel share one loader and each require three data queries. Query-budget assertions are now permanent regression checks. Added read-only checks for cleanup/original and cleaned modes, empty dates, invalid-date rejection, and Excel cash/bank movement matching the API. No production data changes or history imports are involved.


## Transfer history adoption ? 2026-09-30

Isolated transfer-history integration verifies complete replacement journals, named-bank
legs, preserved investment clearing, source change/delete rejection, foreign mappings,
repeat no-op, and read-only verification. Accountant router integration verifies imported
transfer listing and edit/delete rejection while native transfers retain CRUD behavior.
The real-database preview found 161 source transfers, all in ORIGINALS CLOTHING. It
created 161 new transfer records in a rolled-back transaction and checked a second run.
Projected movement: RAFEEQ +44,500; SOCIETY BANK +46,000; migration clearing -90,500.
Cash and Primary Bank remain unchanged.


Applied the transfer adoption through 2026-09-30: 161 transfer records and their
replacement journals committed. The repeat check inside the transaction added nothing.
A separate post-commit call to the real Account Transfers router returned all 161
imported rows; each source reference, date, amount and note matched, both accounts
resolved, and the company had zero unbalanced posted journals. Confirmed balance
changes match the preview; Cash and Primary Bank did not change.
