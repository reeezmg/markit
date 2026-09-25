## Users / Staff Pages

### Users (`/users`)

**Files:**
- `pages/users/index.vue` — split user management view (table/list + detail tabs)
- `components/users/UsersForm.vue` — basic form stub (not used in main flow; inline form in index.vue is used instead)
- `components/users/ReportTable.vue` — user performance report table with expandable entry rows
- `components/users/ReportChart.vue` — user performance chart
- `server/api/user/report.get.ts` — user report API
- `server/api/getuser.get.ts` — lightweight user list API (used by userStore)
- `stores/user.ts` — Pinia store for global user list

**ZenStack hooks used:**
`useFindManyCompanyUser`, `useCountCompanyUser`, `useFindUniqueUser`, `useCreateUser`, `useUpdateUser`, `useUpdateCompanyUser`, `useFindManyEntry`, `useCountEntry`, `useFindManyExpense`, `useCountExpense`, `useFindManyExpenseCategory`

**Tables touched:** `company_users`, `users`, `entries` (for sales detail), `expenses` (for expense detail)

---

#### User Management (`index.vue`)
- Lists `CompanyUser` records scoped to `session.companyId`, filtered by name search + status, paginated; related `User.cleanup = true` accounts are excluded from the table/count
- **Left panel behavior:** pre-selection shows table layout; after selecting a user, left panel switches to WhatsApp-style compact list rows (`name` on top, smaller `ROLE - code` below)
- **Layout:** two-pane bordered layout (`left user panel + right detail panel`) with responsive width change when a user is selected
- **Table columns:** `Name`, `Email`, `Phone`, `Code`, `Role`, `Status`, `Actions`
- **Add user:** checks if email already exists via `useFindUniqueUser`
  - Existing user → creates new `CompanyUser` (user joins this company, no new `User` created)
  - New user → creates `User` with password = `hash(email)` as default + `CompanyUser`
- **Edit:** updates `CompanyUser.name`, `CompanyUser.role`, and optional `CompanyUser.phone`
- **Delete:** soft delete — sets `deleted: true, status: false` on `CompanyUser`. Safety: cannot delete last admin. If deleting self → calls `authLogout()`
- **Toggle status:** flips `CompanyUser.status` individually via `useUpdateCompanyUser`
- **Per-row actions:** edit/delete via dropdown in both table mode and compact list mode
- **Detail panel tabs:** `Sales` and `Expenses` rendered in `UCard` blocks with filter header, table body, and footer pagination
- **Sales tab:** `useFindManyEntry` + `useCountEntry` filtered by `companyUser.userId` + `bill.createdAt` date range + optional search (name/category). Includes `category.name` and `bill.discount`/`paymentMethod`/`paymentStatus`. Columns: Category, Product, Rate, Qty, Value
- **Expenses tab:** `useFindManyExpense` + `useCountExpense` filtered by `userId` + date range + optional search + status/category filters. Uses `useFindManyExpenseCategory` for filter dropdown. Columns: Date, Category, Note, Payment, Amount, Status

**Roles:** `admin | manager | biller | accountant | user`

**Add user flow:**
1. Enter email → `checkEmailExist(email)` → if exists, link to company via `CreateCompanyUser` with existing userId
2. If new: `CreateUser({ email, name, password: hash(email) })` then `CreateCompanyUser`
3. Password defaults to hashed email for new users

4. Modal also accepts optional phone number and stores it on `CompanyUser.phone`

**Delete (soft delete):** `UpdateCompanyUser({ deleted: true, status: false })`
- **Admin safety check:** counts active admins — blocks delete if this is the last admin
- If deleting self → calls `authLogout()` after delete

**Role change:** `UpdateCompanyUser({ role: newRole })` — also triggers `updateSession()` to reflect new role in session

---

#### `GET /api/getuser` — Global User List
- Fetches all non-cleanup `CompanyUser` rows for a `companyId` with `user.email` and `user.image` (`user.cleanup = false`)
- Returns: `[{ id, code, name, email, image }]`
- Used by `userStore` to maintain a persisted global user list for quick lookups (e.g. who made a bill)
- **Security note: No auth check on this route** — accepts any `companyId` via query param

---

#### `GET /api/user/report` — User Performance Report
- Authenticated (requires `session.companyId`)
- Fetches `entries` with optional date range filter (via `bill.createdAt`)
- Includes `bill.discount` and `entry.return` fields for accurate calculation
- Groups entries by `companyUser.name` → returns `{ labels, countData, salesData, entryGroups }`
- **Bill-level discount proration:** entries grouped by `billId`; for each bill, the bill-level discount is distributed across non-return entries proportional to their value share. Discount is interpreted as: negative = flat amount, positive = percentage of sales total. Discount is capped at `salesValueTotal` to prevent negative net values.
- **Return handling:** return entries are included as negative values in both `entryGroups` and `salesData`
- `salesData` values are rounded to 2 decimal places
- Used in Reports > Users page

---

#### `userStore` (Pinia — `stores/user.ts`)
- Persisted to localStorage (`key: 'users'`, picks only `users` array)
- Fetches from `GET /api/getuser` via `config.public.prismaUrl`
- Methods: `fetchUsers(companyId)`, `getuserById(id)`, `getuserByCode(code)`
- Refreshed after any user add/delete operation
- Used across the app to resolve user name/email from id or code (e.g. in bills, entries)

---

### Holiday Payroll Update

- `pages/users/holidays.vue` provides a yearly company holiday calendar with single-date add/remove and quick actions to mark Fridays, Saturdays, Sundays, or clear weekends.
- `server/api/users/holidays*.ts` manages company holiday list/create/delete/bulk quick-action APIs.
- `CompanyHoliday` (`company_holidays`) stores company-scoped holiday dates.
- `Shift.paidLeaveDays` is a per-cycle allowance: absent/leave/no-attendance expected days consume the allowance first and are counted as paid present days with no leave cut.
- `Shift.holidayPaid = true` makes company holiday dates paid present days when there is no attendance record; unpaid holidays follow normal absence/cut behavior.
- `Shift.workDays` stores selected working weekdays (default Monday-Saturday). `/users/shift` exposes Sunday-Saturday checkboxes, and payroll expected-day generation skips assigned dates that are not selected on the resolved shift.

### Attendance (`/users/attendance`)

- `pages/users/attendance.vue` imports biometric Excel files through `POST /api/attendance/import`. The import modal no longer asks for daily date or shift; daily date is read from the Excel file and shift is resolved from each user's active `ShiftAssignment`.
- `server/api/attendance/import.post.ts` supports daily and monthly workbook layouts, matches Empcode to `CompanyUser.code` after numeric normalization (`0001` and `1` both match code `1`), and writes `Attendance` + import-sourced `AttendanceLog` rows.
- Daily imports read the first `Date` value in the workbook, then import every punch column from `INTime`, `Out1`, `In2`, `Out2`, through `OUTTime` as alternating check-in/check-out logs. `Attendance.checkInAt` is the first imported in punch and `checkOutAt` is the last imported out punch.
- Import overwrite behavior: for every matched company/user/date record in the uploaded file, any existing `Attendance` row for that same date is deleted first (cascading attached logs), then the imported attendance row and import logs are recreated from the file. Attendance adjustment requests are separate records and are not deleted by this overwrite.

---

### Salary (`/users/salary`)

**Files:**
- `pages/users/salary.vue` — salary pay/settings/adjustments/payroll cycle page
- `pages/users/salary/cycle/[id].vue` — payroll cycle detail and per-line payout page with previous due/carry-forward, salary paid, credit cut, and outstanding columns
- `pages/users/credit-bills.vue` — two-tab staff credit page: filtered user credit ledger + credit bill source list
- `pages/users/ledger.vue` — complete per-user double-entry ledger with running balance
- `server/api/salary/payroll/run.post.ts` — creates or recalculates payroll cycle lines
- `server/api/salary/payroll/cycle/[id].delete.ts` — deletes a payroll cycle and removes/recalculates linked payroll ledger rows
- `server/api/salary/pay-with-credit.post.ts` — records salary payout and optional payroll credit cut in one transaction
- `server/api/salary/payment/[id].put.ts` / `[id].delete.ts` — edits/deletes a salary payment, linked money transaction, and linked ledger row
- `server/api/users/ledger.get.ts` — raw SQL complete user ledger API
- `server/api/users/credit-ledger.get.ts` / `credit-ledger.post.ts` — raw SQL credit-only filtered ledger API
- `server/api/users/credit-ledger/[id].put.ts` / `[id].delete.ts` — edits/deletes manual credit/payment ledger rows only
- `server/api/users/credit-bills.get.ts` — raw SQL grouped staff-credit bill list
- `server/utils/payroll.ts` — pure payroll calculation helpers
- `server/utils/user-ledger.ts` — raw SQL helper for user ledger writes and `balanceAfter` recalculation

**Config sources:** `SalaryConfig` (`salary_configs`) keyed by `companyId + userId` stores the per-user salary base and commission config (`period`, `amount`, `commissionPercentage`, `effectiveFrom`). `SalaryPeriod` supports `MONTHLY`, `WEEKLY`, `DAILY`, and `HOURLY`. `Shift` (`shifts`) stores reusable workday selection plus payroll policy (overtime mode/rate/thresholds, leave cuts, late-entry fine, early-exit fine) so one shift policy is reused by every assigned user.
- Settings are shown only for shift-assigned staff.
- Salary settings fields include salary period, amount, and commission percentage; overtime/leave/fine controls are edited from `/users/shift`.
- Payroll runs include only users with an overlapping `ShiftAssignment` and a `SalaryConfig`.

**Payroll calculation:**
- `computeUserLine()` calculates `netPay = periodSalary - leaveDeduction - lateEntryFine - earlyExitFine + overtimeAmount + commissionAmount + adjustmentTotal`.
- Base salary is period-based: monthly splits the selected period by calendar month and sums `monthlySalary * daysInThatMonthSlice / daysInThatCalendarMonth`, weekly prorates by `selectedDays / 7`, daily multiplies by expected shift-covered days, and hourly multiplies by expected shift hours.
- Leave cuts, overtime amount, late-entry fine, and early-exit fine are read from the resolved shift for each expected day (`attendance.shift` if present, otherwise the active `ShiftAssignment.shift`).
- Half-day leave cut uses half of the resolved shift hours times the shift `leaveCutPerHour` when that per-hour cut is configured; otherwise it falls back to the shift `leaveCutHalfDay`.
- Late-entry fine is charged when first check-in is later than shift start by more than the shift's `lateEntryGraceMinutes`.
- Early-exit fine is charged when last checkout is earlier than shift end by more than the shift's `earlyExitGraceMinutes`.
- Existing per-hour leave cut still applies to short worked hours, so a late/early day can have both a per-hour cut and the configured shift fine.
- Commission is calculated during payroll runs from the user's `entries` whose parent bill `createdAt` falls within the cycle period. It uses the same shared net-sales logic as `GET /api/user/report`: bill-level discount is prorated across non-return entries and returns count as negative sales. `commissionAmount = commissionSales * commissionPercentage / 100`.
- Salary dues from `GET /api/salary/dues` read the latest `user_ledger_entries.balance_after`. Positive balance means the company owes the user; negative balance means the user owes the company.
- `/users/salary` create/edit cycle modal takes only pay period start/end and payment date; stored cycle `month`/`year` are derived from `periodStart`.

### User Credit (`/users/credit-bills`)

- The first tab is a filtered view of `user_ledger_entries` showing only credit-related rows. `USER_CREDIT_BILL` adds staff credit due; `CREDIT_BILL_PAYMENT` reduces staff credit due. Manual credit/payment rows are created from the page via `POST /api/users/credit-ledger`.
- Manual user credit rows mirror cash movement into `money_transactions` using the ledger row id as the transaction id: `USER_CREDIT_BILL` creates an `EMPLOYEE/GIVEN/PAID` transaction, while `CREDIT_BILL_PAYMENT` creates an `EMPLOYEE/RECEIVED/PAID` transaction. Editing/deleting a manual credit row updates/deletes that paired money transaction, so Cash/Primary Bank ledgers and report balances stay in sync.
- Bill-credit rows are created/updated by `server/api/bill/create.post.ts` and `server/api/bill/update.post.ts` when `bills.credit_user_id` is set. Split bills use only the `Credit` split amount; non-split staff credit uses `grand_total`. These same rows also appear in the complete User Ledger page.
- The second tab lists bills where `bills.credit_user_id = company_users.user_id` as the source/detail view. It shows invoice, date, entries count, credit amount, bill payment status, and edit action.
- Payroll cycle detail (`/users/salary/cycle/[id]`) shows previous due/carry-forward, net pay, salary already paid, credit cut, and outstanding. Previous due is the ledger balance strictly before the cycle `periodStart`; salary, leave/fine/overtime/commission/adjustment, salary paid, and payroll credit cuts are current-cycle values. Outstanding is `previous due + net pay - salary paid - credit cut`, so partial unpaid or overpaid balances carry into the next cycle and are shown as a separate column. The pay modal defaults to cutting 100% of available user credit, capped by the positive line outstanding, and can be changed by percentage or amount.
- Payroll credit cuts create/update a `CREDIT_BILL_PAYMENT` ledger row with `sourceType = PAYROLL` and `sourceId = cycleLineId`; this reduces future user credit due.
- Manual credit/payment rows can be edited or deleted from the credit page; source-generated rows are edited/deleted through their owning source (bill edit/delete/restore, salary payment edit/delete, or payroll-cycle rerun/delete) so no orphaned credit rows remain.
- Payroll cycle lines persist `lateEntryFine` and `earlyExitFine` separately so the cycle detail table can show them.

### User Ledger (`/users/ledger`)

- Shows the complete `user_ledger_entries` double-entry ledger grouped by staff user with Credit, Debit, and running Balance columns.
- Ledger entry types are `OPENING`, `PAYROLL_ACCRUAL`, `SALARY_PAYMENT`, `USER_CREDIT_BILL`, `CREDIT_BILL_PAYMENT`, and `ADJUSTMENT`; directions are `DEBIT` or `CREDIT`.
- Balance semantics: `CREDIT` increases the amount owed to the user; `DEBIT` reduces it. `balanceAfter` is recalculated per user after each source-linked write.
- Payroll runs create/recalculate `PAYROLL_ACCRUAL` credit rows. Salary payments create `SALARY_PAYMENT` debit rows. User credit bills create `USER_CREDIT_BILL` debit rows, and credit reductions/payroll cuts create `CREDIT_BILL_PAYMENT` credit rows.
- Edit/delete behavior: payroll cycle reruns replace lines, remap existing salary payments and payroll credit cuts to the new line ids where the same user remains, remove orphan payroll cut/settlement rows for removed users, recreate accrual rows, and recalculate balances. Deleting a payroll cycle removes that cycle's `PAYROLL_ACCRUAL`, payroll `CREDIT_BILL_PAYMENT`, and internal payroll-settlement ledger rows, then recalculates affected user balances. Editing/deleting a salary payment updates/removes its `SALARY_PAYMENT` ledger row and linked `money_transactions` row. Bill edits update or remove `USER_CREDIT_BILL` rows; soft-deleting a staff-credit bill removes that row, and restoring the bill recreates it.

---
### `pages/users/shift.vue` — Shift and staff assignment

Defines and manages shifts, then assigns company staff to them. The page loads company users, shifts and assignments; shift changes use `/api/users/shifts`, while the assignment controls connect staff to a shift. The form exposes payroll-related policy options, so changing a shift can affect how attendance and pay are interpreted. This page is distinct from the attendance register and salary payout pages above.
## Current staff-page entry points

### `pages/users/attendance.vue`

Daily and monthly attendance roster. Staff can record punch/attendance data, inspect shifts and adjustments, and import biometric workbooks through `/api/attendance/import`. The detailed import/overwrite behavior is described in the Attendance section above.

### `pages/users/holidays.vue`

Yearly holiday calendar. Add or remove an individual date, mark all Fridays/Saturdays/Sundays, or clear weekends. Reads and writes company holidays through `/api/users/holidays` and its bulk/ID routes; holidays feed payroll's expected-day rules.

### `pages/users/salary.vue`

Salary operations hub. Lists staff with shift assignments, dues, salary configuration, payroll cycles, adjustments and payment history. Staff can run payroll, edit salary settings/adjustments, and pay or amend salary through `/api/salary/*`; only eligible shift-assigned staff appear in salary settings.

### `pages/users/salary/cycle/[id].vue`

One payroll cycle's line-by-line settlement. Shows previous due, accrued pay, paid amount, credit cut and outstanding for each user. Supports partial payment with an optional staff-credit cut through `/api/salary/pay-with-credit`, plus a cycle-wide clear action through `/api/salary/clear-cycle`. Confirming a payout changes financial ledgers; opening the cycle does not.

### `pages/users/credit-bills.vue`

Staff-credit workspace with a credit-ledger tab and source-bills tab. Loads `/api/users/credit-ledger` and `/api/users/credit-bills`; lets staff add/edit/delete manual credit or repayment rows. Generated bill-credit rows are managed at the bill, not manually here.

### `pages/users/ledger.vue`

Read-only complete per-staff financial ledger from `/api/users/ledger`. Shows credit, debit and running balance, including payroll accruals, salary payments and staff-credit movements. This is broader than the filtered staff-credit page.
