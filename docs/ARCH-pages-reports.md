## Reports Pages

All reports use custom API routes (no ZenStack direct queries). Dates default to today (start/end of day). All pages share a `UDateRangePicker` for filtering.

### Accounting basis (verified 2026-09-30)

`server/utils/report-accounting.ts` is the shared financial reader for Accounts, Profit, Daily, Summary and their financial exports. It reads published, non-deleted `accountant_v2_manual_journals` / lines, including reversal entries and historical lines on inactive accounts. Amounts use each journal's exchange rate, rounded per line. Opening is before the start instant; activity is inside the selected inclusive range. ISO SQL parameters preserve timestamp boundaries. Explicit company scope is required; combined reports reject different base currencies.

Financial totals include all CASH/BANK accounts, receivables, payables, stock, accrual income/expenses and COGS. Receiving an outstanding invoice does not record sales again. Cash/bank transfers cancel from combined money movement. The balance sheet includes retained income/expense balances. `accountingMoneyActivity` supplies standalone Receive/Pay and transfer detail, including imported transaction links and reversals. It also returns separate cash/bank investment movements from published INVESTOR, LEGACY_INVESTOR and INVESTOR_REVERSAL journals, using reversal-parent classification where present; these do not enter standalone Receive/Pay totals.

Financial reports cover posted history only. They do not import missing source history on read. `components/Reports/Basis.vue` identifies accounting, source or mixed basis on all seven report pages. Operational bill/item, stock quantity, payroll and online-sales detail remains source-based. Do not add those source totals to posted financial totals.

`npm run test:reports` includes older fixtures that create database schemas and must not be run under the current no-schema-change policy. Safe verification uses `npx tsc -p tests/tsconfig.reports.json`, `npm run test:bill-receipts:readonly`, and `npx tsx tests/report-pages.integration.test.ts` (read-only API/export checks). The API checks compare Accounts, Profit, Daily and Summary and generate GST/Daily Excel and Profit/Daily/Summary PDF files in memory.

### Report query structure and performance (2026-09-30)

`server/utils/report-query.ts` batches authored SELECT sections with shared bound parameters into a single statement. It returns JSON rows; public loaders normalize amounts and dates. There is no cross-request result cache. Company authorization remains in each route before the loader runs.

`report-accounting.ts` retrieves company/currency, account balances, money flow and daily P&L in one statement. Tax comparisons use a targeted tax-role/posted-line query instead of calculating the entire financial report. `report-daily.ts` owns Daily data and the common PDF/Excel export loader; paid expense, salary and purchase-payment queries are shared. Rendering no longer holds a database connection. Obsolete company-opening calculations, legacy transfer/transaction reads and GET-time schema alterations are removed; cleanup original-value columns belong to the schema.

`reportSummary.ts` batches its source sections, uses one filtered bill set for sales/payment totals, and does not run the superseded source-tax calculation. Its financial, money and outward-tax readers run alongside the source batch. Online totals/categories/count run in one statement. GSTR-2B reads distributor names with the source rows rather than making a separate name-lookup request.

Measured report-data SQL statements per request (authorization queries excluded):

| Report | Before | After |
|---|---:|---:|
| Accounts | 4 | 1 |
| Profit | 5 | 2 |
| Daily | 18 | 3 |
| Summary | 14 | 4 |
| Online | 3 | 1 |
| GSTR-1 | 6 | 2 |
| GSTR-2B | 8 | 2 |
| GSTR-3B | 7 | 3 |

Daily PDF and Excel each use four report-data queries: the same three-query daily loader plus one batched invoice/expense detail query. These are round-trip reductions, not fixed latency guarantees. The report integration suite enforces query budgets, checks export amounts, exercises empty ranges and both cleanup modes in a read-only transaction, and can compare captured full JSON responses using `REPORT_BASELINE=write` / `REPORT_BASELINE=check`. Optional baselines are local `.cache/report-baseline.json` files; run against unchanged data when comparing. Financial helper type checking is part of `npm run test:reports`.

### Precedence filter — all report APIs
Source report APIs listed below read `cleanup` from `useAuthSession(event).data.cleanup`. When `cleanup = false` (normal users), soft-deleted bills (`precedence IS NOT TRUE`) are excluded from all aggregations and bill lists. When `cleanup = true` (cleanup admin), most report APIs include all bills regardless of `precedence`. Daily report APIs additionally accept a cleanup-only `showCleanedValues=true` query flag that switches cleanup admins back to current cleaned values and excludes `precedence=true` rows. The SQL pattern used is: `AND ($N = true OR b.precedence IS NOT TRUE)`.

Bill-query APIs that implement this filter include `report-profit.ts` bill detail, `report/online.get.ts`, `report/onlinebills.get.ts`, `report/generate-sales.pdf.get.ts`, `report/report.get.ts`, and `billSale/findManyBills.post.ts`. `accounts/cashledger.get.ts` and `accounts/primaryledger.get.ts` read persisted ledger rows through `accountLedgerRowsForApi`; they do not apply a bill `precedence` filter during ledger reads.

For daily sales reports and sales exports, cleanup admins see preserved cleanup originals where available while the page toggle is off: `bills.original_grand_total` for bill totals, `bills.original_subtotal` for export bill subtotals, and `entries.original_value` for entry/category/brand revenue. When an original value is missing or `0`, report SQL falls back to the current visible value. Turning `Cleaned values` on passes `showCleanedValues=true`, uses current bill/entry values, and filters out `precedence=true` rows.

---

### `pages/reports/daily.vue` — Daily Report
**API:** `GET /api/report/report` with `{ companyId, startDate, endDate }`

When the logged-in session has `cleanup = true`, the page renders a cleanup-only `Cleaned values` toggle. Off uses original cleanup values for sales totals and entry revenue where available and includes `precedence=true` bills. On passes `showCleanedValues=true` to `/api/report/report`, `/api/report/generate-sales.pdf`, and `/api/report/generate-sales.excel`, which use current bill/entry values and exclude `precedence=true` bills. Normal users continue to see current visible bill and entry values and never render the toggle.

**Layout order:** Four summary cards in one desktop row (two columns on small screens, stacked on mobile): Sales, Expense, Other transactions, Final balance. Sales includes credit and shows collections as a compact note. Expense excludes salary on this screen; salary is counted once under Other transactions, alongside credit repayments, purchase payments, transfers in/out, standalone Receive/Pay and Investments in/out. Other transactions and Final balance show only Payment method and Amount. Other transactions groups Cash and Bank; Final balance lists Cash and each bank by its actual account name, with a link to its ledger. Other transactions combines credit repayments, salary, purchases, transfers, Receive/Pay and investments into net cash/bank movement; UPI/Card/Cheque are grouped under Bank, while internal transfers cancel across the two rows. Receipt repayment methods are returned separately as `creditCollectionsByPaymentMethod` so paid invoice portions are not counted again. Final balance shows posted net cash/bank movement within the selected dates (`balances.total.delta`, cash `delta`, and each bank account `movement`), excluding opening balances. Opening/closing/dues rows are omitted from this card. Source activity cards are not a reconciliation formula for posted balances. Transaction details is collapsed below the cards and includes salary entries, purchase-payment methods, transfers, Receive/Pay, investments, credit repayments and collections in explicit desktop rows: Purchase payments / Salary payments / Investments; Credit repayments / Collections; Account transfers / Receive/Pay. Each row stacks on mobile. Receive/Pay and investment details list each cash/bank account separately using `transactionsDisplay` and `investmentsDisplay`; the money-activity query returns these alongside existing totals. Summary cards use 8px gaps and 12px body padding. Tables allocate column widths from content, wrap labels, and use 8px vertical/6px horizontal cell padding; amounts stay intact on one line. Scrolling uses overflow-auto only after the minimum readable content exceeds the available width. The per-account fund movement table and category/brand sales follow.

`report-bill-sales.ts` defines invoice-date sales and collection-date money separately. Sales totals include PAID and PENDING non-Markit bills and the full original Credit portions of Split bills. Pending credit bills also appear in category/brand sales. Sales-by-method represents original invoice tender, not current dues; paying the bill does not move old Credit sales into Cash/UPI.

Collections combine paid Cash/UPI/Card/Bank/Cheque invoice portions (including paid portions of a pending credit split) on invoice date with dated `ERP_CREDIT_RECEIPT` journal amounts. `ERP_CREDIT_RECEIPT_REVERSAL` amounts reduce collections on reversal date; reversing a receipt does not erase its earlier collection. `totalCollections`, `creditCollections` (net repayments only), and `collectionsByPaymentMethod` expose this separately. Receipt collections never increase sales. Source cleanup visibility applies to linked bills.

Screen, PDF and Excel share the daily loader and the same sales/collection definitions. Invoice detail exports include pending credit invoices. Invoice totals include tax; posted P&L sales exclude output tax. The fund table reads all published journals, including receipts and reversals, once. It excludes receivables; closing customer dues appear separately from available funds. The daily screen no longer has a Sales minus expenses card.

`components/Reports/DailyTable.vue` supplies numeric alignment, signed amounts, sticky headings and contained scrolling. Date presets, loading/error/retry states, explicit refresh and stale-request cancellation remain. Optional `from`/`to` query dates initialize the range.

Investment verification: `npx tsx --tsconfig tests/tsconfig.credit-receipts.json tests/report-investments.readonly.test.ts` executes the production money-activity SQL against SELECT-only CTE fixtures in a read-only transaction, covering native/imported entries, reversals, cash/bank-only movement, date/company/draft filters and Receive/Pay separation.

**Export options:**
- PDF: `GET /api/report/generate-sales.pdf` → downloads blob
- Excel: `GET /api/report/generate-sales.excel` → downloads workbook blob
- Print: `usePrint()` composable

Daily report PDF/Excel/print exports include opening, movement and closing cash/bank totals; PDF/Excel also list individual cash/bank accounts and separate customer dues. Excel preserves the period-movement Summary rows and adds a Cash and bank position sheet. PDF/Excel include salary given details and a separate Investments cash/bank in/out/net section next to Receive/Pay. PDF/Excel also add salary given into the expense total while cash/bank movement comes from posted journals.



---

### `pages/reports/profit.vue` — Profit Report
**API:** `GET /api/report/profit` with `{ companyId, startDate, endDate }`

**Summary cards:** Posted sales income excluding tax, COGS, gross profit, other income, expenses and net profit. Salary expense contributes when posted, not merely when paid.

`server/utils/report-profit.ts` adds source bill/category detail for linked posted ERP journals. Invoice income is allocated over signed, tax-exclusive source item weights; COGS uses saved posting costs, with residual cents reconciled to journal totals. Manual or other income postings can contribute to headline totals without appearing in bill detail. The PDF uses the shared accounting headline. The page supports authorized table company scope.

**Tables:**
- Bill table — each row expandable to show per-entry breakdown with COGS columns
- Category profit table — revenue, COGS, profit per category

**Chart:** `CategoryRevenuePie` component

**Export:** PDF via `GET /api/report/generate-profit.pdf` → blob download

---

### `pages/reports/accounts.vue` — Accounts / Financial Report
**API:** `GET /api/report/account` with `{ companyId, startDate, endDate }`

**Balance cards:** Cash, all banks, receivables, payables, stock and net assets.

**Sections:** Posted P&L, combined cash/bank opening/receipts/payments/closing, and account opening/debit/credit/closing balances with Dr/Cr signs. Account links open Chart of Accounts with `entryCompany` and `account` query selections. The page supports authorized table company scope. Net assets is assets minus liabilities, not a sum of cash, investment and profit.

---

### `pages/reports/online.vue` — Online (Markit) Sales Report
**API:** `GET /api/report/online` with `{ companyId, startDate, endDate }` — returns only bills originating from the Markit marketplace

**KPI cards:** Revenue, Cash Received, Bill Count, Commission (rate × revenue pulled from auth session `commissionRate`)

**Tables:** Category sales breakdown + category revenue pie chart

**Export options:**
- CSV: client-side `exportToCSV()` (no server needed)
- PDF: client-side `generateSalesReportPDF()` using jsPDF/autoTable
- Print: `usePrint()` composable

**Pull-to-refresh:** same `pulltorefreshjs` pattern as sales.vue

**Bugs:** Multiple `console.log(res)` after data fetch — logs full API response

---

### `pages/reports/users.vue` — Users / Staff Activity Report
**Data source:** `GET /api/user/report` with `{ startDate, endDate }`

**Components:** `UsersReportTable` + `UsersReportChart`

**Expanded row rendering (`UsersReportTable`):**
- Return entries are rendered in red for category/rate/qty/value cells
- Category is normalized to a flat `categoryName` field for the expanded table
- Staff rows render Code, Count, Sales, Commission, Salary earned, Salary paid, Present, Absent, and Half-day counts.
- Sales still use the shared net-sales calculation from `server/utils/user-sales.ts`.
- Commission/salary earned are summed from `payroll_cycle_lines` whose cycle period is fully inside the selected range. Salary paid is summed from `salary_payments.payment_date` inside the selected range. Attendance counts come from payroll line present/absent/half-day totals when available, otherwise from `attendances.status` rows in the selected range.

**Date range:** defaults to today; `finalStart` / `finalEnd` computed from picker

**Bugs:** none currently documented for this page.

---

### `pages/reports/gst.vue` — GST Returns (GSTR-1 / GSTR-3B / GSTR-2B)
Tabbed page: client is a thin wrapper that lazy-fetches each report via `$fetch` per tab and offers an Excel download button.

**Endpoints:** `/api/report/gstr1`, `/api/report/gstr3b`, `/api/report/gstr2b` (+ matching `generate-gstr*.excel`).

**ITC sources (GSTR-2B + GSTR-3B Table 4):**
- Pulled from `distributor_credits` where `money_transaction_id IS NULL` — i.e. **product credits only**. AMOUNT-type DistributorCredits (cash inflows from distributor) are excluded.
- PO-linked credits → joined to `purchase_orders → products → variants → items` for per-item tax breakdown: `taxable_value = i.initial_qty * v.p_price`, `tax_amount = taxable_value * v.tax / 100`. Rate buckets group by `v.tax`.
- Manual product credits (no PO):
  - **GSTR-2B:** included as flat 0%-tax taxable rows (so the totals reflect them).
  - **GSTR-3B Table 4:** excluded (the SQL keeps the legacy `v.tax > 0` filter — zero-rated items don't generate ITC).
- Aggregation done in JS (TypeScript Maps for rate / distributor buckets), so the same logic powers both the JSON response and the Excel sheets.

**Outward calculation:** `server/utils/report-gst-source.ts` supplies GSTR-1, GSTR-3B outward values and Summary source tax. It allocates each inclusive invoice total once across signed entries, extracts included tax after discounts, and includes returns and zero-rated rows. Unallocatable invoice values are reported explicitly. Existing equal CGST/SGST presentation is retained.

`Reports/TaxComparison.vue` compares source tax with posted mapped tax-account movements. Input comparisons include recoverable expense postings and adjustments; they do not establish tax-recovery eligibility. Inward purchase tax retains the legacy calculation described above, including its reliance on product/variant data. `report-gst-excel.ts` exports the same JSON data and comparison instead of duplicating queries. Changing the date range invalidates all three tab caches.

**GSTR-1 (outward):** sources `bills + entries`, filtered to `b.deleted=false`, `b.payment_status IN (PAID,PENDING)`, `b.is_markit=false`. Returns kpi + rate-wise + HSN summary.

---

## Dashboard

### `pages/dashboard/index.vue` — Main Dashboard
Store overview page. It calls `useCompanyDashboard()` for revenue, expenses, sales/stock data and refresh, computes displayed profit as revenue minus expenses, and renders KPI cards, charts and recent activity directly in this page. The header links to daily reports and new POS billing. It is not the old thin wrapper that only rendered `DashboardCards` and separate chart components.

---

### `pages/reports/summary.vue` â€” Business Summary
**API:** `GET /api/report/summary` with `{ from, to }` and `GET /api/report/generate-summary.pdf` for the PDF export.

**Layout:** full-height `min-h-screen` slate background so the page background fills the viewport.

**KPI cards:** Opening Balance, Total Sales, Invoice tax, Net Profit, Total Expense, Closing Balance.
- Tax card is labeled `Invoice tax` and uses `summary.sales.tax` from the summary API.
- Net Profit and Total Expense use posted accrual P&L. Opening/closing balances and cash-flow receipts/payments use the shared financial reader; standalone transaction detail uses `accountingMoneyActivity`.
- Supplier dues use posted distributor-linked payable lines through the selected end date. Sales/payment/category, pending bill, investment and current stock detail retain source data.
- Trend and forecast use posted daily financial activity, with zero-activity calendar days included. Forecast is a simple trend estimate, not a reconciled balance.

**Sales breakdown:** payment-method table plus top-category table.

**Distributors section:** PDF export now renders `We Owe` and `Owed To Us` as two aligned side-by-side lists with their totals above the tables.

**Pending Credit Bills card:**
- Shows a compact summary strip with the open bill count and current pending amount. Credit and Split-with-credit bills subtract active receipt amounts; original paid split portions are excluded.
- Table columns: Invoice #, Date, Client, Phone, Amount.

**PDF export:** mirrors the page wording and includes a `Pending Credit Bills` section with open count + total pending amount.

---

## Client and staff pages

The maintained client/CRM guide is `ARCH-pages-client.md`; staff, attendance and payroll are in `ARCH-pages-users.md`. These domains are not part of the reports page guide.

## Sales History Pages

### `pages/saleshistory/index.vue` — Sales History / Audit Trail
**Data model:** Bills that have at least one `BillHistory` record — `useFindManyBill({ where: { billHistories: { some: {} } } })`
- Includes deleted bills (history preserved even after deletion)
- **Soft-deleted bill filtering:** when `cleanup = false` (session), adds `{ precedence: { not: true } }` to the `AND` filter — excludes soft-deleted bills from the list. When `cleanup = true`, no filter added (all bills visible including soft-deleted).
- `include: { billHistories: ... }` — when `cleanup = false`, history records filtered to `{ where: { precedence: { not: true } } }`; when `cleanup = true`, `billHistories: true` (all records).
- **Soft-deleted row highlighting:** `styledBills` computed adds `class: 'bg-red-50 text-red-600'` when `row.precedence === true`; `:rows` is bound to `styledBills`.

**BillHistory records:** Each `BillHistory` has:
- `data` — JSON snapshot of bill state at time of operation
- `operation` — type of operation (`CREATE`, `UPDATE`, `DELETE`)
- `createdAt` — when the history was recorded

**Expandable rows:** clicking a bill row expands to show its `billHistories` list with operation type + timestamp + JSON preview

**Restore deleted bill:** `restoreBill(billId)` calls `POST /api/billSale/restoreBill`; it does not use the old `UpdateBill({ deleted: false })` mutation.

**Filter:** by `updatedAt` date range (not `createdAt` — filters when the bill was last modified)

**Default sort:** `updatedAt` descending — most recently changed bills first

---

## Notification Pages

### `pages/notifications.vue` — Notification Center
**Data source:** `useNotifications()` composable — returns `notifications` (array), `markAllAsRead()`, `markAsRead(id)`, `unreadCount`

**Tabs:** Unread / All
- Switching to Unread tab: `watchEffect` auto-calls `markAllAsRead()` (marks all as read when the tab is viewed)

**Per-notification rendering:**
- Icon + title + body + relative timestamp (`formatRelativeTime()`)
- Action button via `getAction(notification)` — returns route/label based on notification `type` field (e.g., new order → `/order/trynbuy`, new booking → `/order/bookings`)

**Unread badge:** shown in navbar via `unreadCount` from composable

---
