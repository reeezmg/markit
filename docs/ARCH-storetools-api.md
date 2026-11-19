# Storetools — Nuxt Server API Routes + Server Utilities

## Sidebar settings

`GET/PUT /api/settings/sidebar-navigation` reads/saves company sidebar choices through `server/utils/sidebar-navigation.ts`. Reads require active membership and authorized company scope. Same-origin writes require a live admin/manager role, strict preferences, a company row lock, matching JSON revision and transactional backup under GeneralPreference `sidebar-navigation/defaults-backup`. Generic generated mutations of this namespace are rejected. No runtime DDL or schema migration is involved. See `ARCH-sidebar-navigation.md`.

## Dedicated CRM

`server/api/crm/[...path].ts` owns `/api/crm/*`. `crm-access.ts` validates current
staff membership, authorized company and same-origin writes. Managers own reports,
settings, CRM work archives/restores and bulk assignment; staff edit work they own or
created; unassigned memberships may be claimed. Client identity is managed only on /client. Source records and linked identities are checked against the same company.
`crm.ts`, `crm-workflows.ts`, `crm-reminders.ts` and `crm-campaigns.ts` own persistence
and business operations. All new CRM model access is denied through generated APIs.

| Endpoint | Operations |
|---|---|
| `bootstrap` | GET readiness, authorized actor, active staff, defaults/settings and currency |
| `clients` | GET existing company clients; PUT `:id` updates CRM attributes only; POST creation rejected |
| `accounts`, `deals`, `activities` | GET filtered/paged records; POST create |
| `:resource/:id` | GET detail/activity/audit context; PUT versioned edit |
| `:resource/bulk` | POST manager assignment or archive/restore of explicit versioned rows |
| `:resource/export` | GET filtered CSV, capped at 5,000 matches with truncation header |
| `clients/import` | POST preview/atomic update of CRM attributes for up to 200 existing client IDs |
| `client-choices`, `documents` | GET scoped client and quotation/invoice/order selectors |
| `deals/:id/documents` | POST explicit company/client-checked source-document reference |
| `order-summary/:id` | GET company-owned order status, amount and linked invoice |
| `summary`, `reports`, `settings` | GET CRM aggregates/configuration; PUT manager settings |
| `campaigns/*` | Existing email handlers under a request-local, authorized CRM actor |
| `/api/cron/crm` | Protected 15-minute internal reminder processor; no customer messages |

Readiness checks the six CRM tables and three CompanyClient CRM columns. Client create/edit/activation remain on the existing client page; CRM bulk archive rejects clients. Missing dedicated CRM tables return a setup
state/503 and are never installed by runtime code. Writes use a company advisory lock,
transactions, optimistic versions and append-only audit evidence. See `ARCH-crm.md`.

## Pickup handover list and carrier schedule

`POST /api/ecommerce-cms/pickup/add` accepts `{requestId,shipmentIds}` where parcel
IDs are `<orderId>:forward|exchange`. The authorized company comes from
`useCompanyRequestSession`. A transaction locks an open carrier-backed pickup and
the selected company-owned orders, rechecks the shared pending-parcel query for
carrier/location/availability, sets the per-leg pickup tag and updates local counts.
Retries return `added: 0`; stale selections return 409 without writes. The response
includes `carrierUpdated: false`: no carrier AWB-assignment call exists here.

`POST /api/ecommerce-cms/pickup/schedule` accepts `{requestId,date,startTime,endTime}`
and validates a real calendar date and a same-day 24-hour `HH:mm` range. It stores
`carrierSchedule` with source `manual` and an audit timestamp on the authorized
company's open carrier pickup. It records an allocated slot from the portal;
it does not reschedule it. Creation preserves requested date/time and the raw
carrier response. Creation and slot recording check the separately authorized
schedule migration before writing; creation checks before contacting the carrier.
The history reader tolerates absent new columns and reports unknown carrier slots.
See `ARCH-pages-orders.md` and `ARCH-schema.md` for field/migration details.

## After-sales

`GET /api/settings/customer-product-numbering` returns company-scoped `prefix`,
`nextNumber` (string), `nextReference`, `available` and `canEdit`. PUT accepts `{prefix}`
for admin/manager/accountant and audits the preceding/new prefix without resetting
the counter. Writes require the separately authorized numbering migration; a missing
installation returns 503. Public checkout has no prefix-setting endpoint. POS, manual
and ecommerce registration allocate from the same locked company counter after
installation and otherwise retain legacy references for compatibility.

`/api/after-sales/*` owns staff-only, company-scoped configuration CRUD/preview/archive,
product linking reads, customer-unit registration, agreements, claims, visits, readings
and explicit service invoicing. The daily authenticated `/api/cron/after-sales` processor
generates due occurrences and internal alerts. Runtime source integrations are no-ops
before migration installation; feature APIs report 503. See `ARCH-after-sales.md` for
the complete route table, lifecycle behavior and prepared migration boundary.

`GET /api/after-sales/staff` uses active, non-deleted `company_users` memberships and
excludes cleanup users. It returns User IDs with the company membership's name, using
account email as a fallback. Service assignment enforces the same eligibility.

`GET /api/after-sales/customers/:id` validates the customer's company membership and
returns `customer`, purchase `rows`, `total`, `page` and `pageSize`. `q` searches product,
barcode, serial, reference and invoice; page sizes are 10/20/50 (default 20). Registered
units retain their service IDs; unregistered stock quantities from non-deleted sale
bills have `customer_product_id=null`. The read excludes charge/return lines and never
creates historical registrations. See `after-sales-customer-history.ts`.

`GET /api/after-sales/catalog` searches charges and service products by `q` and accepts
`includeArchived=true` for charge management. `POST /api/after-sales/catalog/charges`
creates or updates company-owned defaults (`id?`, `name`, `description`, `rate` before
tax, `tax`, `unit`, `archived`) and returns `{id,category}`. The write atomically
ensures/reuses the company's Service Charges category; catalogue reads include
`chargeCategory` (or null) without creating it. A company-scoped preference retains
the category ID through renames; an inactive category is restored on charge save or
service invoice issuance. New custom/free service invoices also receive this category.
Category creation/restoration is audited and serialized by the after-sales lock.
`billEdit/findUniqueBill` additionally returns `isServiceInvoice` and
`serviceChargeCategory`; the editor uses these to preserve charge tax/rates and supply
available defaults for previously uncategorized charges on explicit save.
Job saves accept `details.charges` non-stock lines and
`details.parts` catalog stock lines. Charge lines cannot carry stock identities; product
lines validate company ownership. First service invoice issuance requires completion
and supports zero total; repeated calls reuse the linked invoice. Product create,
update and batch-save payloads accept optional `isServiceProduct`; read/PO payloads
return it. These additions require prepared migration `20261030170000_service_items`.

---

## Server Utilities (`storetools/server/`)

### Recurring invoices and retainers

`GET/POST /api/recurring-invoices`, `GET/PUT /api/recurring-invoices/:id`, and
`POST /api/recurring-invoices/:id/actions` own profile listing, create/edit/read and
`pause`, `resume`, `generate`, `issue` actions (`occurrenceId` selects a saved draft).
`GET/POST /api/retainer-invoices`, `GET/PUT /api/retainer-invoices/:id`,
`GET /api/retainer-invoices/options`, and `POST /api/retainer-invoices/:id/actions`
own advance requests, account choices and `sent`, `void`, `collect`, `apply`, `refund`,
`unapply` actions. Financial payloads include date/amount/reference; collections/refunds
also need paymentMethod/accountId, applications billId, removals eventId.

`invoice-program-route.ts` authorizes through `quoteCompany`, opens repeatable-read
read-only transactions for GET, or bounded write transactions for mutations. Mutations
require requestId and saves require the last revision for edits. Database tenant comes
from the authorized request context. Domain services use parameterized SQL, company and
document locks, and durable `saveSourceRequest` receipts. Missing module tables report a
setup-needed 503; no route executes DDL. Generic and nested generated mutations are
blocked. `GET /api/billSale/invoices?clientId=...` adds a bound customer filter used by
the application picker, preserving existing company/date/state/pagination filters.

`GET /api/cron/recurring-invoices` requires the configured CRON_SECRET Bearer token;
unauthenticated/development bypasses are absent. It invokes the bounded per-occurrence
processor and reports failed work with HTTP 500. See `ARCH-pages-erp.md` for the dates,
accounting lifecycle, atomicity, limits and local-only migration deployment boundary.

### Invoice payment terms

`GET /api/settings/payment-terms` reads saved named terms for one authorized company
and returns `canCreate`. `POST` accepts `{name,days}` for admin, manager, accountant,
biller and user roles. It validates a 1–100-character name and integer days 0–3650,
locks the company, rejects duplicate preset/custom names and a 100-term limit, then
backs up the previous JSON and saves the new list in the same transaction.
`server/utils/invoice-payment-terms.ts` uses existing GeneralPreference keys
`billing/payment-terms` and `payment-terms-backup`; no DDL or schema setup runs.
Request company selection is authorized by `getReadCompanyId`, independent of any
company ID in the body. Built-in date rules and Custom are supplied by the UI;
issued invoice text and due dates continue to use the existing Bill fields.

`GET/PUT /api/settings/sales-workflow` manages company-specific workflow navigation
setting in `general_preferences` (`sales-workflow/defaults`). GET returns
`{preferences:{version:1,includeInvoicing,includeAfterSales},canManage}` without writing;
absent flags default to disabled. Company & Branches owns the editor; after-sales
controls its group in both ERP and Storefront sidebars. PUT requires
admin/manager/accountant and at least one boolean `includeInvoicing` or
`includeAfterSales`; unknown fields and invalid booleans are rejected. It checks the
authorized company, locks its row, merges omitted flags from the saved value, backs up
prior JSON at `defaults-backup` and saves atomically. Generic model writes cannot
modify this preference page. Invoicing controls its workflow UI; after-sales controls
related navigation/inputs and new automatic POS/seller-order registrations. Existing
service integrity protections, document authorization, source postings and history
remain intact. See `ARCH-after-sales.md` for the component and lifecycle gates.

`GET/PUT /api/settings/billing-preferences?document=invoice|sale` manages separate
company defaults in existing GeneralPreference `invoices/defaults` or
`sales/defaults`, with prior JSON retained under `defaults-backup`. GET returns
`preferences`, `configured`, `canManage`, and invoice payment-term choices. PUT
requires admin/manager/accountant, validates version-1 text limits (5,000/10,000),
page size (3/5/10/20/30/40), summary visibility and company-owned invoice payment
term IDs, then locks the authorized company and saves/backs up atomically. Company
selection uses the authorized request header, never a body company ID. Generic
preference writes cannot bypass this API. No schema changes or posting functions run.

### Company print designs

`GET /api/settings/print-templates` returns version-1 templates and receipt/label default IDs for the authorized request company. `PUT` requires admin/manager and validates IDs, dimensions, element bounds, logo data and matching default kinds through `utils/print-templates.ts`. It updates only that company's existing preference namespace (`printer/templates`) and backs up the prior JSON under `printer/templates-backup` in one Prisma transaction. Limits: 12 templates, 40 elements each, 2 MB request JSON; images are inline PNG/JPEG data URLs after client normalization of PNG/JPEG/WebP uploads. Receipt JSON supports optional paperSize A4/A5/Letter and image placement flow/absolute; labels retain 100 x 150 mm limits. Sheet images are bounded to the first sheet. No DDL or database schema changes. `GET /api/billSale/receipt` also returns `companyId` and `printTemplate` from the bill's owning company for consistent cross-store receipt rendering.

`GET /api/settings/label-variables` returns active product/variant custom-field picker definitions for the authorized request company. `POST` accepts up to 500 combined item IDs/barcodes and returns only the catalogue-selected label values. `server/utils/labelVariables.ts` scopes item, variant and product to the request company, discards foreign category/brand/collection/purchase relations, and derives the distributor through the company-linked purchase order. The routes are read-only; no schema changes.

### Salary writes and historical rates

- `GET /api/salary/payment-options?paymentId` requires salary-manager permission and company scope. It returns active native BANK accounts and the recorded native bank for an optional historical payment. Payout/edit `bankAccountId` now selects a native account, validated and snapshotted by `staff-payment-account.ts` in the source transaction; it is never written into legacy bank foreign-key columns.

- All salary mutation routes require admin/manager/accountant and authorized company scope. Generated SalaryConfig, SalaryPayment, PayrollCycle, PayrollCycleLine and PayrollAdjustment mutations are denied.
- `GET /api/salary/config?userId` returns the selected staff config and minimum effective date. POST appends a validated immutable rate version; dates must follow previous versions and saved payroll periods, and cannot precede today. `POST /api/salary/adjustment` creates validated pending additions/deductions or cancels/deletes pending records within the company.
- `server/utils/salary-input.ts` validates public money/date/type/mode inputs. Public payment/edit requests reject internal ledgerAmount/cycle linkage overrides. Internal settlement writers validate company/user/cycle ownership before posting.
- Payroll run and clear-cycle use one serializable Prisma transaction for ORM records and SQL ledger writes, through `server/utils/payroll-transaction.ts`. Company row locks coordinate salary writes. Reruns preserve line IDs and processed adjustments for that cycle; removing settled lines returns 409. Posting failure rolls back the cycle and all its postings.
- `server/utils/salary-history.ts` resolves daily salary and sale-date commission versions while full-period attendance allowances remain intact. Legacy current rates provide a baseline, not recovery of previously overwritten values. Additive schema migration: `20260930120000_salary_rate_history`.
- Cycle deletion preserves actual payments, clears their cycle links and normalizes their salary-ledger debit to actual cash after removing internal settlements. The UI requires confirmation.

### Staff credit writes

`POST /api/users/credit-ledger`, `PUT /api/users/credit-ledger/:id` and DELETE require admin/manager/accountant and authorized company scope. POST/PUT use `user-credit-input.ts`: userId, CREDIT/PAYMENT, finite positive amount (maximum 999999999, two decimals), CASH/BANK, real transactionDate YYYY-MM-DD (2000-2100), optional note up to 1000 characters. Source is always MANUAL with null sourceId and derived ledger/money directions. Custom direction, non-manual source, sourceId and createdAt overrides are rejected. PUT preserves staff identity and an unchanged transaction date's original timestamp. The database transactions retain the staff ledger and linked money source atomically with native Staff Accounting triggers. They no longer write the legacy account ledger. GET transaction rows include userId for editing.

### Company holidays

- `GET /api/users/holidays?year` validates an integer year from 2000 through 2100 and retains authorized company-list fanout.
- POST creates a dated holiday; `PUT /api/users/holidays/:id` updates date/name within its authorized company; DELETE removes within that company. Mutations require admin/manager/accountant. `server/utils/holiday-settings.ts` validates real local calendar dates and optional names up to 120 trimmed characters. Duplicate company/date writes return 409; updates to missing or foreign-company records return 404.
- POST no longer upserts, so adding a duplicate cannot silently erase an existing holiday name. The legacy `POST /api/users/holidays/bulk` returns 410 without writes; recurring weekly offs are configured through shifts.
- Generated CompanyHoliday mutations are denied by the authoritative schema. Existing dates and payroll policy semantics remain unchanged.

### Shift policies and leave

- `POST /api/users/shifts` and `PUT /api/users/shifts/:id` validate `server/utils/shift-settings.ts`'s full shift payload, including `policy` and `effectiveFrom`. Creates default a missing effective date to today; edits require an explicit later version date. Edits append immutable JSON snapshots in a serializable transaction. Roles: admin/manager/accountant; all ownership comes from `useCompanyRequestSession`.
- `POST /api/users/leaves`, `PUT /api/users/leaves/:id` and DELETE require management roles and company ownership. POST/PUT accept CASUAL/SICK/EARNED/OTHER/COMP_OFF, half-day increments, valid ranges and a decision status. Overlapping pending/approved applications are rejected within a serializable transaction. Reject/cancel remains available without deleting history.
- `GET /api/users/leave-balances?userId&date` returns type allowances/usage and available compensatory days for the selected company. Users may read their own balance; managers may read others. Pending applications do not reserve entitlement.
- `server/utils/shift-calendar.ts` replays effective-dated shifts, completed off-day attendance, company holidays and approved leave. `server/utils/payroll.ts` applies break pay, automatic classifications, missing-checkout rules, fractional paid/unpaid leave and extra holiday/weekly-off pay. The payroll runner reads historical inputs to preserve allowance usage across separate payroll periods and validates calculation before saving a cycle shell.
- `POST /api/attendance/punch` can close the previous night's open shift within its grace period, or reuse the previous night attendance for a break return before shift end. The new log is timestamped now; ownership checks remain unchanged.
- Schema/rollout: `scripts/SHIFT-POLICY.md`; additive migration `20260929160000_shift_policy_scenarios` is required before the new generated client is used against a database.

### Attendance calendar and requests

- `GET /api/attendance/calendar?year&month` uses authorized company-list fanout to return overlapping shift assignments (latest-effective first), holidays and approved leave date/duration metadata. It supplies monthly display context, not payroll calculations.
- `POST /api/attendance/request` accepts optional id, userId, date, local dateAnchor, checkIn/checkOut, nextDay and reason. `DELETE /api/attendance/request` accepts id and records CANCELLED. Both use serializable transactions; only pending requests may change, staff identity is immutable on edit, and non-management staff can write only their own requests. Management roles are admin/manager/accountant. Generated AttendanceAdjustment mutations are denied.
- `/api/attendance/import` enforces management role before reading the workbook. Existing overwrite semantics remain unchanged.

### Attendance writes

All new attendance endpoints resolve authorized company ownership through `useCompanyRequestSession`.

| Endpoint | Contract |
|---|---|
| `POST /api/attendance/punch` | `{ userId, date, dayAnchor, type }`; `date` is YYYY-MM-DD, `dayAnchor` is local midnight with an explicit UTC offset, and `type` is CHECK_IN/CHECK_OUT. Only the current local day is accepted. Staff can punch themselves; admin/manager/accountant can punch others. Validates active company membership and alternating punches, then atomically updates attendance and creates the live log. |
| `POST /api/attendance/manual` | Management roles; `{ id?, userId, date, dayAnchor, status, checkIn, checkOut, nextDay?, shiftId?, note? }`. HH:mm times, optional next-day checkout. Create rejects existing day entries; edit verifies the existing company/staff/day identity. Resolves an omitted shift from assignments. Updates summary and boundary logs in a serializable transaction, preserving intermediate breaks and rejecting conflicting boundaries. |
| `DELETE /api/attendance/manual` | Management roles; `{ id }`. Deletes only an attendance owned by the selected authorized company; FK cascade removes logs. Adjustment requests remain. |
| `POST /api/attendance/decision` | Management roles; `{ id, status: APPROVED or REJECTED, note? }`. Requires a pending company-owned request. Approval updates attendance, boundary logs and decision together in a serializable transaction; rejection updates only the decision. |

`server/utils/attendance-write.ts` owns strict calendar/time validation, browser-local midnight parsing, company staff/shift checks and boundary-log correction. Existing generated request CRUD and biometric import are separate flows. No new persistence models were added. Attendance changes affect subsequent payroll calculations; existing payroll cycles require their normal recalculation flow.

### Recurring expenses

`/api/accounts/recurring-expenses` GET/POST lists or creates fixed monthly schedules
for `useCompanyRequestSession`'s authorized company. `/:id` PUT edits future values and
PATCH toggles `active` without overwriting dates/amounts. Both constrain writes by company.
Categories are checked and locked within the save transaction; amounts use the shared
expense-tax validator. POST `/process` generates due entries only for that company.
GET `/api/cron/recurring-expenses` requires `CRON_SECRET` bearer authentication and
processes active companies globally. It returns a 500 when any occurrence fails; successful
occurrences stay committed. Both processors return created/failed/remaining counts
(on cron failure these are in error data). `server/utils/recurring-expenses.ts` owns the
bounded, atomic processor. See `ARCH-pages-erp.md` for scheduling, setup and retry semantics.

### Independent Accountant API

Distributor profile form routes use the same authenticated company context and
`runAccountant` transaction while retaining ordinary supplier profile permissions:

| Route | Contract |
|---|---|
| `GET /api/distributor/form?id?` | Read-only profile/opening/account options for one authorized company. An edit requires an existing company-distributor membership. Admin/manager/accountant responses include active company accounts, company purchase defaults overlaid by saved supplier mappings, and enabled status; other roles receive profile-only data. No setup or journal writes on load. |
| `POST /api/distributor/save` | Atomic profile/address/membership/numbering save through `distributor-form.ts`. Only admin/manager/accountant may submit accounting selections, and those roles must choose all six compatible active same-company purchase accounts. Existing supplier mappings overlay company fallbacks. Already-connected suppliers update configuration without another import; unconnected suppliers configure and run the existing history import/reconciliation inside the same company-locked transaction. Failures roll back all changes. Other authenticated roles retain profile-only saves. The audit stores the previous profile/address/opening/mappings; edits upsert the existing address and update the linked vendor contact. Uses existing tables/functions, with no runtime DDL. |

`server/api/accountant/[...path].ts` serves the new `/api/accountant/*` namespace.
It resolves `useCompanyRequestSession`, restricts roles to admin/manager/accountant,
and dispatches through the local route registry in `server/utils/accountant/router.ts`.
The registry adapts the Contractor Accountant request/response handlers to Nitro;
it does not mount an Express app. No legacy accounting endpoint is redirected.

| Relative resource | Operations / owner |
|---|---|
| `accounting-accounts` | List/default chart, create, patch, delete unused accounts, `:id/status`, `:id/ledger`; `accounts.ts` |
| `manual-journals` | List, next number, source lookup, detail, create/edit/delete draft, approve/publish/reverse; `journals.ts` |
| `account-transfers` | List, next number, create/edit/delete with source journals; `transfers.ts` |
| `money` | Receive/pay options, list, immediate journal posting and reversal; `money.ts` |
| `investors` | GET list with asOf, options, users, ledger and :id (read-only ownership/event history); GET/PUT share-settings (includeShares, fixed totalShares; manager/admin writes). POST profile (userId/newUser, effectiveDate, optional requestId; ownershipPercent/profitPercent in percentage mode), PUT :id updates details/accounts and optional dated percentages. Share-mode profiles start at zero shares. GET :id/capital-preview accepts date, kind, amount for purchases or shareQuantity for redemptions, and pricePerShare + paymentStatus (PAID/DUE/PARTIAL with paidAmount) for a new share trade, or settleTradeId + amount for a due payment. GET :id/share-dues?asOf= returns trade value, paid, due and status. POST :id/events saves normalized previewHash, ownership and optional confirmed linked cash atomically; share trades require manager/admin. POST :id/reverse/:eventId reopens a due for payment reversals; trade cancellation restores units only after payments are reversed and dependency/allocation checks pass. Legacy initialAgreement and term mutation routes reject with replacement-flow instructions; historic terms remain readable. Share dues are distinct from old capital commitments. Share-only events have no journal; only confirmed settlements affect Capital. Summaries include shareCapitalDue/shareRedemptionDue. Creation/percentage edits validate tenant/company totals; existing roles and account mapping protections remain. |
| `investor-profits` | GET `profit?periodFrom=&periodTo=`, POST `preview` (period + distributable), POST `approve` (period, distributable, date, previewHash, requestId, optional note), GET `history`, GET/PUT `settings` (accountId). Computes posted book profit and atomically allocates all active investor shares; `investor-profits.ts`. Approval/settings writes require manager/admin. Preview changes, missing/changing terms, overlapping periods and excessive amounts are rejected. This router has a 120-second transaction timeout for multi-investor batches. |
| `account-settings/investment-defaults` | POST initializes missing investment and loan account defaults from standard company codes, creating missing accounts in company currency. Preserves valid custom defaults and existing investor mappings, audits account creation and configuration before/after, and posts no journals. Uses the accounting write gate, request transaction and company lock; GET options remain read-only. Investor creation also fills missing purpose defaults server-side. |
| `loans` | GET list (readiness, currency and positions), GET `options`, POST `preview`, POST loan (immediately records receipt and opens the loan), GET `:id`, PUT `:id` (completes an older unposted draft and records its receipt on save), POST `post-due`, `pay`, `settle`, `reverse-payment`; `loans.ts`. Save/post/payment use the Accountant gate with no separate approval. Settlement and payment reversal require manager/admin. Legacy `:id/validate` and `:id/cancel` remain manager-only compatibility routes for old drafts. Cash requests and repeated saves are retry-safe. Company-locked writes have a 120-second timeout; GETs never post. Dedicated tables require `20261102120000_loan_management`; list returns `ready:false` until installed. |
| `parties`, `projects` | Independent directory list/create; `directories.ts` |
| `accountant-management` | Bootstrap, details/sub-accounts/activity/credits, templates, recurring profiles/generate/toggle, budgets/actuals, locks/unlock, openings, assets/categories/depreciation/disposal, currency drafts/publish, year-end journals, preferences, engagements and bulk account updates; `management.ts` |

`context.ts` resolves every model operation through request-local AsyncLocalStorage
and the same Prisma transaction, injecting company predicates. All requests take a
company advisory lock, including default/preference bootstrap reads that may create
records. Mutation auditing commits with the operation. `posting.ts` validates balanced
two-decimal lines, active account ownership, optional contact/project ownership,
accounting periods and approvals. `reporting.ts` converts journal amounts to company
base currency for reporting. Schema changes are exclusively the new `Accountant*`
models in `schema.zmodel`; generated CRUD denies all access to these models.

See `ARCH-pages-accounts.md` for rollout boundaries, UI behavior, operational setup
and verification. Existing sales, expenses, purchases, payroll and statements do
not call this API during the independent adoption phase.

`GET /api/cron/loans` requires the existing `CRON_SECRET` as a Bearer token
(constant-time comparison, minimum 16 characters). The Vercel schedule is daily
at 01:30 UTC. It discovers open loans in the configured schema and runs each loan's
due charges/reclassifications/reversals in its company-locked transaction. It
returns per-loan failures for review, never posts future entries, returns
`ready:false` before installation, and performs no DDL.

### Prisma clients

| File | Export | Notes |
|---|---|---|
| `server/prisma.ts` | `prisma` - bare `PrismaClient` | No payment middleware is registered. The unused supplier-payment middleware was removed; it referenced the nonexistent `PurchaseOrder.paidAmount` field. |
| `server/utils/prisma.ts` | `prisma` — `PrismaClient` with `$use` middleware | Auto-creates `Notification` rows on `Bill.create` (`ORDER_RECEIVED`) and `Expense.create` (`EXPENSE_CREATED`). Use this import when notifications should fire. |
| `server/db.ts` | `pool` — `pg.Pool` | Shared raw SQL pool, `DATABASE_URL` env var. Used by most routes needing raw queries. |

**Critical:** Routes importing from `~/server/prisma` do **not** get auto-notifications. Routes importing from `~/server/utils/prisma` do.

### Middleware (global Nitro middleware)

| File | Behavior |
|---|---|
| `server/middleware/cors.ts` | Adds CORS headers for Capacitor origins (`capacitor://localhost`, `http://localhost`, `http://localhost:3000`). Handles OPTIONS preflight (204). |
| `server/middleware/force-logout.ts` | On every request (except `/api/clientauth/*`): checks `session.authSessionVersion` against `AUTH_SESSION_VERSION` env var. Mismatch → deletes `nuxt-session` cookie + redirects to `/login`. Used to force re-login after breaking session schema changes. |

### Utils

| File | Export | Description |
|---|---|---|
| `server/utils/otp.ts` | `generateOtp()` | Returns 6-digit random number string (`Math.floor(100000 + Math.random() * 900000)`) |
| `server/utils/mailer.ts` | `sendEmailWithOtp(to, otp)` | Sends OTP email via nodemailer using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`. Port 465 uses implicit TLS; the sender is `SMTP_USER`. |
| `server/utils/generateSign.ts` | `generateSign(requestOption, app_secret)` | TikTok Shop HMAC-SHA256 request signing: sort params alphabetically → `{path}{params}{body}` → wrap with `app_secret` → HMAC-SHA256 hex. |
| `server/utils/tiktokDB.ts` | `updateCompanyForTiktok(...)` | Updates `Company` row with TikTok OAuth tokens (`tiktokAccessToken`, `tiktokRefreshToken`, `tiktokCipher`, `tiktokStoreName`, expiry fields). Uses `server/prisma` (bare). |
| `server/utils/cleanUpDel.ts` | `applyBillDeletionCleanup(opts)` | Hard-deletes bills and re-sequences invoice numbers. Renumbering is set-based raw SQL (`UPDATE ... FROM` with `ROW_NUMBER()`) so cleanup does not issue one update round-trip per remaining bill. Bug fixed: inner `prisma.bill.update` changed to `tx.bill.update` to correctly participate in the Prisma transaction. |
| `server/utils/cleanUpGet.ts` | `previewBillsForReduction(opts)` | Dry-run: finds bills matching cleanup criteria. Returns the existing deletion plan plus `reductionPlan` / `reductionAmount` for exact amount-reduction cleanup. Reduce preview accepts repeatable `reductionRules[]` (`fromAmount`, `toAmount`, `reducePercent`); `toAmount = 0` means no upper limit, and each bill uses the first matching rule by bill total. Bug fixed: `timePref` was not used in `orderBy` — now applies `{ createdAt: timePref === 'oldest' ? 'asc' : 'desc' }`. Also adds `precedence: { not: true }` to exclude already-soft-deleted bills from candidates. |
| `server/utils/cleanUpReduce.ts` | `applyBillReductionCleanup(opts)` | Cleanup amount-reduction utility. Requires schema-owned `original_*` columns and locks/rejects bills with receipt history; stores first real bill/entry amounts (`bills.original_subtotal`, `bills.original_grand_total`, `bills.original_discount`, `entries.original_rate`, `entries.original_value`, `entries.original_discount`), then lowers `entries.rate`, `entries.value`, `bills.subtotal`, and `bills.grand_total` from the preview `reductionPlan`, recalculates `entries.tax` from the linked category tax config using the reduced per-unit value (`value / qty`), and sets visible bill/entry discounts to `0`. Treats `0` snapshot values as missing so accidental zero originals are backfilled from the current real value before reduction. |
| `server/utils/cleanUpSoftDel.ts` | `applySoftBillDeletionCleanup(opts)` | New utility. Sets `precedence = true` on matched `bills` and their `billHistories`, then re-sequences invoice numbers for remaining non-soft-deleted bills with one set-based raw SQL update. |
| `server/utils/db.ts` | — | Additional DB helpers for server routes |

### WebSocket server

**`server/ws/server.ts`** — standalone `ws` WebSocket server on **port 3003**.

- `clients: Map<companyId, Set<WebSocket>>` — tracks connected clients per company
- Connection: client must pass `?companyId=` query param, else closed with code 4001
- `broadcastToCompany(companyId, notification)` sends `Notification` JSON to open company sockets. No active notification API route imports it.
- Cleans up empty company sets on disconnect

Legacy standalone module. The active `useNotifications` client refreshes through authenticated REST instead.

---

## Nuxt API Routes (`storetools/server/api/`)

All files under `storetools/server/api/`. These are Nuxt H3 route handlers, **distinct from the Express `server/` folder**.

Auth: most routes call `useAuthSession(event)` and read `session.data.companyId`.

### Branch management

| Route | Method | Behavior |
|---|---|---|
| `branches` | GET | Returns the selected company and its direct branches. |
| `branches/head-office` | POST | Checks active admin membership and marks a root company as a head office. |
| `branches` | POST | Checks active head office admin membership and creates a branch company, owner membership, input defaults, expense category, and pipeline in one transaction. |

`POST /api/auth/switch-company` is in the auth Nuxt layer; it checks active user membership or head-office admin access before rebuilding the company-scoped session.
`GET /api/auth/accessible-companies` lists permitted companies. Only admins of the actual active head office receive direct active branch access. `POST /api/auth/switch-company` changes the actual sidebar/session company; `keepOrganization` is rejected. The obsolete `read-scope` and `view-scope` endpoints return 410.

`useCompanyScope.ts` and `useCompanyFetch.ts` send `x-company-filter` (one ID or `*`) for table reads and `x-company-id` for form/row operations. `organizationReadScope.ts` expands `*` to authorized IDs and authorizes URL `companyId` selections for single-company exports. Invalid array filters are rejected. `organizationModelScope.ts` caps generated reads and included company-owned lists without broadening explicit filters. Generated writes validate ownership/relations inside a serializable transaction with a 30-second execution deadline and a 15-second maximum connection wait. `company-request.ts` checks custom SQL request relations, rejects conflicting header/query/body ownership and retains the selected company in request context; `lockCompanyRequest.ts` holds referenced ownership locks through writes. `companyRequestScope.ts` supplies company-owned settings and selected account defaults without changing the login session. Daily, GST, Summary, Users and Dashboard use one-company selectors; Accounts, Profit and Online support table filters.

The seller `/api/model/*` endpoint requires authentication before constructing the enhanced client. BillHistory reads inherit the optional bill's company; generic history mutations and generic Company hierarchy changes are rejected. Nested company mutations through another model are rejected; use company settings or the branch APIs. Existing BillHistory detail pages resolve the bill owner through `/api/organization/context`. Orphan history has no authorized company scope. Bill creation and bill-edit loading no longer issue runtime `ALTER TABLE`; schema changes belong in `schema.zmodel`.

`POST /api/coupons/generate` requires an authorized request company and a customer membership in that company. Coupon candidates and combined bill totals are company-scoped. Notification list/read-all/individual-read endpoints authorize their company; notification creation authorizes the company and uses the authenticated sender, and push notification sends authorize the target company. Cleanup requests additionally require the cleanup session flag.

`GET /api/organization/context` returns an authorized company settings whitelist; model/id lookup resolves existing form ownership from the database. `POST /api/organization/transfer` accepts a preview or confirmed transfer. `companyTransfer.ts` discovers dependent records from schema relationships and logical ledger source IDs, returns explicit destination mapping requirements, and fingerprints the preview. Confirmation locks company counters and affected records, checks the fingerprint/mappings, moves linked documents, allocates destination numbers, reuses supplier/customer identities through destination links, adjusts stock and customer points, and recalculates source/destination account and staff ledgers. Supplier invoice references are retained. After moving linked documents, each transferred PO registers its header as the destination company purchase source; no PO-linked DC is needed. Failures roll back the transaction; serialization/deadlock conflicts return 409 for a fresh preview. Transfer confirmation moves the saved record immediately; forms reload or close afterward.

Verification: `npm run test:company-scope` exercises request filters/authorization and real PostgreSQL transfer fixtures, including missing mappings, insufficient-stock rollback, stale preview rejection, stock/ledger reconciliation, purchase-return stock reversal, and linked payment/expense create-update-delete handlers. Fixtures are rolled back. `scripts/check-company-scope.mjs` checks changed Vue/TypeScript syntax.
`npm run test:branches` is the database-free branch regression entrypoint (shared scopes, 133 model read boundaries, history ownership, API rejections, all-page syntax and real Chrome company controls). The read-only report API/export suite is `node --import tsx --test tests/report-pages.integration.test.ts`. Other integration suites must be inspected before execution; some older accounting/report fixtures create schemas and remain prohibited.
`node --import tsx --test tests/branch-readonly.test.ts` checks an existing active head-office admin and its branches using SELECT-only inspection: accessible companies, request filters, URL selection, generated model counts and outside-company rejection. It skips without creating fixtures when no existing head-office admin is available.
DB: routes use either `pool` from `~/server/db` (raw SQL) or `prisma` from `~/server/prisma` / `~/server/utils/prisma`.

---

## Infrastructure (shared)

| File | Purpose |
|---|---|
| `~/server/db.ts` | `pool` — `pg.Pool` for raw SQL (accounts/ledger/bill routes) |
| `~/server/prisma.ts` | `prisma` - bare `PrismaClient`; no payment middleware is registered |
| `~/server/utils/prisma.ts` | `prisma` (separate instance) with `$use` auto-notification middleware: creates `Notification` on Bill.create (ORDER_RECEIVED) and Expense.create (EXPENSE_CREATED) |
| `~/server/ws/server.ts` | Legacy raw `ws` WebSocket on port 3003; no active notification API caller |
| `~/server/middleware/cors.ts` | CORS: allows Capacitor + localhost origins; OPTIONS preflight |
| `~/server/middleware/force-logout.ts` | Compares `session.authSessionVersion` vs `AUTH_SESSION_VERSION` env; deletes cookie + redirects on mismatch |

---

## accounts/

Cash and bank ledger calculations. Auth via `useAuthSession`. Uses `pool` (raw SQL).

| Route | Method | Description |
|---|---|---|
| `accounts/cashledger` | GET | Cash ledger: `?from=&to=`. Reads persisted `account_ledger_entries` for `accountType=CASH`, computes opening from rows before `from`, and returns `{ cash, from, to, ledger[], closingBalance }` with stored `balanceAfter`. |
| `accounts/primaryledger` | GET | Primary bank ledger: `?from=&to=`. Reads persisted `account_ledger_entries` for `accountType=PRIMARY_BANK` and returns company bank metadata plus ledger rows. |
| `accounts/secondaryledger` | GET | Secondary bank ledger: `?from=&bankId=&to=`. Reads persisted `account_ledger_entries` for `accountType=BANK` + `accountId=bankId`. |
| `accounts/transactions*`, `accounts/transfers*`, `accounts/investments*`, `accounts/banks*`, `accounts/primary-bank`, `accounts/opening-balances` | POST/PUT/DELETE | Read-only archive: scoped HTTP 410; use native Accountant. Expense APIs remain active source writes and native ERP postings. |
| `accounts/primary-bank` | PUT | Updates primary bank details/opening balance and rebuilds the primary-bank opening ledger row. |
| `accounts/opening-balances` | PUT | Updates company cash + primary-bank opening balances/dates from settings and rebuilds both opening ledger rows. |
| `accounts/cash-ledger.pdf` | GET | PDF export of cash ledger. Fetches `/api/accounts/cashledger` via `$fetch` then generates jsPDF A4 with autoTable. Returns `application/pdf` |
| `accounts/bank-ledger.pdf` | GET | PDF export of primary bank ledger. Fetches `/api/accounts/primaryledger` then generates jsPDF A4. Returns `application/pdf` |

---

## bill/

Invoice issuance is an optional `payload.billingMode='invoice'` on `bill/create`.
It requires a linked customer, positive total, full Credit tender, due date,
optional `invoicePaymentTerms` and `subject` (customer reference), plus enabled ERP
Accounting with an active receivable mapping. `invoice-flow.ts` validates these in
the existing transaction, forces `BILL/PENDING` and writes the existing invoice
fields. The update route preserves/validates invoice details for marked invoices.
No schema/posting-function changes or payment creation occur during issuance.

Billing (POS) operations. Core transaction routes.

| Route | Method | Auth | Description |
|---|---|---|---|
| `bill/create` | POST | company-scoped | Parameterized source DML in `create-bill-source.ts`, inside the handler's ownership-locked, idempotent transaction. Inserts bill/entries, applies entry-derived stock, staff credit, loyalty and coupon effects. Native triggers retain invoice numbering and financial posting; no stored create function or runtime schema setup. Combined coupon spending is restricted to its owning company. Returns `{ success, billId, invoiceNumber, generatedCoupons }`; changed retries return 409 and transient failures retain transaction retries. |
| `bill/offline` | POST | session | Stock-only update: `{ requestId, items, returnedItems, companyId }`. Changes `items.qty` and `sold_qty` equally in opposite directions in one transaction, including net negative sold quantities after returns; enabled stock-control triggers post inventory adjustments. A durable request receipt prevents duplicate stock/native valuation on identical retries; changed details under the same ID return 409. Verified by rollback sidebar regression. Uses `pool` from `~/server/db` |
| `bill/update` | POST | session | Full bill edit in a raw SQL / pg transaction. **Batched (O(1) round-trips):** one batched SELECT of old entries, one bulk entry `UPDATE … FROM unnest(...)`, one bulk stock `UPDATE`, one batched DELETE — instead of per-row queries. Creates new entries, updates existing, prunes removed, adjusts stock, updates bill header (including separate `account_id` and `credit_user_id` credit-party columns), syncs the linked `user_credit_transactions` BILL/CREDIT row when staff credit is present or removes it when staff credit is cleared, reconciles loyalty points, and creates earned GENERATE coupon vouchers (`coupon_clients`, single-use). Returns `{ success, generatedCoupons }`. |
| `bill/status-history` | GET | session + authorized company read scope | `?id=&type=bill\|order\|checkout` (type defaults to bill). Returns `{ document: { id, companyId, paidAt } \| null, history }`. History includes sequence (string), field, previousStatus, status, changedAt, source and actorId; ordered by sequence. A deleted document can have retained history and a null document. Missing/out-of-scope records return 404; invalid type/id returns 400. Requires the document-status-history migration. |
| `bill/createAccount` | POST | — | Creates B2B `accounts` record + optional `addresses` row in transaction. Body: `{ name, phone, address?, companyId }` |
| `bill/findBillCounter` | POST | session | Atomically increments `companies.bill_counter`, stores in session, returns value. **DEPRECATED / no longer called** by `billing.vue` — invoice numbers now come from the `bills` BEFORE INSERT trigger (`trigger_generate_invoice_number`). Endpoint left in place but unused. |
| `bill/by-barcode` | GET | session | Barcode lookup for billing page: `?barcode=`. Returns `{ id, size, qty, variant: { id, name, sprice, product: { name, categoryId } } }` or null. Uses raw SQL |
| `bill/findFirstItem` | GET | session | Full barcode scan for POS: `?barcode=`. Returns item with variant + category tax config (taxType, fixedTax, thresholds). More detailed than `by-barcode` |
| `bill/searchItems` | GET | session + selected company access | Quote item typeahead: `?q=&limit=3&field=all`. Field accepts all/barcode/product/variant/brand/category/subcategory/collection. Specific fields match only their name/barcode; Brand matches product and variant brands. All combines them with barcode-first ranking. Positive stock and active product/variant required; catalog joins are company-scoped. Returns Prisma-like item rows plus variant/product brand and product collection names. Limit is a positive integer capped at 10; unknown fields return 400. Uses `server/utils/quote-product-search.ts`. |
| `bill/redeemClientPoints` | POST | — | Redeem or revert client loyalty points. Body: `{ companyId, clientId, points, mode: 'redeem'\|'revert' }`. `redeem` uses `AND points >= $3` guard. Returns updated `points` |
| `bill/findManyAccount` | GET | — | Lists accounts for company: `?companyId=` returns `[{ id, name, phone }]`. With `includeUsers=true`, returns grouped selector rows with account ids prefixed as `account:<id>` and staff ids as `user:<userId>`; user labels include `Name (code)` so code search works in POS/edit account selector. |
| `bill/findManyCategory` | GET | — | Lists active categories: `?companyId=`. Returns `[{ id, name, hsn }]` |
| `bill/findManyCoupon` | GET | — | Active coupons for company (within valid dates, `isActive=true`): `?companyId=`. Returns full coupon including `giftBarcode`, with `clients[]` from `coupon_clients` (each row includes `usageLimit` for generated-voucher remaining balance) and `used_clients[]` from `coupon_usages` |
| `bill/findUniqueClient` | GET | session | Client lookup by phone: `?phone=`. Returns `{ id, name, email, phone, companies: [{ points }] }` or null |
| `bill/findManyClient` | GET | session | Client lookup for billing/edit and after-sales. An omitted/blank `q` lists the first 20 company-linked, non-deleted clients by name; `?q=` searches name or normalized phone digits, returning up to 5 rows with exact matches first. Raw SQL joins `clients` + `company_clients`, scoped through the authenticated company request context. Response shape: `[{ id, name, phone, email, points }]` |

---

## billEdit/

Bill edit page data helpers.

| Route | Method | Description |
|---|---|---|
| `billEdit/findUniqueBill` | GET | Full bill data for edit page: `?billId=&companyId=`. Returns bill + address + client + entries + coupon usage via raw SQL. Entries include item/variant shape |
| `billEdit/findEntriesToDelete` | POST | Entries to delete for a bill: `{ billId, companyId, excludeEntryIds? }`. Returns entries not in `excludeEntryIds`. Used to find stock to restore on edit |
| `billEdit/deleteBill` | POST | Soft-delete bill and reverse stock/loyalty/coupon/staff-credit effects in one transaction. Body: `{ billId, companyId }`. Returns 404 if already deleted. Uses shared `server/utils/bill-stock.ts` (see lifecycle contract below). |

---

## billSale/

`POST /api/billSale/findManyBills` powers the unified Sales table. Optional
`salesView=all|paynow|invoices|unpaid` (default all) uses `server/utils/sales-view.ts`
to filter both paginated rows and matching totals. `dateFilter=all|range` defaults
to range, preserving older/online callers. All skips issue-date filtering and uses
all dates for the independent collection total. Rows include due/terms/subject,
amountReceived, balanceDue, overdue and sendStatus. Totals additionally include
received/balance/overdue. Collections remain independent of tab and sales filters.
Invoice-code/subject/customer nonnumeric searches are parameterized; sorts are
allowlisted, including due date and receipt-derived received/balance. No source,
stock, journal or schema writes occur. `billSale/invoices` remains available for
the payment and retainer pickers; its separate page redirects to unified Sales.

| Route | Method | Description |
|---|---|---|
| `billSale/invoices` | GET | Authorized table-company scope; `q`, `state` (unpaid/partial/paid/overdue), issued `from`/`to`, `min`/`max` total, `page`, `pageSize`, allowlisted `sort` and `order`. Returns `{rows,total,summary}` with invoice/customer/due data, receipt-derived balances and sending status. `collectible=1` additionally includes outstanding legacy customer Credit/Split bills for the payment picker. Staff/marketplace/deleted/cleanup-hidden sources are excluded. |
| `billSale/payments` | GET | Authorized company receipt history with `q`, optional payment `from`/`to`, `min`/`max` amount, receipt `status`, `page`, `pageSize`, allowlisted `sort` and `order`. Returns `{rows,total,summary}`; active/reversed receipts retain receiving account/method/date and references. Summary received/count exclude reversed receipts; reversed amounts have their own total. |

`server/utils/invoice-lists.ts` builds these SELECTs. `receiptData.ts` enriches
marked invoice documents with terms/reference, due date and current balances.
Bill source create/update also persist the existing numeric `adjustment` field;
invalid signed amounts reject. Update preserves it when omitted. Bill edit and
receipt reads return it independently of `discount` / `discountType`, and receipt
reads preserve historical surcharge semantics.
Saved receipt data includes coupon value, redeemed points, current available client
points, unit visibility from the owning company's variant inputs, entry sizes and
return flags, and generated vouchers scoped to the bill's company/client. Signed
receipt row/totals mapping is shared with billing and bill edit. The Subject caption
is used consistently in invoice document footers.
Bill create/update also save existing `notes` / `terms_and_conditions` fields after
shared text validation (5,000 / 10,000 characters). Update preserves either field
when omitted. Bill edit reads, sales rows and receipt data return both fields; this applies to
ordinary bills and invoice mode. Quote preferences persist independent text-retention
booleans in their existing defaults JSON, and conversion copies only selected text
to draft/issued invoice snapshots and Bill fields. Email uses the issued Bill text.
`server/utils/document-list.ts` validates paging (pageSize defaults to 20, maximum
500 for exports), dates, amount bounds and sort options. Filters precede sorting
and pagination; summary amounts cover the complete filtered result. India-day
boundaries apply to invoice/payment timestamps. Quote list uses `quote-list.ts`
with the same controls and `{rows,total,summary}` response, plus quote status and
date-only quote dates; it retains its single owning-company scope.
`whatsapp/send-payment-template` records accepted/failed invoice sends in the
existing audit table (`resource='invoice-send'`, owning bill `resourceId`). Its
delivery status is separate from payment state. If provider acceptance succeeds
but audit recording fails, the response stays successful with `trackingWarning`;
it never reports an accepted send as failed or creates a payment.

Sales list page operations.

Bill stock lifecycle (`server/utils/bill-stock.ts`): both delete routes and restore
hold the company-scoped bill row lock before reading saved entries. Quantities are
combined per item, with returns subtracting from the sale quantity. Restore adds
this net quantity to `sold_qty` and subtracts it from `qty`; deletion applies the
exact inverse. Item rows are company-scoped and locked in ID order; missing or
foreign linked items abort with 409. Entries without an item link and non-positive
quantities have no stock effect. Bill state, stock and other source effects commit
together; repeat requests in the wrong state return 404 before stock changes.
`bill/update` rejects deleted bills with 409 until restored, preventing edits from
moving stock while the original sale is reversed. Existing POS negative-stock
behavior is preserved. In-memory regression coverage:
`npx tsx --test tests/bill-stock-lifecycle.test.ts` (no database connection).

| Route | Method | Description |
|---|---|---|
| `billSale/findManyBills` | POST | Paginated, filtered, sorted bills list. Search rules (server-side): non-numeric → `clients.name ILIKE`; numeric AND fits int (≤ 2147483647) → `(b.invoice_number = N AND b.created_at > closingDate) OR c.phone ILIKE %N%` — invoice matches sorted to top via `invoice_match DESC`; numeric AND too large → `c.phone ILIKE` only. `closingDate` is read from the auth session and applies only to the invoice arm of the OR. Other filters: status, paymentMethods, min/maxGrandTotal, dateRange (date range is dropped when a search is active). Sort: invoiceNumber/createdAt/grandTotal/paymentStatus. Cleanup sessions use saved original bill/entry values where available for row values, min/max total filter, grand-total sort, and summary totals. Returns `{ rows[], total, totals, collections: { total, creditRepayments, byMethod: { Cash, UPI, Card, Bank, Cheque } } }`. Both collection totals and the method breakdown mean credit repayments only, excluding direct sale payments; method amounts retain dated reversal deductions. They use selected payment dates and authorized company IDs independently of invoice filters/pagination, including older-bill receipts and dated reversals through `billSalesSql`. Invalid or reversed date ranges return 400. |
| `billSale/deleteBill` | POST | Soft-delete bill and reverse stock/loyalty/coupon/staff-credit effects in one transaction: `{ billId, companyId }`. Returns `invoiceNumber`; already deleted returns 404. |
| `billSale/restoreBill` | POST | Restore a deleted bill from `/saleshistory`: `{ billId, companyId }`. Re-applies stock/loyalty/coupon/staff-credit effects in one transaction and returns `invoiceNumber`; an active or missing bill returns 404. |
| `billSale/receipt` | GET | Print data for a bill receipt: `?id=`. Returns formatted print payload with entries, company info, totals, UPI ID, GSTIN, tqty/tvalue/ttvalue/tdiscount. **Bug:** `console.log('SALE ENTRIES:', sale.entries)` |
| `billSale/history` | GET | `?id=&page=1` returns `{rows,total,page,pageSize:20}` for the Sales detail panel. Authorizes the bill against `getReadCompanyIds` before reading snapshots; ordinary sessions exclude precedence-marked bills/history. Rows expose snapshot ID/data/operation/changedAt and sort by changedAt DESC, ID DESC. Bill validation, count and page share a repeatable-read read-only transaction. Invalid pages return 400; absent/out-of-scope bills return 404. No schema changes or writes. |
| `billSale/updateBillNotes` | POST | Update bill notes: `{ billId, companyId, notes }` |
| `billSale/updatePaymentStatus` | POST | Scoped non-credit status correction; preserves `created_at`. Credit settlement returns 409 and directs to dated receipts. Active receipts block changing/reopening the bill; unchanged status is a no-op. |
| `billSale/share-receipt` | POST | Authenticated, authorized bill/company lookup; issues a 30-day HMAC receipt link without database writes. |
| `receipt-share` | GET | Public bearer token; validates signature/expiry and reads only its bill/company via receiptData. Returns current company receipt template; no-store response. |
| `billSale/receipts` | GET | Company-scoped `?billId=` returns outstanding, immutable payment history and active native CASH/BANK choices. Only active customer POS credit bills are supported. |
| `billSale/receipts` | POST | `{ billId, amount, paymentDate, paymentMethod, accountId, reference?, requestId, companyId? }`. Validates amount/date/account, locks the bill, inserts Payment + published balanced receipt journal and derives PENDING/PAID. Retains invoice date/method/splits and uses durable idempotency. Requires a posted ERP receivable source. |
| `billSale/reverseReceipt` | POST | `{ billId, receiptId, paymentDate, reference?, requestId, companyId? }`. Admin/manager/accountant only. Posts opposite journal on reversal date, retains original receipt/journal, marks source receipt reversed and reopens due. |
| `billSale/updatePaymentMethod` | POST | Scoped original-tender correction with a bill lock. PAID/PENDING customer Credit/Split bills can be corrected once all active collections are reversed, or immediately if none exist. Zero remaining original credit derives PAID, otherwise PENDING. Active receipts return 409 with `data.code=BILL_RECEIPTS_REQUIRE_REVERSAL`, shared with delete guards, so Sales opens reversal first. Reversed receipts/journals remain intact and no longer block correction. Staff credit still uses its source workflow. |

---

## cart/

Store frontend cart persistence (customer-facing e-commerce).

| Route | Method | Description |
|---|---|---|
| `cart/get` | GET | Get cart items: `?companyId=&clientId=`. Returns `{ items }` from `CartCompanyClient.cart.items`. Uses `utils/prisma` |
| `cart/update` | POST | Upsert cart: `{ companyId, clientId, items }`. Creates `CartCompanyClient` + `Cart` if not exists. **Bug:** `console.log('Cart updated:', cart)` |
| `cart/merge` | POST | Merge guest (local) cart with server cart after login: `{ guestItems, companyId, clientId }`. Adds quantities for matching variantId+size. **Bug:** `clientId` defaults to hardcoded UUID `'1db12f74-...'` as fallback |
| `cart/index.ts` | — | Index file (re-export or placeholder) |

---

## category/

| Route | Method | Description |
|---|---|---|
| `category/stock-by-category.pdf` | GET | PDF report: stock quantity grouped by category + subcategory. Auth required. Generates jsPDF A4 with alternating row shading. Returns `application/pdf` |

---

## cleanup/

| Route | Method | Description |
|---|---|---|
| `cleanup/getCleanupBill` | POST | Preview bill cleanup (dry-run). Delegates to `previewBillsForReduction(body)` from `utils/cleanUpGet`. Already-soft-deleted bills (`precedence = true`) are excluded from candidates. Returns both deletion fields (`deleteBillIds`, `leastInvoice`) and amount-reduction fields (`reductionPlan`, `reductionRules`, `reductionAmount`, `reductionRemainingAmount`, `reducedBillsCount`). `reductionRules[]` caps how much each eligible bill can be reduced by amount range; legacy/default behavior is one `0, 0, 100` rule. |
| `cleanup/deleteCleanupBill` | POST | Execute bill cleanup. Accepts `deleteType: 'soft' \| 'permanent' \| 'reduce'` in request body. Routes to `applyBillReductionCleanup` when `deleteType === 'reduce'`, `applySoftBillDeletionCleanup` when `deleteType === 'soft'`, else `applyBillDeletionCleanup` (hard delete + renumber). Delete paths batch invoice resequencing into a single SQL update instead of per-bill Prisma updates. |
| `cleanup/bulkPaymentMethod` | POST | Cleanup-only bulk payment method shift. Accepts date range, `sourceMethods[]`, `targetMethod`, `amount`, sort preferences, and `dryRun`. Preview returns affected bill plan. Apply updates affected bills in one set-based `UPDATE ... FROM jsonb_to_recordset`, converting partial simple-method bills to `Split` and editing existing `split_payments` while keeping split totals equal to `grand_total`. |

---

## coupons/

| Route | Method | Description |
|---|---|---|
| `coupons/generate` | POST | Legacy standalone GENERATE coupon endpoint. Body: `{ clientId, grandTotal }`. Checks minBillAmount, isBillCombine (aggregates past bills), perClientLimit, usageLimit. Creates `CouponClient` rows. Current billing/edit save flows instead generate earned coupons transactionally inside `bill/create` and `bill/update`. |

---

## sales-orders/

Authenticated, selected-company ERP source routes; writes use the same staff roles
as quote source APIs. GET list accepts q/status/from/to/min/max/page/pageSize and
allowlisted orderNumber/orderDate/clientName/expectedShipmentDate/status/total sorting.
GET `sales-orders/:orderId` reads one consistent document/design snapshot. POST creates,
PUT `:orderId` updates with requestId/revision, and DELETE soft-deletes orders without
linked invoices. Creation reserves existing company numbering; all writes validate
owned customer/variants and compute totals. No bills, stock, receipts or journals are
created. Canonical fields include orderDate/expectedShipmentDate/deliveryMethod plus
customer, subject, staff, notes/terms, discount/adjustment and quote-compatible lines.

GET/PUT `sales-orders/preferences` manage independent sales-orders/defaults company
JSON with the prior value backed up. Management roles alone save settings. The shared
A4 design schema, notes/terms/visibility and terminal-order editing policy apply;
quote approval/conversion fields have no sales-order workflow. Per-order metadata
uses existing GeneralPreference sales-orders/document:<id> keys. Generic SalesOrder/
SalesOrderItem and this preference namespace cannot bypass the source APIs. Delete
rejects live Bill links or invoiced=true. No schema or function installation occurs.

## quotes/

The ERP quote page uses the existing quote models through company-authorized raw-pg
routes and `server/utils/erp-quotes.ts`. GETs require an authenticated session and
company access; writes additionally allow admin/manager/accountant/biller/user roles.
Selected customers must be linked to that company and linked variants must belong to it.

| Route | Method | Description |
|---|---|---|
| `quotes` | GET | Selected company list. `q`, optional `status`, quote `from`/`to`, `min`/`max` total, `page`, `pageSize` (default 20, max 500), allowlisted `sort`/`order`; `{ rows, total, summary }`. Searches quote number, subject, reference and live/snapshotted customer name/phone. Excludes deleted quotes. |
| `quotes` | POST | Creates a validated quote and lines. Requires `requestId`; assigns a company-counter number in the source transaction. Returns `{ id, quoteNumber, revision, workflow }`; ACCEPTED can trigger configured invoice conversion. |
| `quotes/:quoteId` | GET | Company-owned quote, ordered lines, customer snapshot, quote pricing metadata and current company `documentDesign`, read together in a repeatable-read, read-only transaction. |
| `quotes/:quoteId` | PUT | Requires the last `revision` and a fresh `requestId`; validates/replaces lines and recomputes totals atomically. Preserves unrelated custom-value JSON and fields outside this editor. Stale revisions return 409. |
| `quotes/:quoteId` | DELETE | Sets `deleted=true` only for the selected company's quote; retains source rows. |
| `quotes/preferences` | GET/PUT | Authorized company preferences. GET returns `{preferences,canManage}`; PUT requires admin/manager/accountant, validates A4 documentDesign/booleans/text/conversion/due days (2 MB JSON request limit) and backs up/upserts GeneralPreference JSON (`quotes/defaults`). |
| `quotes/:quoteId/share` | POST | Authorized repeatable-read snapshot; returns a 30-day signed revision-bound `/quote/:token` path for manual sharing. No message is sent and stored status is unchanged. |
| `quote-share` | GET/POST | Public bearer-token read/response. GET returns only quote/company/response availability. POST accepts token and ACCEPTED/DECLINED; validates current revision, enabled policy/status and expiry under company/quote locks. Records a final response and invokes acceptance conversion. Same-decision retries are idempotent. |
| `quotes/:quoteId/workflow` | POST | Authorized quote writer; `{action:retry\|issue\|email}` retries conversion, issues a current quote-backed invoice draft or retries invoice email. Returns `{success,workflow}`. Errors remain visible and cannot create a second linked invoice. |

POST/PUT accept `clientId`, `quoteDate`, optional `expiryDate`, `referenceNumber`,
`subject`, `salesperson`, `status`, `notes`, `termsAndConditions`, `paymentTerms`,
`deliveryEstimate`, `discount`, `discountType` (`amount`/`percent`), `adjustment`,
optional legacy `pdfTemplate` (classic/modern/compact, retained for compatibility), boolean `hideZeroValueItems`, and
1–200 items. Each item has a unique client line `id`, optional `variantId`,
`name`, `description`, `barcode`, `size`, `unit`, `quantity`, `rate`, `discount` and
`tax`. Rates include tax; discounts are percentages per line. The server calculates
line amounts and document totals and stores extra pricing details under `_erpQuote`
in existing `quote_custom_field_values.field_values`. These routes never create
database objects. Acceptance conversion can invoke the existing bill source, stock
and native posting; it never records payment. Drafts stay in quote workflow metadata
and are listed with `GET quotes?drafts=1` until issue. The shared source-request
audit receipt makes unchanged retries idempotent. Generated model writes cannot
bypass quote source or preference APIs.

## Removed document APIs

The 2026-06-15 cleanup moved the former `general-preferences/`, `quotes/`, `sales-orders/next-number`, `invoices/next-number`, and `payments/next-number` route files out of active `storetools/server/api/`. The dedicated ERP quote routes now implement persistence, preferences and workflows. The old generic preferences, service-invoice and received-payment document APIs remain removed; dedicated sales-order source APIs now implement the ERP order module; current customer receipts use the separate billSale receipt APIs.

---

## discount/

| Route | Method | Description |
|---|---|---|
| `discount/apply` | POST | Bulk discount apply: `{ companyId, discountPercentage, filters }`. Filters: categoryId, subcategoryId, status, dateRange, brand, minRating, maxSprice, minMargin. Updates `variants.discount` + `variants.d_price` (= sprice - sprice×discount/100). Returns `updatedCount`. Creates own `Pool` (inline). |

---

## ecommerce-cms/

Custom storefront CMS APIs. Auth via `requireAuthSession(event)`, company-scoped by `session.data.companyId`, using `pool` raw SQL and table creation helpers in `server/utils/ecommFaqs.ts`.

Seller shipping under `ecommerce-cms/shipping/*` uses `useCompanyRequestSession` and
the in-process TypeScript implementation in `server/utils/shipping/`. It no longer
proxies to Python or reads `SHIPPING_SERVICE_URL`/`SHIPPING_SERVICE_TOKEN`.
Existing order-preview/create, bulk-preview/create, providers, serviceability,
tracking, cancellation/update, e-waybill, label-size/data/PDF, NDR, reverse/exchange
and pickup-location registration URLs retain their request/response shapes.
`create` and `bulk-label` accept POST; `label?trackingId` accepts GET;
`labels-zip` accepts POST with optional `orderIds` and streams a ZIP, including
`errors.txt` for skipped labels. Pickup requests continue through `ecommerce-cms/pickup/raise`.
Delhivery retains its full operation set; existing legacy transports retain their
limited create/track/cancel behavior, with unavailable capabilities rejected.
The public `webhooks/shipping/[companyId]/[provider]` handler verifies the enabled
carrier's company-specific secret locally, then forwards to the existing private
ecommerce webhook using `CUSTOM_API_URL` and `CUSTOM_API_SERVICE_TOKEN`. It does
not require a seller session and never accepts a destination URL from the caller.
See `ARCH-pages-orders.md` and `server/utils/shipping/README.md` for lifecycle and setup.

| Route | Method | Description |
|---|---|---|
| `ecommerce-cms/storefront-source` | GET | Returns only the authenticated company's setup/readiness state, stable preview branch alias, and preview/production build statuses. While provisioning, it refreshes both initial deployments and their Vercel aliases, and marks the source ready only when both builds plus stable preview/production aliases are available; immutable deployment URLs, provider identifiers, and errors remain private. |
| `ecommerce-cms/storefront-source` | POST | Idempotently provisions the authenticated company's private GitHub repository and Vercel project. The server reads `companies.store_unique_name`, serializes concurrent attempts with a PostgreSQL advisory lock, connects the repository as a Vite project, disables Vercel SSO protection, upserts the shared custom-API base URL and server-derived company ID into Preview/Production Vite environments, sets the editor-origin allowlist only for Preview while keeping its Production value blank, then triggers `main` production plus `preview` preview deployments. The request accepts no seller-controlled provider, repository, company ID, branch, or build options. |
| `ecommerce-cms/storefront-agent/chat` | POST | Starts a stored background Antigravity interaction for the authenticated company's ready storefront. Accepts a browser-generated conversation ID, bounded prompt, and up to four bounded image inputs; repository identity, GitHub credentials, branch policy, agent instructions, and environment setup are server-derived. |
| `ecommerce-cms/storefront-agent/status` | GET | Polls only the authenticated company's stored interaction for the supplied conversation ID. Returns sanitized status/final model output while interaction and environment IDs remain server-side. On completion it compares the current `preview` commit with the request's starting SHA and, when changed, explicitly starts and records a Vercel preview deployment. |
| `ecommerce-cms/storefront-agent/sessions` | GET | Lists up to 30 recent company-scoped storefront agent sessions with title, lifecycle status/stage, timestamps and message count; private Gemini and repository identifiers are omitted. |
| `ecommerce-cms/storefront-agent/session` | GET | Loads one authenticated company's persisted storefront conversation messages and lifecycle state by conversation ID so the editor can reopen the same Antigravity interaction/environment chain. |
| `ecommerce-cms/faq` | GET/POST | Lists and creates company FAQ rows in `ecomm_faqs`; fields are `question`, `answer`, `sortOrder`, `status`. |
| `ecommerce-cms/faq/[id]` | PUT/DELETE | Updates or deletes a company FAQ row. |
| `ecommerce-cms/feedback` | GET/POST | Lists and creates custom storefront testimonials in `ecomm_feedback`, optionally linked to an existing company client via `company_clients`; fields include `customerName`, `title`, `message`, `rating`, `sortOrder`, `status`. |
| `ecommerce-cms/feedback/clients` | GET | Returns up to 200 clients linked to the current company for the feedback client selector. |
| `ecommerce-cms/feedback/[id]` | PUT/DELETE | Updates or deletes a company feedback row. PUT can clear or set `clientId` when the field is explicitly submitted. |
| `ecommerce-cms/blogs` | GET/POST | Lists and creates company blog rows in `ecomm_blogs`; fields include `title`, `slug`, `excerpt`, rich HTML `content`, optional image key, `tag`, `readMinutes`, `sortOrder`, `status`. |
| `ecommerce-cms/blogs/[id]` | PUT/DELETE | Updates or deletes a company blog row. |
| `ecommerce-cms/gallery` | GET/POST | Lists and creates storefront media rows in `ecomm_gallery`. Fields: `name`, `type` (`PHOTO`\|`VIDEO`), `mediaKey` (uploaded R2 object), `url` (YouTube link for VIDEO, image URL for PHOTO), `sortOrder`, `status`. At least one of `mediaKey`/`url` is required; both may be set. GET adds a computed `mediaUrl` and normalises legacy `YOUTUBE` rows to `VIDEO`. |
| `ecommerce-cms/gallery/[id]` | PUT/DELETE | Updates or deletes a gallery row. PUT merges against the stored row before validating, so a `{ status }`-only toggle does not trip the "needs an upload or a link" rule; `type` can be changed, `mediaKey`/`url` can be cleared by sending them as `null`. Deleting a row does **not** delete the R2 object. |

---

## like/

Store frontend wishlist (mirrors cart/ pattern).

| Route | Method | Description |
|---|---|---|
| `like/get` | GET | Get liked items: `?companyId=&clientId=`. Returns `{ items: variantIds[] }` from `LikeCompanyClient.like.variantIds` |
| `like/update` | POST | Upsert liked items (similar to cart/update) |
| `like/merge` | POST | Merge guest likes after login (similar to cart/merge) |

---

## notifications/

In-app notification system. Uses authenticated Prisma operations; clients refresh through REST every 30 seconds while visible and on focus.

| Route | Method | Description |
|---|---|---|
| `notifications/index` | GET | Requires seller authentication and authorizes `companyId`. Returns the last 50 company notifications excluding the authenticated user's own records; a supplied `userId` cannot impersonate another user. |
| `notifications/notify` | POST | Requires seller authentication and access to `companyId`; uses the authenticated user ID. Body type is `BILL`, `EXPENSE`, `ORDER` or `LOW_STOCK`. Returns after saving, with no placeholder broadcast dependency. Low-stock lookup requires a variant belonging to that company and sums its item quantities; missing variants return 404. |
| `notifications/[id]/read` | PATCH | Mark single notification read: route param `id` |
| `notifications/read-all` | PATCH | Mark all company notifications read: `?companyId=` |

---

## options/

Dropdown option loaders for filter UIs. All require `useAuthSession`.

| Route | Description |
|---|---|
| `options/brands` | Distinct brand names for company (active products). Returns `[{ label, value }]` |
| `options/categories` | Category options for company |
| `options/distributors` | Distributor options for company |
| `options/ratings` | Rating options for company products |

---

## products/

| Route | Method | Description |
|---|---|---|
| `products/create` | POST | **Product creation transaction** (raw SQL, own `Pool`). Body: `{ payload{name,brandId,description,status}, variants, companyId, poId?, category?, subcategory?, categoryTax?, deliveryType, productId? }`. One transaction, **batched** multi-row variant + item inserts (items seed `initial_qty = qty`). Writes `brand_id` (earlier `brand` non-existent-column bug fixed). Accepts optional caller `productId`. Retry on transient PG errors. Logs failures to `save_error_requests` |
| `products/[id]` | GET | session | Raw SQL product read (product + brand/category/subcategory + variants + items including `initialQty` and `soldQty`), camelCase shape. Replaces `useFindUniqueProduct` (edit page) |
| `products/update` | POST | session | Raw SQL product update (one txn): COALESCE product fields, prune removed variants/items, **batched** multi-row variant + item upserts (`ON CONFLICT`), server-side tax recalc. `initial_qty` seeded on INSERT. Existing item stock is computed as `initial_qty - sold_qty - supplier-return quantity` using the latest stored sold counter and company-scoped purchase-return rows. `updateInitialQty: true` interprets submitted qty as purchased qty; otherwise initial qty is preserved unless that item explicitly sends `updateInitialQty: true`. Item `initialQty` supplies the new baseline (legacy purchase callers supply `qty`). Incoming current/sold counters and `updateStockQty` cannot reset stored counters. Returns item `initialQty` and `soldQty` alongside `qty`. Used by normal product edit and purchase product edit; `syncPurchaseOrder: true` recalculates PO totals. Replaces nested `useUpdateProduct` |
| `products/by-ids` | POST | session | Read-only company-scoped product list by `{ ids }`, including `companyId`, `purchaseorderId`, `productNo`, variant `variantNo`, brand/category/subcategory and items with `initialQty`. Used by the purchase draft to load selected saved products. |
| `products/unassigned` | GET | Read-only, single authorized form company. Optional `search` matches product/variant name, variant code or product/variant number. Returns up to 50 product choices with no PO link. Selection does not reserve or modify records; Save validates again under locks. |
| `products/delete` | POST | session | Raw SQL product delete `{ id }` (company-scoped; variants/items cascade). Replaces `useDeleteProduct` |
| `products/category-tax` | GET | session | Category tax fields `?id=` for variant tax recalc. Replaces `useFindUniqueCategory` |
| `products/save-batch` | POST | One transaction saves new `products` and/or links `existingProductIds` to a new PO (`po`) or an existing PO (`poId`); rejects both PO options together. Existing-only saves are supported. `purchase-product-links.ts` locks the owning PO and selected company-scoped products, rejects missing/foreign records or another PO assignment, and permits idempotent links to the same PO. New records, links, server-recalculated totals and accounting commit/roll back together. Existing item quantities and settlements stay intact. Returns new products with `productNo`, `variantNo` and trigger barcodes. Requires the separately deployed catalog-number migration. |

---

## purchaseorder/

| Route | Method | Description |
|---|---|---|
| `purchaseorder/create` | POST | Creates empty `PurchaseOrder` for session company. Returns `{ id }`. Used by distributor/PO flows that route to `/products/purchase?poId=...`; `/products/add` no longer calls it up front. **Bug:** `console.log('res', res)` |
| `purchaseorder/save` | POST (session) | Atomic new PO: increments the company purchase counter (number = counter-1), validates and links selected `productIds` through `purchase-product-links.ts`, recalculates totals from linked products, and registers the PO source. Credit POs create no DC; paid POs create one numbered DP. Invalid/missing/foreign/other-PO selections roll back the entire transaction. |
| `purchaseorder/options` | GET | Read-only single authorized form company. Searches saved PO number, supplier bill or supplier name; returns up to 50 choices for the product-list Link to Purchase order modal. |
| `purchaseorder/update` | POST (session) | Raw SQL atomic PO edit: PO row/source update preserving actual payments and standalone credits. Replaces `syncEditedPurchasePayment`. Existing same-supplier purchase accounting is updated in place by `purchase-accounting-update.ts`, preserving journal identity and auditing its previous values before commit; the deferred trigger sees the synchronized signature. |
| `purchaseorder/[id]` | GET (session) | Raw SQL PO read (PO + products with `productNo` + variants with `variantNo` + items incl. `initialQty`). Replaces `useFindUniquePurchaseOrder` |

---

## report/

Analytics and reporting endpoints. All auth via `useAuthSession`.

| Route | Method | Description |
|---|---|---|
| `report/report` | GET | Daily source sales/credit collections, expenses/payroll/purchases, posted fund balances and money movements, category/brand sales, salary and credit-invoice detail. Uses `pool`; authorizes one selected company. Optional `block=sales|expenses|money|balances|items|details` returns only that block; omitted returns the complete report, invalid values return 400. The screen starts five blocks concurrently and requests detail on demand. Cleanup sessions use preserved original bill totals and entry values where available; `showCleanedValues=true` selects current values and excludes precedence bills. See `ARCH-pages-reports.md` for partial response fields, query structure and verification. |
| `report/dashboard` | GET | **Main accounts report**: `?startDate=&endDate=`. 10 parallel SQL queries for pre-period opening balances (cash+bank each: sales, expenses, distributor, money, transfers). Then period queries for: sales breakdown (cash/UPI/card/credit + split), brand sales, credit sales, expenses, distributor payments, category sales, transfers, money transactions. Returns full balances + cashBalance/bankBalance + revenueByCategory + categorySales + brandSales |
| `report/profit` | GET | Profit report: `?startDate=&endDate=`. Entry-level COGS calculation using `v.p_price` or category margin fallback. Returns `{ summary, bills[], categoryProfit[], categoryProfitChart[] }` |
| `report/expenses` | GET | Expenses list: `?startDate=&endDate=`. Returns entries with `expensecategory.name`, formatted for reports page |
| `report/account` | GET | **Accounts report** (Finance page): `?from=&to=`. Calculates cash+bank opening balances, then period: sales/expenses/distributor/money/transfers/investments/account_transfers. Returns `{ balances, breakdown, pnl, charts }` with cash/bank flow chart data |
| `report/online` | GET | Markit (online) sales report: `?startDate=&endDate=`. Same as report/report but filtered to `is_markit=true`. Returns `totalSales, salesByPaymentMethod, revenueByCategory, categorySales, billCount` |
| `report/onlinebills` | GET | Online bills list |
| `report/generate-sales.pdf` | GET | **Full store summary PDF**: A4 with tables for Opening/Closing Balance, Sales, Expenses, Distributor Purchases, Transfers, Transactions, Bills list, Expense details, Expense by Category. Cleanup sessions use original bill grand total/subtotal where available. Returns `application/pdf` |
| `report/generate-sales.excel` | GET | Excel export of sales data. Cleanup sessions use original bill grand total/subtotal where available |
| `report/generate-profit.pdf` | GET | Profit summary PDF: Sales, COGS, Profit, Total Expense, Net Profit. Simple 5-row table. Returns `application/pdf` |
| `report/gstr1` | GET | GSTR-1 (outward supplies). Sources from `bills + entries` filtered to `b.deleted=false`, `b.payment_status IN (PAID,PENDING)`, `b.is_markit=false`. Returns kpi + rate-wise + HSN summary. |
| `report/gstr3b` | GET | GSTR-3B summary. Outward values use bill sources. Table 4 ITC reads positive purchase orders directly through company-scoped product/variant/item joins, using the PO date once per order. Existing per-item tax and `v.tax > 0` rules remain. |
| `report/gstr2b` | GET | GSTR-2B inward supplies. Positive POs join directly to company-scoped products/variants/items once per order, using the PO date/supplier. Standalone product credits are included at 0% tax; received-money credits are excluded. Returns kpi, rateSummary and distributorSummary. |
| `report/generate-gstr1.excel` | GET | Excel export of GSTR-1. |
| `report/generate-gstr3b.excel` | GET | Excel export of GSTR-3B. Same Table 4 ITC source change as `gstr3b.get.ts`. |
| `report/generate-gstr2b.excel` | GET | Excel export of GSTR-2B. Same purchase orders plus standalone product credits source as `gstr2b.get.ts`; writes Summary / Rate-wise ITC / Distributor-wise sheets. |

---

## downloads/

Per-distributor and per-PO PDF/Excel export endpoints. All auth via `useAuthSession`.

| Route | Method | Description |
|---|---|---|
| `downloads/distributor-po.pdf` | GET | Distributor PO list PDF: `?distributorId=&startDate=&endDate=&search=&paymentType=&dueOnly=`. |
| `downloads/distributor-po.excel` | GET | Excel version of the above. |
| `downloads/distributor-credits.pdf` | GET | **Distributor transactions PDF.** `?distributorId=&startDate=&endDate=&type=ALL\|PURCHASE\|CREDIT\|PAYMENT\|PURCHASE RETURN`. When `startDate`/`endDate` are omitted (called by the main-table "Download Transactions" action), the endpoint returns the all-time ledger. Sources: `distributor_credits` (split into PURCHASE if `purchase_order_id` is set else CREDIT) + `distributor_payments` (PAYMENT or PURCHASE RETURN if `payment_type='RETURN'`, with `return_no` joined from `purchase_returns`). Layout: TRANSACTIONS centered title → company name + address (street/locality/city/state/pincode/phone/GSTIN from `companies` LEFT JOIN `addresses`) → distributor name (14pt) + address (9pt grey) → single-line meta `PERIOD: From – To    GENERATED: ...` → table (Date · No · Type · Remarks · Debit · Credit) with green/red row backgrounds via `didParseCell` → footer with **Opening Balance · Total Debit · Total Credit · Closing Balance (Due)**. Opening balance = `distributor_companies.opening_due` + (credits − payments before `startDate`) when a window is set; closing = opening + total credit − total debit. |
| `downloads/distributor-credits.excel` | GET | Excel version with the same shape: title row, period row, header (Date/No/Type/Remarks/Debit/Credit), data rows with green/red fills, then a footer block with Opening Balance / Total Debit / Total Credit / Closing Balance. |
| `downloads/purchase-return.pdf` | GET | Single purchase-return PDF: `?purchaseReturnId=`. Bill-receipt style header (company + RETURN TO distributor) and items table. |
| `downloads/user-sales.{pdf,excel}` | GET | Per-user sales export. |
| `downloads/user-expenses.{pdf,excel}` | GET | Per-user expenses export. |

---

## user/

| Route | Method | Description |
|---|---|---|
| `user/report` | GET | User sales report: `?startDate=&endDate=`. Groups entries by `companyUser.name`, distributes bill-level discount proportionally per entry via shared `server/utils/user-sales.ts` net-sales helper (also used by payroll commission). Returns `{ labels[], countData[], salesData[], entryGroups{} }` |
| `users/ledger` | GET | Authenticated complete per-user ledger. Groups `user_ledger_entries` by `company_users` and returns total credit, total debit, latest balance, and expanded ledger entries with `balanceAfter`. Includes payroll accrual, salary payment, user credit bill, credit bill payment/reduction, opening, and adjustment rows. |
| `users/credit-ledger` | GET/POST | Authenticated credit-only filtered ledger. GET groups only `USER_CREDIT_BILL` + `CREDIT_BILL_PAYMENT` rows from `user_ledger_entries` by `company_users`; the same rows also appear in `users/ledger`. POST creates a manual credit or payment/reduction row for a staff user. |
| `users/credit-bills` | GET | Authenticated source/detail list for staff credit bills (`bills.credit_user_id`). Groups bills by staff user and calculates bill credit amount from the Credit split amount for Split bills or `grand_total` otherwise. |
| `salary/pay-with-credit` | POST | Authenticated payroll payout endpoint. In one pg transaction, optionally inserts a `salary_payments` + `money_transactions` salary payout and creates/updates a `user_credit_transactions` PAYROLL/PAYMENT row for credit cut by cycle line. Allows zero cash salary when the whole line is reduced by credit. |

---

## Root-level routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `aify.post` | POST | — | AI product image: `{ url, key, view?, categoryName?, targetAudience? }`. Fetches image from URL, sends to Gemini 2.5 Flash (up to 3 attempts), resizes to 1024×1024 WebP, uploads to Cloudflare R2. Falls back to original on AI failure. Returns `{ success, url, usedAiImage, aiAttempts }` |
| `r2/upload.post` | POST | seller session | Validates an image data URI and object key, then uploads it through the server-only R2 client; browser code never receives R2 credentials |
| `r2/signed-url.post` | POST | seller session | Validates an object key and returns a server-generated signed R2 GET URL with a one-hour expiry |
| `r2/upload-url.post` | POST | seller session | `{ key, contentType }` → presigned R2 **PUT** URL (15 min) for a direct browser→R2 upload, plus the public `https://images.markit.co.in/{key}`. Content type must be `image/*` or `video/*`. Used by the gallery CMS for files too large to base64 through a serverless route (Vercel caps request bodies at ~4.5MB). Requires PUT + the storetools origin in the R2 bucket's CORS policy. |
| `r2/delete.post` | POST | seller session | `{ keys: string[] }` → deletes uploaded media from R2 after the row referencing it was removed or its image replaced. Any key a row still points at is **skipped** (see `server/utils/mediaCleanup.ts`), which is what makes the endpoint safe to call from the browser — a caller can only ever delete an already-detached key. Returns `{ deleted, count }`. Never throws on cleanup failure. |
| `applyPromoCode.post` | POST | — | Apply promo code: `{ code }`. **Bug:** calls `prisma.promoCode` but model is `Coupon` — runtime error |
| `create-order.post` | POST | — | Razorpay order creation: `{ amount }`. Returns Razorpay order object. Uses `RAZORPAY_KEY_ID`/`RAZORPAY_SECRET` env vars |
| `dashboard.get` | GET | session | **Legacy dashboard** — fetches all data via Prisma (products, items, variants, bills+entries+expenses) and computes everything in JS. Returns 20+ computed fields. Deprecated in favor of `lib/api/useDashboardData.ts` ZenStack hooks. **Bugs:** `console.log("here")`, date filter uses `new Date(undefined)` if no query params |
| `gemini.js` | POST | — | **Cloudflare Worker** source file (not a Nuxt route). HMAC-signed upload secret auth, calls Gemini 2.5 Flash, stores AI image to R2 |
| `gettax.get` | GET | session | Returns company categories with tax config: `{ id, shortCut, fixedTax, taxBelowThreshold, taxAboveThreshold, thresholdAmount, taxType }` |
| `getuser.get` | GET | session/company access | Requires `assertCompanyAccess(event, companyId)`; returns active, nondeleted company users whose User is not cleanup: `?companyId=`. Maps `{id,code,name,email,image}` from CompanyUser + User. Used by userStore and quote Prepared by; no users returns 404. |
| `item.post` | POST | session | Create initial items for company-owned variants without existing items. `{ variants }` seeds `initialQty = qty`, `soldQty = 0`. Locks variants and writes in one serializable transaction. Existing items return 409 directing callers to product edit, preserving barcodes and sales history. |
| `items/findFirst` | GET | session | Find item by `?sPrice=&categoryId=`. Used for manual price entry in billing. Returns item + variant + category tax |
| `mails.ts` | GET | — | Returns hardcoded mock mail data (Nuxt UI template stub, not in use) |
| `model/[...].ts` | — | — | ZenStack model proxy (forwards requests to ZenStack runtime) |
| `notifyfcm.post` | POST | — | Send FCM push to all admin users of a company. Body: `{ companyId, excludeDeviceId?, title, body }`. Uses raw SQL `pool` to fetch `company_users` + `push_token` rows, then sends via FCM v1 API using GoogleAuth service account (`GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` env vars). Route now soft-fails and returns `{ success: false }` on notification-side errors so billing save is not blocked |
| `savefcmtoken.post` | POST | session | Register/update web FCM push token: `{ fcmToken, deviceId, deviceInfo? }`. Derives userId from the authenticated session, ignores body userId, validates nonempty token/device strings, and atomically upserts `PushToken` by `userId_deviceId`. Returns `{ success: true }`; missing auth is 401 and invalid fields are 400. |
| `savecaptoken.post` | POST | — | Register/update Capacitor native push token: `{ token, userId, companyId, deviceId, deviceInfo? }`. Upserts `CapPushToken` |
| `secret.ts` | GET | session (requireAuth) | Auth test endpoint. Returns email from session. Not used in production |
| `send-otp.ts` | POST | — | Send OTP to email: `{ email }`. Generates 6-digit OTP, stores in `EmailOtp` with 10min expiry, sends via SMTP configured by `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` (`utils/mailer`). Port 465 uses implicit TLS. |
| `verify-otp.ts` | POST | — | Verify email OTP: `{ email, otp }`. Checks expiry, validates match, deletes record on success |
| `shopifyRegister.post` | POST | — | Shopify login: `{ email, password }`. Looks up user by email, compares hashed password. Returns `{ companies }`. **Bug:** references undefined `shopifyLogin` function (should be `import { shopifyLogin }`) |
| `shopify/shopifyProduct` | POST | session | Create product on Shopify: `{ productData }`. Uses `session.shopifyAccessToken`. Hardcoded to `bazaartests.myshopify.com` |
| `shopify/shopifyImage` | POST | session | Shopify image operations |
| `stock-aggregate.post` | POST | — | Stock aggregation: `{ companyId, filters, groupBy }`. Groups variants by category/brand/rating/date/distributor. Returns `[{ [groupBy], stock, purchaseStock, qty }]`. **Bug:** `console.log` dumps full category breakdown on every category-grouped request |
| `tiktok/getToken` | POST | — | TikTok OAuth token exchange: `{ code, companyId }`. Calls TikTok auth API, fetches shop list, stores tokens + cipher + shop name via `updateCompanyForTiktok`. **Bugs:** `app_key`/`app_secret` hardcoded in source; hardcoded `x-tts-access-token` header |
| `tiktok/getShopName` | GET | — | Get TikTok shop name. **Bugs:** `app_key`/`app_secret` hardcoded; hardcoded `x-tts-access-token`; calls `generateSign(requestOption, app_secret)` but signature function expects `(path, timestamp)` — wrong call signature |
| `updateCompany.put` | PUT | — | Update company with Shopify store name + access token: `{ shopifyStoreName, shopifyAccessToken, companyId }`. Delegates to `utils/db.updateCompany` |
| `upload.ts` | POST | — | **Main image upload handler** (fire-and-forget). Accepts `{ base64, key, isAiImage?, view?, categoryName?, targetAudience? }`. Responds immediately with `{ received: true }`, then processes in background via `setTimeout`. Background: if `isAiImage=true`, sends to Gemini (3 retries), resizes to 1024×1024 WebP, uploads to R2. If `isAiImage=false`, uploads original directly |
| `whatsapp/send-payment-template` | POST | — | Send WhatsApp invoice notification with a stored PDF link. Body: `{ phone, name, billName, amount, paymentDate, receiptId, companyId }`; receiptId is the signed PDF path suffix returned by share-receipt. Requires company access and a matching signed bill/document token. Uses `invoice_1` template via Facebook Graph API v25.0. Env: `WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN` |
| `whatsapp/send-coupon-message` | POST | — | Sends a free-form WhatsApp text message for earned generated coupons after receipt send. Body: `{ phone, name, companyName, coupons[] }`. Includes coupon numbers/details; barcode image sending requires a hosted media/template flow and is not implemented here. |
| `whatsapp/send-pending-template` | POST | — | Legacy pending reminder. Body: `{ phone, name, billName, amount, receiptId }`. Uses `pending_invoice_1` via Facebook Graph API v25.0, with one dynamic URL button supplied by receiptId. The current route does not send a separate UPI button. Phone auto-prefixed with `91`. Env: `WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN`. Separate from company-owned notification automation. |
| `whatsapp/webhook` | GET/POST | — | Legacy shared-sender WhatsApp AI webhook. GET: verification (hardcoded `VERIFY_TOKEN = 'markit123'`). POST: handles incoming text, voice note, image, and PDF messages, resolves sender phone to `CompanyUser`, routes the session through Gemini + MCP, and sends the AI reply back to WhatsApp. **Bug:** verify token hardcoded. Separate from the new tenant Connect webhook. |
| `connect/whatsapp/:action` | GET/POST/PUT/DELETE | Company admin/manager | Company-scoped Embedded Signup/code exchange, connection lifecycle, template management, messaging, history, number registration and profile management. Methods depend on action. No runtime DDL. See `ARCH-connect-whatsapp.md` for contracts, required secrets and the prepared-only migration. |
| `connect/whatsapp/webhook` | GET/POST | Meta challenge / HMAC | Separate tenant webhook; validates raw-body signature, resolves active WABA + phone to one company, deduplicates inbound messages and ingests delivery receipts. No shared-number AI invocation. |
| `whatsapp-notifications/:action` | GET/PUT/POST | Company admin/manager | `settings` GET/PUT; `contacts` GET/POST; `installations` GET/POST; `queue` GET; `process` POST. Authorizes selected company and same-origin writes, requires prepared notification tables, validates template ownership and client permissions. Processing may send real approved templates. See `WHATSAPP-NOTIFICATIONS.md`. |
| `cron/whatsapp-notifications` | GET | CRON_SECRET bearer | Five-minute committed-state scan and bounded delivery of enabled active companies. Missing setup returns readiness false. No source business writes or runtime DDL. |
| `statement/_helpers.ts` | — | — | Shared module: `fetchCompanyContext`, `classifyRow` (Gemini AI with DB context), `executeOperation` (INSERT using meta UUIDs), `deleteExecutedRecord`, `upsertMapping`, `parseMeta` |
| `statement/banks.get` | GET | session | Lists active native BANK accounts owned by the authenticated company. Statement selection never writes a native ID to the legacy batch bank foreign key. |
| `statement/upload.post` | POST | session | Upload bank statement (base64 PDF/image). Extracts rows via Gemini `gemini-3-flash-preview`, saves batch + rows, auto-matches mappings (30% keyword overlap). Body: `{file, mimeType, fileName?, bankAccountId?}`. Returns `{batchId, rowCount, matched, unmatched}` |
| `statement/find-operation.post` | POST | session | AI-classify a statement row. Uses `classifyRow` with full DB context (categories, users, distributors, bank accounts with IDs). Saves operation+meta+userInput to row + upserts mapping. Resets `executed=false` on re-assign. Body: `{rowId, userInput, bankAccountId}` |
| `statement/execute-row.post` | POST | session | Creates/replaces expense or supplier sources using the selected native bank snapshot. Source, postings and completion commit together. Completed rows replay; explicit replacement uses a durable request receipt. Returns `{success, operationId, operation, meta, insertedData, bankAccountId}`. Body: `{rowId, bankAccountId, requestId?, reexecute?}`; replacement requires requestId. |
| `statement/execute.post` | POST | session | Resumable batch execution: retries failed rows, skips completed rows and marks EXECUTED only when all rows finish. Returns per-row failures and posts a noncritical AI chat summary. Body: `{batchId, bankAccountId}`. |
| `statement/row/[id].put` | PUT | session | Locked company/batch/row assignment updates operation/meta/label/userInput and mapping, retaining the prior source receipt. Reopens the batch. Explicit `reassign:true` permits editing a completed row; Ignore uses this endpoint. |

---

## Bugs

| File | Bug |
|---|---|
| `statement/_helpers.ts` | ISO dates still parse as day-first substrings (deferred gap #6). Source/receipt atomicity, selected banks, positive credit when debit is zero, and partial batch retry are fixed locally. Old ledger writes and statement transfer/money/investment execution remain retired. |
| `billSale/updatePaymentMethod.post.ts` | Legacy ledger disconnection is intentional; native ERP journals follow the changed source. |
| `bill/findBillCounter.post.ts` | `console.log('res', res?.billCounter)`; also now-unused (invoice numbering moved to DB trigger) |
| `billSale/receipt.get.ts` | `console.log('SALE ENTRIES:', sale.entries)` on every receipt load |
| `cart/update.post.ts` | `console.log('Cart updated:', cart)` on every update |
| `cart/merge.post.ts` | Fallback `clientId` hardcoded to a real UUID (`1db12f74-8805-42be-95a6-26d807151000`) |
| `applyPromoCode.post.ts` | Calls `prisma.promoCode` but model is `Coupon` — runtime crash |
| `notifications/index.get.ts` | `console.log(userId)` on every request |
| `purchaseorder/create.post.ts` | `console.log('res', res)` |
| `getuser.get.ts` | **FIXED** — calls `assertCompanyAccess` before returning active staff in the requested company. |
| `item.post.ts` | Stock initialization only; existing items cannot be deleted/recreated by this endpoint. |
| `items/findFirst.get.ts` | `console.log('Query:', query)` on every barcode lookup |
| `stock-aggregate.post.ts` | Full category breakdown `console.log` on every request |
| `dashboard.get.ts` | `console.log("here")` on every request; `new Date(undefined)` if dates missing |
| `tiktok/getToken.post.ts` | `app_key`/`app_secret` hardcoded in source; hardcoded `x-tts-access-token` header (expired token) |
| `tiktok/getShopName.get.ts` | Same hardcoded credentials; `generateSign` called with wrong args (object instead of path string) |
| `whatsapp/webhook.ts` | `VERIFY_TOKEN = 'markit123'` hardcoded (should be env var); inbound WhatsApp AI reply flow still depends on this token being configured in Meta webhook settings |
| `accounts/primaryledger.get.ts` | `console.log({...openingBalance breakdown})` on every request |
| `shopifyRegister.post.ts` | References `shopifyLogin` which is not imported |

### Receipt PDF sharing

`POST /api/billSale/share-receipt` accepts `{ billId, companyId?, pdf? }`. It authorizes company access and reads the owned bill before accepting a bounded PDF data URI. PDFs are stored as `application/pdf` under server-generated `receipts/{companyId}/{billId}/{uuid}.pdf` keys in R2. Returns `{ path, receiptId, expiresInDays: 30 }`; PDF paths include `pdf=1`. Calls without a PDF retain the previous signed viewer link behavior. `GET /api/receipt-share?token=...&pdf=1` verifies the signed document key, checks the bill still exists and redirects to a short-lived R2 download URL. Ordinary token reads still return receipt data. Upload/signing failures do not return a share link.
