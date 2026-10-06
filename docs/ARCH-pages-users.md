## Users / Staff Pages

Staff company transfers preserve old investment and account-ledger history in its
original company. If old investments require the original CompanyUser identity,
that membership is retained with `deleted=true,status=false` instead of deleting
its historical foreign-key target. The destination receives the active membership;
salary, payroll and staff-credit source movement remains transactional.

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

#### Company scope across Users

- All Users pages (`index`, `attendance`, `shift`, `holidays`, `salary`, `credit-bills`, `ledger`) use page-local scope. Table filters never write the auth session or switch the sidebar company.
- `CompanyTableFilter` controls combined reads; `CompanyFormField` controls the form owner independently. New modals default to the active head office; edit modals select the stored owner. Staff, shift and bank options use exact form-company reads.
- `server/utils/companyListHandler.ts` fans out existing SQL ledger, credit-bill, salary-dues and holiday calculations across authorized companies, annotating rows with `companyId`, `companyName`, and `scopeKey`. Calculations and running balances stay separate per company/user.
- Payroll cycle detail resolves its stored company through `/api/organization/context`. Downloads from the main staff detail explicitly request that membership's company.
- Generated CompanyUser mutations protect the last active admin inside a serializable transaction; final settlement also protects the last admin. `/api/getuser` validates company access.
- `companyTransfer.ts` supports staff membership, shifts, attendance requests, salary configuration, payroll cycles and payments. Staff transfers move dependent records, preserve the shared User identity, allocate a destination staff code and clear delegated access. An existing destination staff membership, moving the current active membership, or removing the source's last active admin is rejected.
- Payroll scalar links to payments, cycle lines and money transactions are explicitly discovered. Destination staff/bank mappings are required, linked documents require confirmation, and all writes and ledger recalculations are transactional.

#### User Management (`index.vue`)
- Lists `CompanyUser` memberships through `useCompanyScope('table')`: head-office admins default to the head office and active direct branches, with a local Company / branch filter; branches remain single-company. Rows use company/user composite keys. The list is filtered by name search + status, paginated; related `User.cleanup = true` accounts are excluded from the table/count
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

**Roles:** `admin | manager | biller | accountant | investor | user`

Investments can select an existing active CompanyUser (preserving its role) or create
a User and CompanyUser with role `investor` in the same transaction as the investor
profile. Fresh investment-created users receive a random password hash and use
Forgot password to establish credentials. The new role does not grant Accountant
management access. The Users role selector also includes Investor.

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
- Requires `assertCompanyAccess(event, companyId)` before reading staff; the query company must be accessible to the authenticated user.

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

- `pages/users/holidays.vue` provides a yearly company holiday calendar with single-date add/edit and confirmed delete. Recurring weekly offs belong in Shift work days; legacy bulk weekday actions are retired without deleting existing records.
- `server/api/users/holidays*.ts` manages company holiday list/create/update/delete APIs. Writes require admin/manager/accountant and authorized company ownership; the legacy bulk route returns 410 without changing data.
- `CompanyHoliday` (`company_holidays`) stores company-scoped holiday dates.
- `Shift.paidLeaveDays` is a per-cycle allowance: absent/leave/no-attendance expected days consume the allowance first and are counted as paid present days with no leave cut.
- `Shift.holidayPaid = true` makes company holiday dates paid present days when there is no attendance record; unpaid holidays follow normal absence/cut behavior.
- `Shift.workDays` stores selected working weekdays (default Monday-Saturday). `/users/shift` exposes Sunday-Saturday checkboxes, and payroll treats other weekdays as weekly offs: absent off days are skipped, while worked off days follow their compensation policy.

### Attendance (`/users/attendance`)

- `pages/users/attendance.vue` adapts the Contractor attendance hub to Markit's Nuxt UI and company membership model: Daily Roster, Monthly View, Requests, Approvals and Manual Attendance. Header links open the existing `/users/shift` and `/users/holidays` pages. Company/branch replaces the reference application's department/site context; this is not a copy of Contractor's permission or schema model.
- Daily roster includes a personal check-in/out card for each visible membership, independent of the shift filter. Live punch timestamps are current; checkout and break return may attach to the previous night's attendance. Historic corrections use manual attendance or requests. A punch writes the attendance summary and log together through `POST /api/attendance/punch`, validates the latest punch sequence, and refreshes daily and monthly data.
- Admin, manager and accountant roles can mark others, save/delete manual attendance, and decide requests through the new endpoints. Other roles can submit live punches for themselves. Generated AttendanceAdjustment mutations are denied. Request writes use validated company-scoped APIs; non-management staff may submit/edit/cancel only their own pending requests.
- Manual Attendance lists the selected day's attendance (including imported/live entries), with add, edit and confirmed delete. Forms use exact-company staff/shift options. Existing entries keep their company, staff and date; new entries reject duplicates. An omitted shift resolves from the latest effective assignment. Present/half-day entries require check-in; absent/leave/holiday entries reject punch times. Checkout has an explicit next-day option.
- `POST /api/attendance/manual` updates attendance and first-in/last-out logs atomically. Intermediate break punches are preserved; times crossing those punches are rejected. Punch notes are stored on boundary logs, not on the attendance row. `DELETE /api/attendance/manual` deletes the selected company-owned attendance and its cascading logs, leaving separate adjustment requests intact. Existing payroll cycles are not automatically recalculated.
- Monthly Attendance status resolves effective assignments, company holidays and approved leave through `/api/attendance/calendar`. It distinguishes future/no-shift/no-entry-today, weekly offs, holidays, leave, recorded absent/half-day/present and open punches. Present-day totals count P=1 and HD=0.5, exclude open punches, and are not payroll entitlement. Future blank dates are not absences. Raw punch status requires a punch, not merely an attendance row.
- Roster/monthly hour metrics remain raw recorded-punch/scheduled-time measurements, explicitly labelled as distinct from payroll. Shift break-pay, grace, overtime eligibility, automatic classification and allowance policies are applied by payroll. Management-only tabs are hidden from other staff.
- `POST /api/attendance/request` creates or edits pending requests; `DELETE /api/attendance/request` cancels pending requests without removing history. Serializable transactions enforce company, owner, active staff, pending state, real dates, local times, next-day checkout and nonempty reason (maximum 1000 characters). Client-supplied status/decision/ownership fields cannot override server values.
- Requests retain Markit's first-in/last-out correction model and support next-day checkout; they do not store Contractor's arbitrary requested-punch timeline. `POST /api/attendance/decision` accepts only pending requests and atomically updates the decision, attendance times and boundary logs on approval. Rejections only update the decision. This prevents approved requests with stale punch-derived totals. Conflicting intermediate break punches require a different correction and roll the entire decision back.
- New writes preserve the browser-local midnight used by roster queries. `server/utils/attendance-write.ts` validates dates/time inputs, exact-company staff/shift ownership and log boundaries. The basic manual-attendance endpoints need no new models; advanced shift rules require the Shift policy migration documented below.
- `pages/users/attendance.vue` imports biometric Excel files through `POST /api/attendance/import`. The import modal no longer asks for daily date or shift; daily date is read from the Excel file and shift is resolved from each user's active `ShiftAssignment`.
- `server/api/attendance/import.post.ts` supports daily and monthly workbook layouts, matches Empcode to `CompanyUser.code` after numeric normalization (`0001` and `1` both match code `1`), and writes `Attendance` + import-sourced `AttendanceLog` rows.
- Daily imports read the first `Date` value in the workbook, then import every punch column from `INTime`, `Out1`, `In2`, `Out2`, through `OUTTime` as alternating check-in/check-out logs. `Attendance.checkInAt` is the first imported in punch and `checkOutAt` is the last imported out punch.
- Import requires admin/manager/accountant on the server and confirms overwrite in the UI.
- Import overwrite behavior: for every matched company/user/date record in the uploaded file, any existing `Attendance` row for that same date is deleted first (cascading attached logs), then the imported attendance row and import logs are recreated from the file. Attendance adjustment requests are separate records and are not deleted by this overwrite.

---

### Salary (`/users/salary`)

Native bank selection (2026-10-06): salary and payroll forms use
`useSalaryPaymentAccounts` and manager-scoped `GET /api/salary/payment-options`.
Options are active company-native BANK accounts. `bankAccountId` in payout/edit,
cycle clearing and final settlement requests means a native account ID; omitted
choices use Staff Accounting defaults or the existing source snapshot.
`selectStaffPaymentAccount` snapshots that choice in the source transaction before
deferred posting and rejects foreign, inactive or wrong-type accounts. New salary
and linked money rows leave legacy bank scalars null. Editing historical payments
resolves their saved `bank:<id>` native mapping before clearing the old scalar.
Linked MoneyTransaction source documents remain for native staff projections;
they do not write the old financial ledger.

**Files:**
- `pages/users/salary.vue` — salary pay/adjustments/payroll cycle page; salary settings live in Users row actions
- `pages/users/salary/cycle/[id].vue` — payroll cycle detail and per-line payout page with previous due/carry-forward, salary paid, credit cut, and outstanding columns
- `pages/users/credit-bills.vue` — two-tab staff credit page: filtered user credit ledger + credit bill source list
- `pages/users/ledger.vue` — per-user source ledger with running balance and double-entry journal links
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

**Config sources:** `SalaryConfig` (`salary_configs`) keyed by `companyId + userId` stores the per-user salary base and commission config (`period`, `amount`, `commissionPercentage`, `effectiveFrom`, `rateHistory`). Immutable rate versions drive historical payroll; scalar fields represent the latest configured rate. `SalaryPeriod` supports `MONTHLY`, `WEEKLY`, `DAILY`, and `HOURLY`. `Shift` (`shifts`) stores reusable workday selection plus payroll policy (overtime mode/rate/thresholds, leave cuts, late-entry fine, early-exit fine) so one shift policy is reused by every assigned user.
- Salary settings open from `/users` > each staff row Actions > Salary settings (admin/manager/accountant UI). The selected company and staff are fixed; existing settings are reloaded before editing. Settings can be prepared before assigning a shift, but payroll still requires an overlapping assignment. The Salary page no longer has a Settings tab.
- Salary settings fields include salary period, amount, and commission percentage, plus an effective date and saved rate history, with server-side non-negative amount / 0-100 commission validation; overtime/leave/fine controls are edited from `/users/shift`.
- Payroll runs include only users with an overlapping `ShiftAssignment` and a `SalaryConfig`.

**Payroll calculation:**
- `computeUserLine()` calculates `netPay = periodSalary - leaveDeduction - lateEntryFine - earlyExitFine + overtimeAmount + commissionAmount + adjustmentTotal`.
- Base salary is period-based: monthly splits the selected period by calendar month and sums `monthlySalary * daysInThatMonthSlice / daysInThatCalendarMonth`, weekly prorates by `selectedDays / 7`, daily multiplies by expected shift-covered days, and hourly multiplies by expected shift hours.
- Leave cuts, overtime amount, late-entry fine, and early-exit fine are read from the resolved shift for each expected day (`attendance.shift` if present, otherwise the active `ShiftAssignment.shift`).
- Half-day leave cut uses half of the resolved shift hours times the shift `leaveCutPerHour` when that per-hour cut is configured; otherwise it falls back to the shift `leaveCutHalfDay`.
- Late-entry fine is charged when first check-in is later than shift start by more than the shift's `lateEntryGraceMinutes`.
- Early-exit fine is charged when last checkout is earlier than shift end by more than the shift's `earlyExitGraceMinutes`.
- Existing per-hour leave cut still applies to short worked hours, so a late/early day can have both a per-hour cut and the configured shift fine.
- Commission is calculated during payroll runs from the user's `entries` whose parent bill `createdAt` falls within the cycle period. It uses the same shared net-sales logic as `GET /api/user/report`: bill-level discount is prorated across non-return entries and returns count as negative sales. Each sale uses the commission percentage effective on its bill date; the results are summed.
- Salary dues from `GET /api/salary/dues` read the latest `user_ledger_entries.balance_after`. Positive balance means the company owes the user; negative balance means the user owes the company.
- `/users/salary` create/edit cycle modal takes only pay period start/end and payment date; stored cycle `month`/`year` are derived from `periodStart`.

### Salary safeguards

- Salary mutation APIs enforce admin/manager/accountant and authorized company ownership. Generated writes to SalaryConfig, SalaryPayment, PayrollCycle, PayrollCycleLine and PayrollAdjustment are denied. Settings use `/api/salary/config`; adjustments use `/api/salary/adjustment`, with only pending adjustments cancellable/deletable.
- Public payment inputs reject `ledgerAmount`, `cycleId` and `cycleLineId`; payment and edit routes validate positive money, real dates and supported payment modes. Internal settlement inputs remain separate and verify cycle/user ownership.
- Payroll calculation, cycle/line persistence and ledger posting share one serializable Prisma transaction via `server/utils/payroll-transaction.ts`. Clear-cycle payouts also commit together. Company row locks serialize salary writes. Reruns retain line IDs and already processed adjustments belonging to the cycle; removing a settled staff line requires reversing its settlements first. Negative net pay posts a debit accrual.
- `server/utils/salary-history.ts` resolves daily base salary and sale-date commission rates. Rate changes must start today or later, after the previous version and after the latest saved payroll period for that staff member. Attendance/leave allowances are evaluated once over the full period. Legacy configs use their current rate as a baseline; rates overwritten before history existed cannot be recovered.
- Editing a salary payout preserves only that payout's embedded credit deduction, rather than adding the entire cycle's cumulative credit cut. Deleting its cash payment moves any attached credit deduction into the separate payroll salary-settlement row so the non-cash credit reduction and staff balance remain consistent. Moving an embedded-credit payout to another staff member is rejected until reversed.
- Cycle deletion requires confirmation. It removes cycle accruals and internal credit settlements, preserves actual cash payments, clears their cycle links, restores their ledger debit to the actual cash amount and recalculates balances.
- Rollout: additive `prisma/migrations/20260930120000_salary_rate_history/migration.sql`, followed by regenerated Prisma/ZenStack artifacts. Tests: `tests/salary-safety.test.ts` covers input/role checks, effective rates and mocked transaction rollback/rerun stability.

### Staff accounting connection

`server/utils/accountant/users.ts` owns `/api/accountant/users` settings and activation.
Settings → Account → Salary & staff credit replaces the Accounting buttons on
Salary, Credit and User Ledger. Choices include Salary Expense (5200), Salary
Payable (2260), staff receivable (initially the ERP receivable), Cash, Primary Bank,
opening/balance offset (2220), and mappings for named payment banks. Existing mappings
are retained; new staff sources freeze their account choices. Settings and source
writes use company-owned accounts; activation locks the company before the Accountant
advisory lock through `runAccountant`'s optional `lockCompany` argument.

Migrations `20260930130000_user_accounting` and
`20260930131000_user_credit_cut_baseline` install deferred triggers on
`user_ledger_entries`, `salary_payments` and `money_transactions`. Source edits reverse
and replace published journals; deletes reverse them. Period locks reject the whole
source transaction. All lines snapshot the staff member in `source_parties.user`.
Generated UserLedgerEntry writes are denied; dedicated source APIs remain owners.

Posting rules:
- Payroll accrual: debit Salary Expense / credit Salary Payable; negative net pay
  reverses the sides. Existing advances use the salary payout model and reduce the
  same payable, potentially leaving a debit balance.
- Salary payout: debit Salary Payable / credit the selected Cash or Bank. It uses
  `salary_payments.amount`, never an inflated operational ledger amount containing a
  credit deduction.
- Manual staff credit: debit receivable / credit Cash or Bank; repayments reverse it.
- Payroll credit deduction: debit Salary Payable / credit receivable, without cash.
  The separate operational salary-settlement row does not post a second journal.
- Staff-credit bills reuse their existing ERP bill journals; no duplicate sales entry.
- Staff OPENING/ADJUSTMENT ledger rows use the selected balance offset and payable.

Activation is **new activity only**. Existing logical sources are excluded even if a
payroll rerun recreates their ledger IDs. Existing cumulative payroll-credit cuts
retain a baseline; only later additions post, and reversal cancels only that new
portion. This does not import historic salary expense/payable or change old balances.
Production tooling includes `connect-user-accounting.ts` and a `staff-setup` runner
stage. `verify-user-accounting.mjs` checks unchanged sync and expected journal lines.

`GET /api/users/ledger` retains operational staff totals/running balances and adds
accounting status, account names, debit/credit amounts and current journal links.
Bill rows link to ERP; internal payroll settlement rows link to their deduction
journal. Earlier unposted rows show Before connection. The operational balance can
include earlier activity that was never imported into the new books. Journal links
carry `entryCompany` so branch ownership is retained.

Coverage: `tests/user-accounting.integration.test.ts` exercises PostgreSQL posting,
exclusions, old-cycle additional deductions, named banks, scope/locks/reversals and the
ledger read API. `tests/user-accounting-api.integration.test.ts` exercises actual
salary and manual credit write APIs against installed triggers in a rolled-back
transaction. Browser interaction is not included in these tests.

### User Credit (`/users/credit-bills`)

- The Credit/Bills tabs use numeric Nuxt UI selection. Read failures clear stale rows, show a retry message and suppress totals. Display totals follow search/company filters; bill credit is original purchase credit, not outstanding debt, and negative credit due means repayments exceed credit.
- Manual writes require admin/manager/accountant. `server/utils/user-credit-input.ts` accepts only CREDIT/PAYMENT, finite positive amounts up to 999999999 with at most two decimals, CASH/BANK, a real YYYY-MM-DD transaction date in 2000-2100, and an optional note up to 1000 characters. The server derives direction, MANUAL source and null source ID; caller overrides are rejected. Dates are stored at UTC midnight; an edit retaining the same UTC date preserves the existing timestamp and ledger order.
- Transaction rows include userId. Editing locks company and staff in the UI, and the PUT route rejects staff reassignment. Only company-owned MANUAL credit/payment rows can be edited/deleted. Other sources remain managed through bills/payroll.
- Forms explain actual money given/received and the cash/primary-bank effects; these are not non-cash balance adjustments. Delete requires confirmation identifying staff, amount, date and cash/bank effect. Transactions update/delete the staff ledger and linked money source atomically with native Staff Accounting postings. Legacy account-ledger writes are disconnected; staff operational balances remain active.

- The first tab is a filtered view of `user_ledger_entries` showing only credit-related rows. `USER_CREDIT_BILL` adds staff credit due; `CREDIT_BILL_PAYMENT` reduces staff credit due. Manual credit/payment rows are created from the page via `POST /api/users/credit-ledger`.
- Manual user credit rows mirror cash movement into `money_transactions` using the ledger row id as the transaction id: `USER_CREDIT_BILL` creates an `EMPLOYEE/GIVEN/PAID` transaction, while `CREDIT_BILL_PAYMENT` creates an `EMPLOYEE/RECEIVED/PAID` transaction. Editing/deleting a manual credit row updates/deletes that paired money transaction, so Cash/Primary Bank ledgers and report balances stay in sync.
- Bill-credit rows are created/updated by `server/api/bill/create.post.ts` and `server/api/bill/update.post.ts` when `bills.credit_user_id` is set. Split bills use only the `Credit` split amount; non-split staff credit uses `grand_total`. These same rows also appear in the complete User Ledger page.
- The second tab lists bills where `bills.credit_user_id = company_users.user_id` as the source/detail view. It shows invoice, date, entries count, credit amount, bill payment status, and edit action.
- Payroll cycle detail (`/users/salary/cycle/[id]`) shows previous due/carry-forward, net pay, salary already paid, credit cut, and outstanding. Previous due is the ledger balance strictly before the cycle `periodStart`; salary, leave/fine/overtime/commission/adjustment, salary paid, and payroll credit cuts are current-cycle values. Outstanding is `previous due + net pay - salary paid - credit cut`, so partial unpaid or overpaid balances carry into the next cycle and are shown as a separate column. The pay modal defaults to cutting 100% of available user credit, capped by the positive line outstanding, and can be changed by percentage or amount.
- Payroll credit cuts create/update a `CREDIT_BILL_PAYMENT` ledger row with `sourceType = PAYROLL` and `sourceId = cycleLineId`; this reduces future user credit due.
- Manual credit/payment rows can be edited or deleted from the credit page; source-generated rows are edited/deleted through their owning source (bill edit/delete/restore, salary payment edit/delete, or payroll-cycle rerun/delete) so no orphaned credit rows remain.
- Payroll cycle lines persist `lateEntryFine` and `earlyExitFine` separately so the cycle detail table can show them.

### User Ledger (`/users/ledger`)

- Shows the complete `user_ledger_entries` source ledger grouped by staff user with Credit, Debit, and running Balance columns.
- Ledger entry types are `OPENING`, `PAYROLL_ACCRUAL`, `SALARY_PAYMENT`, `USER_CREDIT_BILL`, `CREDIT_BILL_PAYMENT`, and `ADJUSTMENT`; directions are `DEBIT` or `CREDIT`.
- Balance semantics: `CREDIT` increases the amount owed to the user; `DEBIT` reduces it. `balanceAfter` is recalculated per user after each source-linked write.
- Payroll runs create/recalculate `PAYROLL_ACCRUAL` credit rows for positive net pay and debit rows for negative net pay. Salary payments create `SALARY_PAYMENT` debit rows. User credit bills create `USER_CREDIT_BILL` debit rows, and credit reductions/payroll cuts create `CREDIT_BILL_PAYMENT` credit rows.
- Edit/delete behavior: payroll reruns retain existing staff line IDs and atomically replace accruals with cycle/line changes. Settled staff lines cannot be removed until settlements are reversed. Deleting a cycle removes its accrual and internal payroll settlements, while preserving actual payments with cleared cycle links and corrected cash-only ledger debits; affected balances are recalculated. Editing/deleting a salary payment updates/removes its `SALARY_PAYMENT` ledger row and linked `money_transactions` row. Bill edits update or remove `USER_CREDIT_BILL` rows; soft-deleting a staff-credit bill removes that row, and restoring the bill recreates it.

---
### `pages/users/shift.vue` — Shift and staff assignment

Defines and manages shifts, then assigns company staff to them. The page loads company users, shifts and assignments; shift changes use `/api/users/shifts`, while the assignment controls connect staff to a shift. The form exposes payroll-related policy options, so changing a shift can affect how attendance and pay are interpreted. This page is distinct from the attendance register and salary payout pages above.

**Shift policy scenarios (2026-09-29):**
- Add/edit shift opens a full-screen editor with a fixed header/footer, a scrolling form and responsive section shortcuts. Eight sections group basics, breaks, attendance/night shifts, normal overtime, holidays/weekly offs, paid leave, absence deductions and punctuality fines. Every form field includes plain-language help, units or an example; selected missing-checkout behavior has its own explanation. The editor explicitly explains effective dates, generic versus approved leave, half-day deduction precedence, overtime rounding and combined fines/short-hour deductions. These presentation changes do not alter policy calculations or saved values.
- The expanded add/edit modal exposes paid/unpaid breaks, recorded or automatic minimum unpaid-break deductions (with a worked-minute trigger), holiday/weekly-off compensation, typed leave, full/half-day minimum work minutes, missing-checkout handling and overnight checkout grace. Existing shifts keep defaults equivalent to their prior behavior until explicitly changed.
- `Shift.policy` stores validated extra settings. `policyHistory` stores effective-date snapshots of both the original scalar settings and new policy. An edit captures the old baseline once, appends a new immutable date and rejects backdating/replacing an existing effective date. A subsequent same-day edit must take effect later. Payroll and attendance resolve the applicable version for each date. History starts from the settings present when versioning is first enabled; older already-overwritten settings cannot be reconstructed.
- Generated Shift create/update and LeaveApplication writes are denied; dedicated APIs own validation and versioning. Shift save and leave write APIs require admin/manager/accountant roles and authorized company ownership. Shift inputs reject invalid times, negative amounts, equal start/end, excessive breaks and inconsistent classification thresholds.
- Paid breaks credit recorded break time only up to the configured allowance and do not reduce expected shift hours. Automatic unpaid breaks deduct only the unrecorded portion of the allowance, avoiding a second deduction for an already recorded break. Recorded-only unpaid breaks retain prior punch-pair behavior.
- Weekly-off work is included for compensation without increasing normal daily/hourly base salary. Holiday compensation takes precedence when dates overlap. PAY adds all policy-adjusted worked hours at the configured extra hourly rate; COMP_OFF earns one leave day after the configured minimum minutes; BOTH does both. Holiday extra pay replaces ordinary overtime for that day. Configured compensation is additional to normal base salary, not a salary multiplier.
- Compensatory leave is replayed from completed attendance and approved COMP_OFF leave, with optional expiry. Incomplete punches cannot generate credit. Credits cannot be used before or on their earning date. Repeated payroll runs do not mint duplicate credits because the calendar is recalculated from source records.
- Automatic classification applies to PRESENT records during payroll: at least the full-day threshold is present, at least the half-day threshold is half-day, otherwise absent. Explicit manual statuses remain authoritative. Missing checkout can retain legacy recorded-hours behavior, require correction before payroll, count absent/half-day, or assume scheduled shift end for calculation only; stored punches are unchanged.
- Typed leave settings expose casual/sick/earned/other allowances per calendar week (Monday start), month or year. Enabling them replaces the generic per-cycle paid allowance. Approved applications are consumed chronologically across payroll boundaries; excess is unpaid. Paid holidays and weekly offs do not consume entitlement. Fractional half-days are supported; working a full booked leave day does not consume leave. Partial approved leave reduces expected work and suppresses punctuality fines for that day. Unused typed leave does not carry forward.
- `pages/users/leaves.vue` is the leave application/decision and balance page, linked from attendance and the shift form. Applications use `/api/users/leaves`; balances use `GET /api/users/leave-balances?userId&date` for the exact selected company. Save validates dates, half-day increments, staff membership and overlapping pending/approved applications. Balances replay source history and reflect approved applications through the selected date, not reservations for pending leave.
- Overnight live checkout resolves the previous day's open night attendance within the configured grace after shift end. Returning from a recorded break before night-shift end reuses that attendance. The roster reads the prior day as needed, displays the active shift and refreshes its date across midnight.
- Rotating/split shifts remain outside scope. Assignment effective ranges still determine membership; overlapping historical assignments resolve deterministically by latest effective-from date.
- Rollout requires the additive `prisma/migrations/20260929160000_shift_policy_scenarios/migration.sql` migration and regenerated Prisma/ZenStack artifacts. See `scripts/SHIFT-POLICY.md`. Changing source attendance, leave or holidays still requires a payroll rerun to update saved payroll lines.

### `pages/users/attendance.vue`

Daily and monthly attendance roster. Staff can record punch/attendance data, inspect shifts and adjustments, and import biometric workbooks through `/api/attendance/import`. The detailed import/overwrite behavior is described in the Attendance section above.

### `pages/users/holidays.vue`

Yearly company holiday calendar with month navigation, a responsive month list and a horizontally scrollable calendar on narrow screens. Month counts are distinct dates across the selected companies. Only current-month cells are interactive; neighboring dates are blank so year-boundary spillover does not display incomplete holiday data. Includes loading, retry and empty states.

Management roles (admin/manager/accountant) can add a date, click an existing holiday to edit, or use the month's list to delete with confirmation. The form explains date/name inputs and locks the company on edit. Add defaults to today's day clamped to the selected month; saving navigates to the saved month. Date/name validation rejects impossible dates, dates outside 2000-2100 and names over 120 characters. Duplicate company/date creates and edits return 409 rather than overwriting names. PUT and DELETE scope their mutation by both record ID and authorized company.

Recurring weekday creation and bulk weekend deletion are removed from the UI, and the legacy bulk API returns 410. Existing records remain unchanged, including old 'Weekly holiday' entries; these can be reviewed and individually removed. The page links to shift work-day settings and explains that holiday pay/compensation follows each employee's shift, with holiday policy taking precedence over weekly-off policy on overlapping dates. Source date changes require a payroll rerun to update saved payroll lines.

Generated CompanyHoliday create/update/delete operations are denied in `schema.zmodel`; the custom APIs own validated mutations. No database column migration is needed for this holiday-editor change.

### `pages/users/salary.vue`

Salary operations hub. Lists staff with shift assignments, dues, payroll cycles, adjustments and payment history. Salary configuration is edited from the Users action menu. Staff can run payroll, edit salary settings/adjustments, and pay or amend salary through `/api/salary/*`; only eligible shift-assigned staff appear in salary settings.

### `pages/users/salary/cycle/[id].vue`

One payroll cycle's line-by-line settlement. Shows previous due, accrued pay, paid amount, credit cut and outstanding for each user. Supports partial payment with an optional staff-credit cut through `/api/salary/pay-with-credit`, plus a cycle-wide clear action through `/api/salary/clear-cycle`. Confirming a payout changes financial ledgers; opening the cycle does not.

### `pages/users/credit-bills.vue`

Staff-credit workspace with a credit-ledger tab and source-bills tab. Loads `/api/users/credit-ledger` and `/api/users/credit-bills`; lets staff add/edit/delete manual credit or repayment rows. Generated bill-credit rows are managed at the bill, not manually here.

### `pages/users/ledger.vue`

Read-only complete per-staff financial ledger from `/api/users/ledger`. Shows credit, debit and running balance, including payroll accruals, salary payments and staff-credit movements. This is broader than the filtered staff-credit page.
