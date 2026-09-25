## Reports Pages

All reports use custom API routes (no ZenStack direct queries). Dates default to today (start/end of day). All pages share a `UDateRangePicker` for filtering.

### Precedence filter — all report APIs
All report and ledger APIs listed below read `cleanup` from `useAuthSession(event).data.cleanup`. When `cleanup = false` (normal users), soft-deleted bills (`precedence IS NOT TRUE`) are excluded from all aggregations and bill lists. When `cleanup = true` (cleanup admin), most report APIs include all bills regardless of `precedence`. Daily report APIs additionally accept a cleanup-only `showCleanedValues=true` query flag that switches cleanup admins back to current cleaned values and excludes `precedence=true` rows. The SQL pattern used is: `AND ($N = true OR b.precedence IS NOT TRUE)`.

Bill-query APIs that implement this filter include `report/profit.get.ts`, `report/online.get.ts`, `report/onlinebills.get.ts`, `report/account.get.ts`, `report/generate-sales.pdf.get.ts`, `report/report.get.ts`, and `billSale/findManyBills.post.ts`. `accounts/cashledger.get.ts` and `accounts/primaryledger.get.ts` read persisted ledger rows through `accountLedgerRowsForApi`; they do not apply a bill `precedence` filter during ledger reads.

For daily sales reports and sales exports, cleanup admins see preserved cleanup originals where available while the page toggle is off: `bills.original_grand_total` for bill totals, `bills.original_subtotal` for export bill subtotals, and `entries.original_value` for entry/category/brand revenue. When an original value is missing or `0`, report SQL falls back to the current visible value. Turning `Cleaned values` on passes `showCleanedValues=true`, uses current bill/entry values, and filters out `precedence=true` rows.

---

### `pages/reports/daily.vue` — Daily Report
**API:** `GET /api/report/report` with `{ companyId, startDate, endDate }`

When the logged-in session has `cleanup = true`, the page renders a cleanup-only `Cleaned values` toggle. Off uses original cleanup values for sales totals and entry revenue where available and includes `precedence=true` bills. On passes `showCleanedValues=true` to `/api/report/report`, `/api/report/generate-sales.pdf`, and `/api/report/generate-sales.excel`, which use current bill/entry values and exclude `precedence=true` bills. Normal users continue to see current visible bill and entry values and never render the toggle.

**KPI cards:**
- Revenue (total sales)
- Expense (paid expenses + paid salary payments)
- Purchase (total purchases)
- Selected Period Balance (cash + bank + credit movement within the selected date range)

Daily no longer renders an opening balance card. The balance card shows selected-period movement only (`ledger closing - ledger opening`) for Cash, Bank, and Credit, using the lightweight shared `accountLedgerBalancesForApi` helper over `account_ledger_entries` (`CASH`, `PRIMARY_BANK`, and `CREDIT`) without fetching ledger rows. This period movement includes money given/taken, salary/payment rows, transfers, sales, purchases, expenses, and credit ledger movement inside the selected range.

**Tables:**
- Category sales breakdown (name, qty, revenue columns)
- Salary Given table (date, staff, payment mode, amount) rendered above transfers/transactions
- Transfers list
- Transactions breakdown (payment method breakdown)

**Export options:**
- PDF: `GET /api/report/generate-sales.pdf` → downloads blob
- Excel: `GET /api/report/generate-sales.excel` → downloads workbook blob
- Print: `usePrint()` composable

Daily report PDF/Excel/print exports include salary given details. PDF/Excel also add salary given into the expense total while cash/bank movement continues to flow through linked `money_transactions` rows.

**Pull-to-refresh:** `pulltorefreshjs` library — `PullToRefresh.init()` in `onMounted`, `destroy()` in `onUnmounted`

---

### `pages/reports/profit.vue` — Profit Report
**API:** `GET /api/report/profit` with `{ companyId, startDate, endDate }`

**Summary cards:** Sales, COGS (Cost of Goods Sold), Gross Profit, Expenses, Net Profit. Paid salary payments are included in the expense total.

**Tables:**
- Bill table — each row expandable to show per-entry breakdown with COGS columns
- Category profit table — revenue, COGS, profit per category

**Chart:** `CategoryRevenuePie` component

**Export:** PDF via `GET /api/report/generate-profit.pdf` → blob download

---

### `pages/reports/accounts.vue` — Accounts / Financial Report
**API:** `GET /api/report/account` with `{ companyId, startDate, endDate }`

**Balance cards:** Cash balance, Bank balance, Investment balance

**P&L section:** Total Sales, Total Expenses, Total Purchases (from report). Total Expenses includes paid salary payments; cash/bank balances still move through linked `money_transactions` rows.

**Breakdown tables:**
- Cash flow: opening → each transaction → closing
- Bank flow: opening → each transaction → closing

**Charts:** Three pie charts — `cashFlowPie`, `bankFlowPie`, `pnlPie`

**Computed `businessWorth`:** sum of cash + bank + investment balances

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

**GSTR-1 (outward):** sources `bills + entries`, filtered to `b.deleted=false`, `b.payment_status IN (PAID,PENDING)`, `b.is_markit=false`. Returns kpi + rate-wise + HSN summary.

---

## Dashboard

### `pages/dashboard/index.vue` — Main Dashboard
Store overview page. It calls `useCompanyDashboard()` for revenue, expenses, sales/stock data and refresh, computes displayed profit as revenue minus expenses, and renders KPI cards, charts and recent activity directly in this page. The header links to daily reports and new POS billing. It is not the old thin wrapper that only rendered `DashboardCards` and separate chart components.

---

### `pages/reports/summary.vue` â€” Business Summary
**API:** `GET /api/report/summary` with `{ from, to }` and `GET /api/report/generate-summary.pdf` for the PDF export.

**Layout:** full-height `min-h-screen` slate background so the page background fills the viewport.

**KPI cards:** Opening Balance, Total Sales, Tax Collected, Net Profit, Total Expense, Closing Balance.
- Tax card is labeled `Tax Collected` and uses `summary.sales.tax` from the summary API.
- Net Profit and the Total Expense headline use `summary.profit`, whose expense total includes paid salary payments. Cash-flow sections continue to use `money_transactions`, so salary is not double-counted in cash movement.

**Sales breakdown:** payment-method table plus top-category table.

**Distributors section:** PDF export now renders `We Owe` and `Owed To Us` as two aligned side-by-side lists with their totals above the tables.

**Pending Credit Bills card:**
- Shows a compact summary strip at the top with the open bill count and the total pending amount before the table rows.
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
