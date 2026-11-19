Dedicated sales CRM (revised 2026-11-19): `CrmSettings`, `CrmAccount`, `CrmDeal`,
`CrmActivity`, `CrmDocumentLink` and `CrmAudit` are scoped, raw-API-owned models.
Contacts reuse Client + CompanyClient and the existing /client page; CrmContact is
removed from the unapplied design. CompanyClient's crmData/crmVersion/crmAccountId
store only company CRM attributes, concurrency and account association. Those fields
use @prisma.passthrough("@ignore") so Prisma retains the physical columns for db push
while excluding them from generated client operations and keeping writes in
authenticated CRM APIs. Bare ZenStack @ignore removes physical fields from generated
Prisma schemas. Identity and consent are never copied into
CRM JSON. Deal/activity composite foreign keys reference CompanyClient directly.
Versions/audits protect changes. Deal outcomes never post sales/stock/accounting.
The CRM contract comprises six tables and three CompanyClient columns. On 2026-11-19,
an authorized schema push added the missing columns/account foreign key to the configured
database; the six tables already existed. Live CRM readiness passed. The prepared SQL
migration was not executed or registered by this push. See ARCH-crm.md and AGENTS.md.

Legacy accounting archive policy (2026-10-06): generated create/update/delete is
denied on AccountLedgerEntry, MoneyTransaction, AccountTransfer, Investment, BankAccount
and CashAccount. Dedicated legacy financial mutation routes are retired. Raw scoped
staff/supplier source services still maintain linked MoneyTransaction documents consumed
by native posting triggers. This is an application-policy change, with no table/column
migration or deletion of historical financial data.

# Markit v1 - Project Architecture Guide

## Ecommerce pickup schedule separation (local preparation)

`EcommPickupRequest` in `schema.zmodel` owns warehouse-level pickup bookings.
`requestedPickupDate`/`requestedPickupTime` (nullable text, mapped to
`requested_pickup_date`/`requested_pickup_time`) preserve submitted values separately
from `carrierSchedule` (nullable JSONB, `carrier_schedule`). A recorded slot contains
`date`, `startTime`, `endTime`, `source: "manual"` and `recordedAt`; it is copied from
the carrier portal, never inferred from the requested time. `carrierResponse`
(nullable JSONB, `carrier_response`) retains the original creation response.
Legacy `pickupDate`/`pickupTime` still mean requested values. `orderIds` and order
metadata tags represent Markit's handover list, not a confirmed carrier AWB link.
The local migration `20261115160000_pickup_requested_schedule` adds these four
columns and backfills requested values only. It must not be applied without
separate explicit authorization. No table/column changes were applied during
implementation. See `ARCH-pages-orders.md` for the UI and API semantics.

## WhatsApp Connect (local preparation)

`WhatsAppNotificationSettings`, `WhatsAppNotificationContact`,
`WhatsAppNotificationSource`, `WhatsAppNotificationOutbox` and
`WhatsAppInstallationAppointment` own automatic customer updates. All are company
scoped with generated access denied. Settings hold template rules and an activation
baseline. Contacts bind recorded permissions to an explicit recipient/client phone.
Source observations suppress historical/repeated events. Outbox keys are stable
per-company SHA-256 event keys; intent commits before external sending, and uncertain
delivery is never automatically retried. Installation bookings reference existing
customer units; their actual completion remains an after-sales date action.
Prepared migration `20261118160000_whatsapp_notifications` creates these five tables
and requires separate authorization. No database schema changes were applied by this
implementation. See `WHATSAPP-NOTIFICATIONS.md` and `ARCH-connect-whatsapp.md`.

`WhatsAppConnection` owns one company/WABA/phone association and encrypted business
credential. Company, WABA and phone ownership are unique. `WhatsAppMessage` stores
outbound intent, consent attestation/admin, Meta ID and receipt state, plus signed
inbound text/media metadata. Generated access is denied; company-admin raw server
APIs own this feature. Disconnect erases the credential and retains history; company
deletion cascades to connections/messages. The prepared-only migration is
`20261103120000_connect_whatsapp`; this work does not apply it. See
`ARCH-connect-whatsapp.md` for setup, limitations and API semantics.

## After-sales records

Customer-product reference numbering (local preparation): `CustomerProductNumbering`
stores a company-owned `prefix` (default PR), `lastNumber` bigint and update time.
Counter allocation is in the unit-registration transaction and locks the same row as
settings changes; numbers continue across prefix changes and financial years. The
CustomerProduct reference constraint is now `[companyId,reference]`, while its UUID
remains the global internal identity. Migration `20261030213000_customer_product_numbering`
creates this table/replaces the unique index only after separate database approval.
It does not rewrite existing references. Existing deployed schemas keep legacy
registration until the migration is installed. See `ARCH-after-sales.md`.

`ServiceConfiguration` and immutable `ServiceConfigurationRevision` define reusable
WARRANTY/GUARANTEE/MAINTENANCE rules. `ProductServiceLink` is the company-scoped
many-to-many catalog assignment. `CustomerProduct` records physical sold units;
`CustomerServiceAgreement` stores terms/revision snapshots and activation/schedule
dates. `MaintenanceOccurrence`, `ServiceJob`, `ServiceReading`, `ServiceAudit` and
`ServiceReminder` retain due work, claims/visits, manual evidence, changes and deduped
alerts. Raw authenticated APIs own these models; generated access is denied.
`ServiceCharge` stores company-owned reusable non-stock charge defaults and archive
state. `Product.isServiceProduct` classifies stocked repair parts in the existing
product table. ServiceJob `details.charges`/`details.parts` keep billing line snapshots;
all non-stock service charges use a company category referenced by existing
GeneralPreference `after-sales/service-charge-category` JSON (`version`, `categoryId`).
Charge save/invoice issuance ensure the category transactionally; no ServiceCharge
column or migration is needed for this association. Rates/taxes remain line snapshots.
Legacy single `charge`/`tax` remains readable. Follow-up local migration
`20261030170000_service_items` adds the catalog and product flag. Installation status
must be checked for each database rather than inferred from the local migration files.
Customer-product source IDs are scalar history references, so catalog deletion does
not erase service history. Replacement units can retain multiple historical agreements.
Migration `20261030150000_after_sales` is prepared locally and requires separate
authorization before database installation. See `ARCH-after-sales.md` for invariants.

Recurring invoice and retainer source contract (2026-10-30, local preparation):
`RecurringInvoice` stores company/customer/currency, an anchored schedule, revision and
validated invoice template. `RecurringInvoiceOccurrence` uniquely records profile/date,
frozen template/due date and optional unique normal Bill link. Draft occurrences have no
posting; issue and schedule advancement share the Bill source transaction.
`RetainerInvoice` stores a numbered advance request and frozen liability account;
`RetainerEvent` records immutable COLLECTION/APPLY/REFUND/UNAPPLY amounts, dated journal,
optional invoice/Payment and unique reversal links. Applications use existing Payment
receipt/reversal statuses so invoice outstanding and source guards remain consistent.
Company/customer/currency, active account types, locked periods and amount bounds are
validated by the owning source services. Generic CRUD is denied for all four models.
Migration `20261030120000_invoice_programs` is prepared only; database installation
requires a separate explicit instruction. It creates no historical postings and rewrites
no source records. `prisma/schema.prisma` is generated from the authoritative zmodel.
See `ARCH-pages-erp.md` and `ARCH-storetools-api.md` for implementation ownership.

Datasource configuration (2026-10-29): `DATABASE_URL` is the single PostgreSQL
connection variable for the application, ZenStack/Prisma and maintenance scripts.
`schema.zmodel` declares only `url = env('DATABASE_URL')`; the separate direct URL
override is removed. Tools that need a different endpoint supply `DATABASE_URL`
for that process. Database schema application still requires separate explicit
authorization and remains separate from builds.
On 2026-10-21 the user authorized the existing test database to synchronize through
`schema.zmodel` -> `npx zenstack generate` -> `npx prisma db push`. The already-declared
distributor payment allocation table and expense party columns were installed through
that workflow. Backups and row comparisons verified existing affected-table data was
unchanged; a fresh read-only audit found no missing tables/columns across 175 models.
Prisma schema push does not deploy SQL views, posting functions or triggers.
The user separately authorized purchase-accounting SQL deployment on this test
database on the same date. `scripts/deploy-purchase-authority-test.mjs` installed
the repository PO-header-authority definitions after backing up existing SQL objects.
Before commit it verified unchanged source/stock/journal/audit rows and historical
event projection; no historical records were imported or rewritten. This deployment
is separate from the zmodel/schema-push workflow and is not a production deployment.
Accounting relations explicitly preserve the installed SQL foreign keys' `NoAction`
update rules and existing delete rules. Supplier mappings retain their existing composite
constraint name; supplier settings retain the database `updated_at` default alongside
Prisma `@updatedAt`. Existing investor/review index names and the review's descending
date index are declared, and database-generated UUID text defaults use PostgreSQL's
canonical expression. These declaration changes do not alter production tables or rows.

`AccountantInvestor`, `AccountantInvestorTerm` and `AccountantInvestorEvent` own
the new Accountant investor area. Profiles store contact/document metadata, a
linked company user ID (the existing `legacyUserId` column now links both native and
imported profiles, unique per company/user) and saved chart account mappings, which
may be shared by investors; purpose balances are isolated by investor events.
`UserRole.investor` is added by migration `20260930180000_investor_user_role`;
existing roles are not rewritten. `AccountantInvestorTerm` now stores internal
versioned ownership/profit snapshots rather than a user agreement workflow.
Percentage-mode snapshots come from Add/Edit investor; share-mode snapshots come
from purchases/redemptions priced individually. Historical agreement rows/JSON are
retained; old term mutation endpoints reject new agreement operations. New profile,
identity, membership, zero-share/percentage snapshot and creation-request audit
commit atomically. Composite tenant keys and unique request/reversal IDs remain.

Investor events retain dated cash, journal/request/reversal/legacy IDs, transaction
pricePerShare and preview/shareChange snapshots in existing details JSON. There
are no current capital commitments or agreement price requirements. Share units
and percentages reflect recorded trades; confirmed cash posts separately.
Same-day trades reuse the unique dated ownership row with per-event audit history.
SHARE_BUY/SHARE_REDEEM events have null journalId and store full trade value with
paymentStatus in JSON. Confirmed partial/full payments are separate CAPITAL_IN/OUT
events linked by details.settleTradeId and a published journal. Unpaid trade dues
are operational balances, not automatic cash or receivable/payable journals.
Payment reversals reopen dues without changing units; reversing an unpaid trade
restores units after dependency/allocation checks. Existing JSON and nullable
journal fields support this without schema additions.
The legacy-import trigger still makes adopted old investments immutable. Generated
CRUD remains denied. No columns, tables or migrations are added for this change.
See `ARCH-pages-accounts.md` and `scripts/production-accounting/INVESTORS.md`.

Company-wide profit distributions reuse these investor models. `AccountantAudit`
stores append-only funding-account configuration (`investor-profit-settings`),
company share mode/totals (`investor-share-settings`, `after.includeShares` and `after.totalShares`), and
approved request/result snapshots (`investor-profit-batch`). Investor event details
link the batch ID; there is no separate distribution table or new schema migration.

`AccountantLoan` and `AccountantLoanEvent` define agreement-based investor borrowing.
The loan snapshots terms, accounts and an exact-cent schedule as JSON. Loan accounts
default from company loan settings and can be overridden per loan; they do not
require or modify the investor's historical loan-account mapping. Saving
records the receipt and moves the loan to OPEN in one transaction; DRAFT is a
transient creation state and supports completion of earlier unposted records.
OPEN agreements freeze their snapshots, and settlement or full repayment closes
them. Immutable source events store scheduled charges,
12-month reclassification/reversal journals, actual payments and reasoned payment
reversals. Company/investor and company/loan composite foreign keys enforce tenant
ownership, and request IDs are unique per company. Only cash principal movements
project into investor events using `details.loanId`; interest/fees never inflate
investor principal. Generated CRUD denies all operations. Migration
`20261102120000_loan_management` adds only the two loan tables/indexes/constraints
and is prepared, not applied. Runtime APIs and tests perform no DDL. See the Loans
contract in `ARCH-pages-accounts.md` for posting dates, accrual and settlement.

`AccountantUserSettings` stores company salary/credit account mappings and activation.
`AccountantUserSource` freezes source account choices, posting signatures and current
journal IDs; historical exclusions use stable source keys, with an amount baseline
for cumulative payroll credit deductions. Generated CRUD is denied, as are direct
UserLedgerEntry mutations. Source APIs and deferred SQL triggers own writes. See
`ARCH-pages-users.md` for new-only activation and posting semantics.

`AccountantStockControl` stores each company's opt-in Stock account, opening equity
and adjustment expense accounts, initialization date, revision and product valuation
snapshot. Deferred database triggers own synchronization; generated CRUD is denied.
See `ARCH-pages-accounts.md` and `scripts/STOCK-ACCOUNTING.md`.

ERP accounting adds `AccountantErpSettings` (one company settings row with activation
date and account-role mappings) and `AccountantErpSource` (company/source composite
key, posting signature, frozen account choices, revision and current journal ID).
Generated CRUD access is denied; the authenticated Accountant API owns configuration.
See `ARCH-pages-erp.md` for posting, exclusion and rollout rules.

> Exhaustive field-level inventory: [`database/DB-CATALOG.md`](./database/DB-CATALOG.md)
> and [`database/dbMeta.json`](./database/dbMeta.json). Generated files inventory
> declared models, enums, fields and relations. Human-authored explanations are in
> [`database/dbExplanations.json`](./database/dbExplanations.json); blank values are
> explicitly awaiting review. See [`database/WORKFLOWS.md`](./database/WORKFLOWS.md)
> for the main record lifecycles.

## Runtime payment table alignment

`ecommerce-api/api/app/tables.py` creates and payment routes use
`ecomm_payment_intents`, mirrored by `EcommPaymentIntent` in `storetools/schema.zmodel`.
It stores pending payment attempts, request JSON, transaction/checkout references,
company/client scope and idempotency. The model preserves the runtime table's
timestamp types, defaults, foreign keys and named idempotency index. Generated
ZenStack CRUD access is denied; the trusted payment API owns these records.
`EcommFeedback.images` preserves the existing non-null JSONB column with an empty-array default.

## Project Overview

Markit is a multi-tenant retail store management platform. It consists of three separate sub-projects sharing one PostgreSQL database.

| Project | Path | Tech | Purpose |
|---|---|---|---|
| **storetools** | `/storetools` | Nuxt.js (Vue 3) + Prisma | Store owner/staff dashboard |
| **server** | `/server` | Express.js + Prisma + Socket.io | Customer-facing backend API |
| **marketplace** | `/marketplace` | Ionic + Capacitor + Vite | Customer-facing mobile app |

---

## Database Architecture

- **DB:** PostgreSQL
- **ORM:** Prisma (in storetools and server)
- **Schema source of truth:** `storetools/schema.zmodel` (ZenStack)
- **Generated file:** `storetools/prisma/schema.prisma` — DO NOT manually edit this file, it is auto-generated by ZenStack CLI
- **Raw SQL:** The accounts/ledger module in storetools uses raw SQL via `pg` pool (`~/server/db`) for complex financial queries — NOT Prisma
- **Multi-tenant pattern:** Almost every table is scoped by `companyId`. Always include `companyId` in queries.
- **Auth:** Session-based using `useAuthSession(event)` in Nuxt server routes

---

## Database Tables — Full Reference

### Independent Accountant books

The `Accountant*` models added for `/accountant` are separate from `Account`,
`AccountLedgerEntry`, `BankAccount`, `MoneyTransaction`, `Investment`, and
`AccountTransfer`. Distributor integration is opt-in per company/distributor;
its history import and deferred PostgreSQL triggers post source-linked journals.
The original 19 models have a company foreign key, timestamps, and a nullable soft-delete
timestamp. The three integration models below use composite source/mapping keys.
Each denies generated ZenStack CRUD; server Accountant routes enforce
authorization and company scope. Currency amounts use PostgreSQL Decimal(18,2),
with Decimal(18,6) exchange rates. Source of truth: the Accountant section at the
end of `schema.zmodel`; generated definitions live in `prisma/schema.prisma`.

| Model | Table / responsibility |
|---|---|
| `AccountantDistributorSettings` | `accountant_v2_distributor_settings`: company/distributor connection, VENDOR contact and enabled flag |
| `AccountantDistributorMapping` | `accountant_v2_distributor_mappings`: typed payable, stock, cash, bank, tax and opening-offset account choices; bank-specific roles use `bank:<legacy bank ID>` |
| `AccountantDistributorSource` | `accountant_v2_distributor_sources`: source signature, frozen or explicitly overridden account snapshot, revision and current journal; repeat imports do not duplicate postings |
| `AccountantAccountingAccount` | `accountant_v2_accounting_accounts`: categorized chart, parent hierarchy, bank metadata, status and dashboard flag |
| `AccountantManualJournal` | `accountant_v2_manual_journals`: draft/published journal header, source identity, reversal, creator and approval records |
| `AccountantManualJournalLine` | `accountant_v2_manual_journal_lines`: debit/credit amounts linked to journal and account |
| `AccountantJournalTemplate` | `accountant_v2_journal_templates`: reusable JSON lines with amount/percentage mode |
| `AccountantRecurringJournalProfile` | `accountant_v2_recurring_journal_profiles`: schedule, next run and child posting status |
| `AccountantAccountingBudget` | `accountant_v2_accounting_budgets`: fiscal-year JSON account allocations |
| `AccountantTransactionLock` | `accountant_v2_transaction_locks`: cutoff, module, lock/unlock actor and reason |
| `AccountantAccountOpeningBalance` | `accountant_v2_account_opening_balances`: one opening record per company/account linked to the shared opening journal |
| `AccountantFixedAssetCategory` | `accountant_v2_fixed_asset_categories`: depreciation policy and asset/expense/accumulated accounts |
| `AccountantFixedAsset` | `accountant_v2_fixed_assets`: acquisition metadata, carrying value, depreciation/disposal status |
| `AccountantAssetDepreciation` | `accountant_v2_asset_depreciations`: dated journal-linked depreciation history |
| `AccountantAssetDisposal` | `accountant_v2_asset_disposals`: disposal proceeds, gain/loss and journal link |
| `AccountantCurrencyAdjustment` | `accountant_v2_currency_adjustments`: foreign/base balances, rate, adjustment status and journal |
| `AccountantPreference` | `accountant_v2_accountant_preferences`: one company preference record, fiscal start, approvals and gain/loss settings |
| `AccountantClient` | `accountant_v2_accountant_clients`: new-book contact engagement metadata |
| `AccountantAccountTransfer` | `accountant_v2_account_transfers`: movement between new cash/bank/card/clearing accounts |
| `AccountantContact` | `accountant_v2_accountant_contact`: independent client/vendor/other directory |
| `AccountantProject` | `accountant_v2_accountant_project`: independent journal project directory |
| `AccountantAudit` | `accountant_v2_accountant_audit`: API actor, action, resource and metadata |

See `ARCH-pages-accounts.md` for posting invariants, rollout boundaries and the
targeted additive migration command. Scalar account/contact/project references in
management records are validated by the scoped API; they are not all schema relations.

### Core Identity

#### `companies` (Company)
The central tenant entity. Every store is a Company.
- Organization links: `isHeadOffice` marks a company that may own branches; `parentCompanyId` is an optional self-reference to its head office. A branch has its own company-scoped operational data. The database prevents self-parenting and a branch also being a head office; the branch API enforces one-level hierarchy.
- Key fields: `id`, `name`, `storecode` (auto-increment), `storeUniqueName`, `type` (seller/buyer)
- Financial config: `cash`, `bank`, `openingCashDate`, `openingBankDate`
- Feature flags: `isTaxIncluded`, `isCostIncluded`, `isUserTrackIncluded`, `isAiImage`, `darkstore` (Boolean, default false; marks the company as eligible for marketplace dark-store catalog selection)
- Delivery config: `deliveryType[]`, `deliveryMode[]`, `deliveryRadius`, `deliveryDiscount`, `codCharge` (flat surcharge applied only to COD storefront orders)
- Billing config: `billCounter`, `purchaseCounter`, `barcodeCounter`, `userCodeCounter`, `expenseCounter`, `distributorCounter`, `distributorPaymentCounter`, `distributorCreditCounter`, `clientCounter`, `accountCounter`
- Number prefixes: `billPrefix`, `quotePrefix`, `salesOrderPrefix`, `invoicePrefix`, `paymentPrefix`, `expensePrefix`, `distributorPrefix`, `distributorPaymentPrefix`, `distributorCreditPrefix`, `clientPrefix`, `userPrefix`, `accountPrefix`, `previousBillPrefix`
- Financial year: `closingDate` (DateTime?)
- Payment details: `accHolderName`, `ifsc`, `accountNo`, `bankName`, `gstin`, `upiId`
- **Used in:** storetools (core), server (lookup)

#### `users` (User)
Staff/owner login accounts.
- Fields: `id`, `email`, `password` (hashed), `image`, `cleanup` (Boolean default false), `cleanupCode` (String? mapped to `cleanup_code`)
- `cleanup`: grants access to the `/cleanup` admin tool when `true`
- `cleanupCode`: secret code that must be supplied as a query param to access `/cleanup` (e.g. `/cleanup?code=XXXX`)
- Relations: belongs to companies via `CompanyUser`, has `Address`, `Notification[]`, `UserConversation[]`, `UserClient[]`
- **Used in:** storetools (auth), server (auth)

#### `company_users` (CompanyUser)
Junction table linking a User to a Company with a role. This is the staff record.
- Fields: `companyId`, `userId`, `role` (admin/user/manager/biller/accountant), `code`, `phone`, `name`, `status`, `deleted`
- Relations: tracks `Entry[]`, seller-created `Bill[]`, staff-credit `Bill[]` via `bills.credit_user_id`, legacy `UserCreditTransaction[]`, complete `UserLedgerEntry[]`, `Expense[]`, `Investment[]`
- **Used in:** storetools (auth, billing, reports)

#### Payroll / Salary tables
- `Shift.policy` (nullable JSONB) holds advanced break, off-day pay/compensatory leave, attendance thresholds, missing-checkout and typed-leave switches. `Shift.policyHistory` holds immutable effective-date snapshots of all shift policy fields; `utils/shift-policy.ts` resolves historical settings. Null policy preserves legacy defaults. Generated Shift create/update is denied so the versioned API owns policy changes.
- `LeaveApplication.type` additionally supports `COMP_OFF`. Approved applications are reconciled against typed allowances or compensatory leave by `server/utils/shift-calendar.ts`; there is no separate credit-minting table. Generic LeaveApplication writes are denied; validated company-scoped APIs own changes. Migration: `20260929160000_shift_policy_scenarios`.
- `shifts`: reusable shift definitions for attendance and payroll. Besides timing (`startTime`, `endTime`, `breakMinutes`) and selected working weekdays (`workDays`, default Monday-Saturday), each shift now owns reusable payroll policy: overtime config (`overtimeMode`, `overtimeRate`, `otDailyThresholdMinutes`, `otHourlyRoundMinutes`), leave cuts (`leaveCutFullDay`, `leaveCutHalfDay`, `leaveCutPerHour`), late-entry fine config (`lateEntryGraceMinutes`, `lateEntryFine`), and early-exit fine config (`earlyExitGraceMinutes`, `earlyExitFine`). Assigned users reuse the policy from their active shift.
- `salary_configs`: one row per `companyId + userId`, edited through `/users` staff Actions. Scalar `period`, `amount`, `commissionPercentage` and `effectiveFrom` represent the latest configured rate; nullable JSONB `rateHistory` stores immutable effective-date versions. Historical payroll resolves the applicable version by date. Legacy rows provide a current-rate baseline; previously overwritten rates cannot be recovered. Migration: `20260930120000_salary_rate_history`. Generated SalaryConfig, SalaryPayment, PayrollCycle, PayrollCycleLine and PayrollAdjustment mutations are denied; role-checked salary APIs own writes.
- `payroll_cycle_lines`: generated by salary payroll runs. Stores `baseSalary`, day counts, `leaveDeduction`, `lateEntryFine`, `earlyExitFine`, overtime totals, `commissionSales`, `commissionAmount`, signed `adjustmentTotal`, `grossPay`, and `netPay`.
- `user_ledger_entries`: complete per-user double-entry ledger with `type` (`OPENING`, `PAYROLL_ACCRUAL`, `SALARY_PAYMENT`, `USER_CREDIT_BILL`, `CREDIT_BILL_PAYMENT`, `ADJUSTMENT`), `direction` (`DEBIT`/`CREDIT`), `amount`, `sourceType`, `sourceId`, `note`, and optional `balanceAfter`. Positive balance means the company owes the user. Credit-related rows (`USER_CREDIT_BILL`, `CREDIT_BILL_PAYMENT`) are also shown in the credit page as a filtered ledger.
- `user_credit_transactions`: legacy narrow credit table retained for historical compatibility/backfill. Active bill/payroll/user-credit writes now go through `user_ledger_entries`.
- Salary/payroll applies only to company users that have an overlapping `ShiftAssignment` and a `SalaryConfig`.
- **Used in:** storetools `/users/salary`, `/users/credit-bills`, `/users/ledger`, `server/api/salary/payroll/run.post.ts`, `server/api/salary/pay-with-credit.post.ts`, `server/api/users/ledger.get.ts`, `server/api/users/credit-ledger.*`, `server/utils/payroll.ts`, `server/utils/user-ledger.ts`

#### `clients` (Client)
End customers of a store.
- Fields: `id`, `email`, `phone` (unique), `name`, `gender`, `dob`, `otp`, `otpExpiry`, `cancellationFees`, `cancellationCount`, `ban`, `deleted`
- `cancellationFees`: carried marketplace cancellation charge added to the next `OrderTryPack.vue` checkout; `cancellationCount`: consecutive picked-order cancellations only; `ban`: blocks client login/order creation after repeated picked-order cancellations
- Relations: linked to companies via `CompanyClient`, has `Address[]`, `Bill[]`, `Cart`, `Like`
- **Used in:** storetools (CRM, billing), server (auth, cart, orders), marketplace

#### `company_clients` (CompanyClient)
Junction linking a Client to a Company. Stores company-specific customer state.
- Fields: `companyId`, `clientId`, `password`, `status`, `pipelineStatus` (mapped to `pipeline_status`), `points`, `clientNumber`
- `password`, `status`, and `pipelineStatus` are company-scoped here instead of global `Client` fields; the same phone/email identity can have different CRM/login state per company.
- **Used in:** storetools (customer management), server

#### Custom e-commerce CMS tables
ZenStack-modeled raw-SQL-compatible tables for custom storefront content. Defined in `storetools/schema.zmodel`; `storetools/server/utils/ecommFaqs.ts` and `ecommerce-api/api/app/tables.py` still create them defensively for runtime compatibility.
- `ecomm_faqs`: company-scoped FAQ rows with `question`, `answer`, `sort_order`, `status`.
- `ecomm_feedback`: company-scoped testimonial rows with optional `client_id`, fallback `customer_name`, `title`, `message`, `rating`, `sort_order`, `status`. `client_id` links to `clients` with `ON DELETE SET NULL`.
- `ecomm_blogs`: company-scoped blog rows with `title`, unique `(company_id, slug)`, `excerpt`, rich HTML `content`, optional `image`, `tag`, `read_minutes`, `sort_order`, `status`.
- `ecomm_gallery`: company-scoped storefront media with `name`, `type` (`PHOTO` | `VIDEO`; legacy rows hold `YOUTUBE` and are migrated to `VIDEO` by `ensureEcommGalleryTable`), `media_key` (uploaded R2 object), `url` (external link — YouTube for VIDEO, image URL for PHOTO), `sort_order`, `status`. `media_key` and `url` are individually optional but at least one must be set — enforced by the `ecomm_gallery_media_present_chk` CHECK constraint. Table is provisioned lazily by `storetools/server/utils/ecommGallery.ts`, not by a migration.
- `ecomm_carts`: one custom-storefront cart per `(company_id, client_id)`, with `items` JSONB and `meta` JSONB. Created/updated by `ecommerce-api/api/app/routes/cart.py`; Revomotive's Pinia cart store syncs add/edit/delete operations to this table.
- `ecomm_wishlists`: one custom-storefront wishlist per `(company_id, client_id)`, with `variant_ids text[]` plus full `items` JSONB for fast client rendering. Created/updated by `ecommerce-api/api/app/routes/wishlist.py`; Revomotive's Pinia wishlist store syncs toggles and logout clearing to this table.
- **Used in:** storetools ecommerce CMS pages/API, ecommerce-api bootstrap, Revomotive custom storefront.

#### Virtual custom objects (`custom_objects`, `custom_fields`, `custom_records`, `custom_values`, `custom_relationships`)
These five tables are the storage foundation for company-defined storefront data. They are defined in `storetools/schema.zmodel` and created by `20260925120000_add_custom_objects/migration.sql`; no custom-object API or editor UI is wired yet.
- `custom_objects` defines a company-scoped logical table with a unique `(company_id, slug)`.
- `custom_fields` defines named fields on one object. `value_type` is restricted to `TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, `TIMESTAMP`, or `REFERENCE`; `required` is metadata for future write validation.
- `custom_records` holds logical rows. Composite `(company_id, object_id, id)` keys make tenant and object ownership available to child foreign keys.
- `custom_values` stores one value per `(company_id, record_id, field_id)` in a typed column. Foreign keys require the field and record to belong to the same company and object. A SQL check and trigger require exactly one populated value column matching the field's declared type. Typed lookup indexes support field filtering without JSONB record values.
- `custom_relationships` links a source record's `REFERENCE` field to a target. `CUSTOM` targets use a composite foreign key to another custom record in the same company. Other `target_type` values can represent core entities, but their existence and company ownership require future application validation because the polymorphic target cannot have a single core-table foreign key.
- The database does not yet enforce a required field on every record, per-field uniqueness, or cardinality. Those rules need a transactional write API before customer data is accepted.

#### `delivery_partners` (DeliveryPartner)
Delivery staff for try-at-home orders.
- Fields: `id`, `name`, `phone`, `email`, `profilePic`, `bloodGroup`, bank details, KYC docs (`Adharnumber`, `PanNumber`, `DrivingLicenseDoc`), `isVerified`, `deleted`
- Relations: `Address[]`, `Trynbuy[]`, `DispatchAttempt[]`, `DispatchAssignment[]`, `DeliveryPartnerEarnings[]`, `DeliveryNotification[]`
- **Used in:** server (delivery routes), marketplace

---

### Product Catalog

#### `categories` (Category)
Product categories with tax and HSN configuration.
- Fields: `name`, `companyId`, `hsn`, `taxType` (FIXED/VARIABLE), `fixedTax`, `thresholdAmount`, `taxBelowThreshold`, `taxAboveThreshold`, `margin`, `shortCut`, `targetAudience`
- `writeId`: used for offline sync
- **Used in:** storetools (product management, billing)

#### `subcategories` (Subcategory)
Sub-categories under a Category.
- Fields: `name`, `companyId`, `categoryId`, `writeId`
- **Used in:** storetools (product management)

#### `brands` (Brand)
Product brands.
- Fields: `name`, `companyId`, `image`, `writeId`
- **Used in:** storetools (product management)

#### `products` (Product)
Product master record (grouped under a PurchaseOrder).
- `productNo` maps to `product_no`, unique with `companyId`. Migration `20261029120000_catalog_numbers` backfills each company's existing products in `created_at, id` order, then assigns numbers from `Company.productCounter` in a database trigger. UUIDs remain the record keys. Numbering does not reset with the financial year; same-company edits and PO links preserve the number. Company transfers allocate a destination-company number. On 2026-10-29 the migration was applied and recorded on both authorized Neon databases after affected-field backups; verification found no missing/misordered numbers or counter mismatches and confirmed both unique indexes and allocation triggers.
- Fields: `name`, `companyId`, `categoryId`, `subcategoryId`, `brandId`, nullable `purchaseorderId`, `rating`
- Note: Products can now be created before a `PurchaseOrder` is chosen. Draft add-product flow stores products with `purchaseorderId = null`; choosing to create a PO later links those products to the new purchase order.
- `writeId`: used for offline sync
- **Used in:** storetools (inventory)

#### `variants` (Variant)
Sellable variant of a product (e.g. Red/XL).
- `variantNo` maps to `variant_no`, unique with `companyId`, and uses the independent `Company.variantCounter` sequence. The same migration backfills and installs allocation for every insert path, including raw SQL and generated APIs. Supplied numbers cannot override database allocation; same-company edits preserve numbers. `code` remains a separate optional seller-entered field. The company counters store the next number, start at 1, and increment transactionally.
- Fields: `name`, `code`, `unit`, `sprice` (selling price), `pprice` (purchase price), `dprice` (discounted price), `discount`, `tax`, `images[]`, `sold`, `deliveryType`, `companyId`, `productId`, `brandId`
- `writeId`: used for offline sync
- **Used in:** storetools (billing, inventory), server (cart, orders)

#### `items` (Item)
Inventory unit for a Variant + one labelled option value. Tracks actual stock. `Variant.sizeLabel` may label `Item.size` as “Shade”, but there is no independent `Item.shade` column.
- Fields: `variantId`, `size`, `qty`, `initialQty`, `soldQty`, `barcode`, `weight`, `length`, `width`, `height`, `dimensionId`, `companyId`
- `writeId`: used for offline sync
- **Used in:** storetools (stock management, billing), server (cart)

#### `variant_size_barcodes` (VariantSizeBarcode)
Maps a unique barcode to a specific variant+size combination.
- Fields: `variantId`, `size`, `barcode` (unique)
- **Used in:** storetools (barcode scanning)

---

### Purchasing / Stock Intake

#### `purchase_orders` (PurchaseOrder)
Represents a stock purchase from a distributor.
- Fields: `companyId`, `distributorId`, `purchaseOrderNo`, `totalAmount`, `subTotalAmount`, `discount`, `tax`, `adjustment`, `billNo`, `paymentType`
- Relations: `Product[]`, `DistributorCredit[]`, `DistributorPayment[]`
- **Used in:** storetools (purchase management)

#### `distributors` (Distributor)
Supplier/vendor entities (not tied to any company directly, shared).
- Fields: `name`, `images`, bank details (`accHolderName`, `ifsc`, `accountNo`, `bankName`, `gstin`, `upiId`), `status`
- Relations: `DistributorCompany[]`, `Address`
- **Used in:** storetools (purchase management)

#### `distributor_companies` (DistributorCompany)
Junction linking a Distributor to a Company (many-to-many).
- Composite PK: `[distributorId, companyId]`
- Relations: `PurchaseOrder[]`, `DistributorPayment[]`, `DistributorCredit[]`
- **Used in:** storetools

#### `distributor_payments` (DistributorPayment)
Payments made to a distributor.
- Fields: `distributorId`, `companyId`, `amount`, `paymentType`, `purchaseOrderId`, `expenseId`, `remarks`
- Can be linked to an Expense record
- `allocations` links one payment to several POs through `DistributorPaymentAllocation`.
  Each allocation stores its portion of the total; legacy `purchaseOrderId` is
  retained for direct single-order payments. Allocated payments leave it null.
- **Used in:** storetools (accounts, ledger)

#### `distributor_payment_allocations` (DistributorPaymentAllocation)
Applied with Prisma `db push` on 2026-10-11 after backup. Links a payment
to each selected PO with `companyId`, `paymentId`, `purchaseOrderId` and `amount`.
Each payment/PO pair is unique. Payment deletion cascades allocations; PO deletion
is restricted while allocations exist. Raw payment APIs validate same-company
supplier ownership and total/amount limits; generic writes are denied. PO dues use
allocated amounts rather than the parent payment total.

#### `distributor_credits` (DistributorCredit)
Liability the company owes to a distributor.
- Fields: `distributorId`, `companyId`, `creditNo` (`Int?`), `amount`, `billNo`, `purchaseOrderId`, `remarks`, `moneyTransactionId` (`String?` `@unique`)
- Two semantic kinds, distinguished by `moneyTransactionId`:
  - **PRODUCT credit** (`moneyTransactionId IS NULL`) — distributor extended product/goods credit. PO-linked when `purchaseOrderId` is set; otherwise a manual product credit. No cash/bank movement. Counts toward GSTR-2B / GSTR-3B Table 4 (ITC).
  - **AMOUNT credit** (`moneyTransactionId IS NOT NULL`) — distributor sent actual money (refund/advance/loan). The linked `money_transactions` row drives the cash/primary-bank/secondary-bank ledger and reports automatically. Excluded from ITC reports.
- Relations: `MoneyTransaction?` via `moneyTransactionId` with `onDelete: SetNull` (FK lives on DistributorCredit; reverse `distributorCredit` field on MoneyTransaction). UI delete handler cascades MoneyTransaction at the application layer.
- **Used in:** storetools (`pages/distributor/index.vue`, `pages/distributor/credit.vue`), MCP (`create_distributor_credit`), GSTR-2B/3B ITC source.

---

### Billing / Sales

#### `bills` (Bill)
Existing `adjustment` stores the signed fixed amount applied after the bill discount.
POS billing and edit keep it separate from `discount` / `discountType`: `2` adds ₹2
and `-2` subtracts ₹2. Drafts, source writes, edit reads and receipt reads preserve it;
legacy surcharge discounts are moved into the adjustment input when opened for edit.
A sales invoice/order.
- ERP Invoice mode reuses `type=BILL`, `paymentMethod=Credit`, initial `paymentStatus=PENDING`. Existing `invoiceCode` (`INV-<invoiceNumber>`) marks issuance; `dueDate`, `invoicePaymentTerms` and `subject` (customer reference) store its details. The UI derives received/balance from original tender and active Payment receipts rather than the legacy `balanceDue` field. No model field or posting-function addition is needed.
- Invoice sending history uses the existing company-scoped Accountant audit table with resource `invoice-send` and bill ID as resource ID. It does not alter payment status.
- Existing `notes` and `termsAndConditions` (`terms_and_conditions`) store customer-facing bill/invoice text, with source validation limits of 5,000 and 10,000 characters. Quote conversion copies only the text selected by its company retention preferences. These are existing columns; no schema change is required.
- `paidAt` (`paid_at`, timestamptz): first observed PAID insertion/transition after migration `20261001120000_document_status_history`. A database trigger sets it using the transaction timestamp and preserves it on retries, edits, refunds or reopening. Existing paid rows remain null; neither `createdAt` nor `updatedAt` is treated as historical payment evidence. New historical imports also record observation time, not a backdated collection date.
- Fields: `companyId`, `clientId`, `userId`, `accountId`, `creditUserId`, `invoiceNumber`, `subtotal`, `originalSubtotal`, `discount`, `originalDiscount`, `tax`, `grandTotal`, `originalGrandTotal`, `paymentMethod`, `paymentStatus`, `splitPayments` (JSON), `type` (STANDARD/BOOKING/TRY_AT_HOME/BILL), `status` (order lifecycle), `deleted`, `isMarkit`, `precedence` (Boolean? default false), `commission`, `storeWaitingFee`
- `originalSubtotal` / `originalGrandTotal` / `originalDiscount`: cleanup reduction snapshots. First cleanup amount reduction preserves the real bill values here before lowering visible `subtotal` / `grandTotal` and zeroing visible `discount`; cleanup users can see these real values.
- `splitPayments`: JSON array of `{method, amount}` for partial payment across modes
- `isMarkit`: flag for marketplace-originated bills
- `commission`: marketplace commission payable by this store, calculated after store coupon from `companies.commissionRate`
- `storeWaitingFee`: store-side waiting fee charged to the store and paid out through the delivery partner payout snapshot
- `precedence`: soft-delete flag set by cleanup tool — `true` means the bill has been soft-deleted by cleanup and is excluded from normal queries
- `accountId` links deferred B2B account bills; `creditUserId` links deferred staff/user credit bills. `userId` remains the seller/cashier user relation and is not reused for staff credit debt.
- Relations: `Entry[]`, `BillHistory[]`, `CouponUsage[]`, `Account`, `creditUser`, `Address`, `Trynbuy`
- **Used in:** storetools (billing, reports), server (checkout)

#### `markit_bills` (MarkitBill)
One platform settlement row per Try N Buy order.
- Fields: `trynbuyId` (unique), `clientId`, `deliveryPartnerId`, `paymentMethod`, `status`, `customerGrandTotal`, `storeBills` (JSON), `keptItems` (JSON), `returnedItems` (JSON), `commissionTotal`, `companyPenaltiesTotal`, `deliveryPartnerPenaltiesTotal`, `deliveryPartnerBonusesTotal`, `customerCancellationFees`, `markitCouponId`, `markitCouponCode`, `markitCouponValue`, `deliveryPayout` (JSON), `deliveryPayoutTotal`, `deliveryDiscount`, `waitingDiscount`, `netPlatformAmount`, `meta`
- `deliveryPayout`: snapshot of all fees from `delivery_partner_earnings` for the order (`deliverFees`, `waitingFees`, tips, surge, distance, waiting time, and `storeWaitings`)
- `netPlatformAmount`: commission + store waiting fees + penalties + customer cancellation fees - delivery payout - bonuses - Markit coupon - delivery/waiting discounts
- Relations: one-to-one with `Trynbuy`
- **Used in:** server checkout settlement (`POST /api/checkout/trynbuy/complete`)

#### `entries` (Entry)
Line item in a bill. One entry per product/variant sold.
- Fields: `billId`, `variantId`, `itemId`, `categoryId`, `companyId`, `userId`, `userName`, `name`, `barcode`, `qty`, `rate`, `originalRate`, `discount`, `originalDiscount`, `tax`, `value`, `originalValue`, `size`, `shade`, `return`, `outOfStock`
- `return: true` means it's a return line item
- `originalRate` / `originalValue` / `originalDiscount`: cleanup reduction snapshots. First cleanup amount reduction preserves the real entry values here before lowering visible `rate` / `value` and zeroing visible `discount`; cleanup users can see these real values.
- **Used in:** storetools (billing, reports)

#### `ecomm_checkouts` / `ecomm_orders` / `ecomm_payment_verifications`
Custom storefront order and payment state linked one-to-one to the generated bill.
- `accountant_v2_ecommerce_settings` (`AccountantEcommerceSettings`) owns company-scoped opt-in activation and account mappings. Ecommerce accounting uses namespaced `AccountantErpSource` records for sales, collections, refund obligations and manual activity; no independent schema exists in the customer API. Migration `20261001130000_ecommerce_accounting` installs transactional posting functions and ERP-prefixed deferred order/entry triggers. The ERP dispatcher routes only newly connected linked bills, preserving ordinary POS/expense handling. See `ARCH-pages-accounts.md` for posting/rollout rules.
- Checkout and order have the same trigger-managed `paidAt` semantics as Bill. The existing COD settlement transaction updates all three, so their first PAID transition shares one timestamp. Tracking does not itself propagate statuses or change billing/collection timing.
- `ecomm_checkouts.idempotencyKey` is unique per company/client when present and makes a repeated checkout attempt return its original bill/order without a second stock movement.
- `ecomm_orders.items` is the server-priced line snapshot used by order detail, cancellation, and fulfilment.
- `ecomm_payment_verifications.primaryRef` is unique per company/gateway. The row stores the gateway-confirmed amount/currency and is consumed once by checkout settlement; settlement also remains idempotent for the same transaction ID.
- **Used in:** ecommerce-api and `hijabcart/client` checkout/payment/order flows

#### `bill_history` (BillHistory)
Audit log for bill changes.
- Fields: `billId`, `data` (JSON snapshot), `operation`, `changedAt`, `precedence` (Boolean? default false)
- `precedence`: mirrors `Bill.precedence` — set to `true` when the parent bill is soft-deleted by cleanup
- **Used in:** storetools (bill edit tracking)

`document_status_history` (`DocumentStatusHistory`) is a separate database-written status audit for `bills`, `ecomm_orders`, and `ecomm_checkouts`. AFTER INSERT/UPDATE triggers append initial non-null statuses and every distinct change to `status` or `payment_status` (including transitions to null). Rows carry company, entity type/id, field, previous/new status, `changedAt`, sequence, source and optional actor. Sequence provides stable ordering when timestamps match. Unchanged writes add no rows; rolled-back writes leave no history. No document foreign key is used, so hard deletion retains the audit. Generated model access is denied; the authenticated `GET /api/bill/status-history?id=&type=bill|order|checkout` reader restricts every query to authorized companies. Existing BillHistory snapshots and `ecomm_order_status_history` carrier/manual notes remain unchanged.

The bill create/edit and manual-order-status handlers set transaction-local source and `user:<id>` actor; storefront checkout sets `client:<id>` and a checkout source; carrier polling/webhooks set a shipping source with no actor. Other writers are still captured with source `database` and unknown actor. Dates are database-observed times, not carrier event times or courier bank-remittance dates. Apply the migration before deploying readers/generated clients; schema push alone does not install triggers. No historical dates or transitions are fabricated.

#### `token_entries` (TokenEntry)
Queue/token system for billing without full bill creation.
- Fields: `companyId`, `tokenNo`, `itemId`, `variantId`, `barcode`, `categoryId`, `name`, `size`, `qty`, `rate`, `discount`, `tax`, `value`, `sizes` (JSON), `totalQty`
- **Used in:** storetools (quick queue billing)

#### `accounts` (Account)
Credit accounts for bulk/B2B clients. Bills can be assigned to an account for deferred payment.
- Fields: `name`, `phone`, `companyId`
- Relations: `Bill[]`, `Address`
- **Used in:** storetools (account-based billing)

---

### Try-at-Home / Delivery Orders

#### `trynbuys` (Trynbuy)
A try-at-home or delivery order. Customers try products at home before buying.
- Fields: `clientId`, `company[]`, `deliveryPartnerId`, `locationId`, `checkoutMethod`, `subtotal`, `shipping`, `waitingFee`, `waitingTime`, `waitingStartedAt`, `deliveryType`, `orderStatus`, `pickupOtps`, `storeStatuses`, `rejectedDrivers`
- `rejected_drivers` (JSONB, default `'{}'`) — per-order dispatch rejection log keyed by `deliveryPartnerId`. Shape: `{ "<driverId>": { "count": number, "reasons": string[], "rejectedAt": string[] } }`. `count` is the total rejections by that driver for this order; `reasons[]`/`rejectedAt[]` grow in lock-step with `count` (one entry per rejection event). Reasons used: `manual_reject` (driver tapped Reject/X), `auto_timeout` (45s popup timer fired on the client), `server_timeout` (worker timeout job ran because the client never replied). Written by `server/dispatch/response.js → recordDriverRejection` (called from `handleDispatchReject` and `handleTimeout`).
- Cancellation: marketplace cancellation sets `orderStatus = 'CANCELLED'`; if a driver is assigned but no store pickup is complete, ₹15 is added to `clients.cancellation_fees`; once any store has `storeStatuses[companyId].picked = true` (or order status is already `PICKED`/`DELIVERED`), full `shipping` is added
- Store-fault cancellation now also stores penalty data on the same `trynbuys` row inside `storeStatuses[companyId]` using `storePenaltyFee`, `storePenaltyReason`, and `storePenaltySource`; current store penalty amount is ₹50
- `waitingTime` is the persisted customer-wait total derived from `order_status_events`; customer wait is `Delivered complete` -> `DecisionDone complete`.
- Store wait is no longer stored on `trynbuys`; it is captured per company in `delivery_partner_earnings.storeWaitings` as JSON entries with `companyId`, `waitingTime`, and `waitingFees`.
- Relations: `TrynbuyCartItem[]`, `TrynbuyReturnedItem[]`, `Bill[]`, `MarkitBill`, `DeliveryPartnerEarnings`, `DispatchAttempt[]`, `DispatchAssignment`
- **Used in:** storetools (order pages), server (order/history/pack/delivery routes), marketplace

#### `trynbuy_cart_items` (TrynbuyCartItem)
Items carried to customer's location for a Trynbuy order.
- Fields: `trynbuyId`, `variantId`, `itemId`, `quantity`, `status`
- `status` is now reserved for item-level outcomes (`ORDER_RECEIVED`, `OUTOFSTOCK`, `PURCHASED`, `RETURNED`). Multistore pack/pick/return progression is tracked separately in `trynbuys.store_statuses`.
- **Used in:** storetools (order packing), server (order/history/checkout/delivery routes), marketplace

#### `trynbuy_returned_items` (TrynbuyReturnedItem)
Items returned from a Trynbuy (not purchased).
- Fields: `trynbuyId`, `variantId`, `itemId`, `quantity`, `status`
- **Used in:** server (order/history/checkout/delivery routes), marketplace

#### `delivery_partner_earnings` (DeliveryPartnerEarnings)
Earnings per delivery for a delivery partner.
- Fields: `trynbuyId` (unique), `deliveryPartnerId`, `deliveryFees`, `waitingFees`, `tips`, `surge`, `distance`, `waitingTime`, `storeWaitings`
- `storeWaitings` stores the per-company store wait breakdown as JSON entries with `companyId`, `waitingTime`, and `waitingFees`
- **Used in:** server (delivery order details), marketplace

#### `delivery_partner_bonuses` (DeliveryPartnerBonus)
Manual or workflow-driven bonus ledger for a delivery partner.
- Fields: `deliveryPartnerId`, `trynbuyId?`, `amount`, `reason`, `source`, `adminEmail`, `meta`, `createdAt`, `updatedAt`
- **Used in:** company portal / future delivery admin adjustments

#### `delivery_partner_penalties` (DeliveryPartnerPenalty)
Penalty ledger for delivery partner fines such as admin-marked invalid cancellations.
- Fields: `deliveryPartnerId`, `trynbuyId?`, `amount`, `reason`, `source`, `adminEmail`, `meta`, `createdAt`, `updatedAt`
- **Used in:** company portal cancellation handling

#### `company_penalties` (CompanyPenalty)
Penalty ledger for store/company-level fines tied to an order.
- Fields: `companyId`, `trynbuyId?`, `amount`, `reason`, `source`, `adminEmail`, `meta`, `createdAt`, `updatedAt`
- **Used in:** company portal cancellation handling

#### `order_status_events` (OrderStatusEvent)
Step-by-step timeline and order-status transition events for delivery partner / Try N Buy flows.
- Fields: `trynbuyId`, `deliveryPartnerId`, `step`, `action`, `meta`, `createdAt`
- Extra field: `companyId` for store-scoped pickup/return completion tracking
- **Used in:** server (delivery step logging, packed/picked/returned/completed aggregation), delivery app, marketplace delivery tracker

#### `dispatch_attempts` (DispatchAttempt)
Dispatch attempt history per order.
- Fields: `trynbuyId`, `deliveryPartnerId`, `attemptSeq`, `status`, `distanceMeters`, `createdAt`, `respondedAt`
- **Used in:** server (dispatch worker + socket responses)

#### `dispatch_assignments` (DispatchAssignment)
Current assignment state per order (one row per `trynbuyId`).
- Fields: `trynbuyId`, `deliveryPartnerId`, `status`, `assignedAt`
- **Used in:** server (dispatch acceptance)


#### `delivery_notifications` (DeliveryNotification)
Notifications for delivery partners.
- Fields: `deliveryPartnerId`, `text`, `createdAt`, `updatedAt`
- **PENDING:** server/marketplace

---

### Shopping (Marketplace)

#### `cart` (Cart)
Shopping cart container.
- Fields: `items` (JSON), `createdAt`, `updatedAt`
- Linked to a client+company via `CartCompanyClient`
- **Used in:** storetools (sync), server (cart API), marketplace

#### `cart_company_client` (CartCompanyClient)
Junction: one cart per client per company.
- Fields: `clientId`, `companyId`, `cartId` (unique)
- **Used in:** storetools (cart sync)

#### `likes` (Like)
Wishlist container.
- Fields: `variantIds[]` (array of variant IDs), indexed with GIN for array search
- Linked to client+company via `LikeCompanyClient`
- **Used in:** storetools (sync), server (wishlist), marketplace

#### `like_company_client` (LikeCompanyClient)
Junction: one like-list per client per company.
- Fields: `clientId`, `companyId`, `likeId` (unique)
- **Used in:** storetools

---

### Promotions

#### `coupons` (Coupon)
Discount coupons.
- Fields: `code`, `type` (PERCENTAGE/FLAT/GIFT), `discountValue`, `giftBarcode` (GIFT product barcode), `maxDiscountAmount`, `minOrderValue`, `startDate`, `endDate`, `usageLimit`, `perClientLimit`, `timesUsed`, `targetType` (ALL/CATEGORY/PRODUCT), `audienceType` (ALL/GENERATE/SPECIFIC/PRIVATE), `companyId`, `isMarkit`
- `PRIVATE` audience coupons are code-only ecommerce offers: customer-facing discovery queries exclude them, while exact-code validation and checkout revalidation can accept them subject to the normal eligibility rules.
- **Used in:** storetools (coupon management, billing)

#### `coupon_clients` (CouponClient)
Assigns a specific coupon to a specific client (for SPECIFIC audience) and stores earned generated-coupon instances.
- Fields: `couponId`, `clientId`, `generatedFromBillId` (bill that earned the voucher when known), `usageLimit` (remaining uses left for the generated voucher)
- **Used in:** storetools

#### `coupon_usages` (CouponUsage)
Records every time a coupon is used.
- Fields: `couponId`, `clientId`, `billId`, `usedAt`
- Unique constraint: `[couponId, clientId, billId]`
- **Used in:** storetools (billing)

---

### Finance / Accounts

#### `expenses` (Expense)
Business expenses.
- Party links: `distributorId` and `clientId` reference company/distributor and company/client memberships. Exactly zero or one of user/distributor/client is selected (API and ZenStack validation). Composite relations enforce company ownership. Generated Prisma output includes these fields. A read-only pre-push check confirmed both columns in the configured database; this task performed no schema writes.
- Fields: `companyId`, `userId`, `expensecategoryId`, `expenseDate`, `totalAmount`, `taxAmount`, `recoverableTaxAmount`, `paymentMode`, `status`, `note`, `receipt`, `receiptName`
- Can be linked to a `DistributorPayment`
- **Used in:** storetools (expense tracking, accounts ledger)

#### `expense_categories` (ExpenseCategory)
Types/buckets for expenses.
- Fields: `name`, `companyId`, `status`
- **Used in:** storetools

#### `recurring_expenses` / `recurring_expense_occurrences`
`RecurringExpense` stores company-owned fixed monthly schedules: category, name/note,
tax-inclusive amount, included/recoverable tax, next due date, original monthly day,
active flag and last generation error. Category deletion is restricted while referenced.
`RecurringExpenseOccurrence` uniquely identifies `(scheduleId, dueDate)` and links to
the generated `Expense`. Deleting that expense sets the link to null but retains the
occurrence, so retries cannot recreate a deleted expense. Company deletion cascades
through schedules and occurrences. Both models deny all generic ZenStack operations;
only scoped raw-SQL endpoints and the secret-authenticated cron manage them.
Deployment uses the owner's schema-push workflow from `schema.zmodel` and generated
`prisma/schema.prisma`. Input validation is enforced by the recurring-expense APIs.

#### `payments` (Payment)
Existing payment records are reused for customer POS credit collections.
- `companyId` and `billId` identify the company-scoped invoice; `clientId` is retained when present.
- `paymentDate`, `amount`, `paymentMode`, `paymentReference`, and `currency` record the collection. For POS credit receipts, `depositTo` is the selected native CASH/BANK account ID.
- `status = POS_CREDIT_RECEIPT` is active; `POS_CREDIT_REVERSED` retains the original after a dated reversal. Other pre-existing payment statuses are not counted as these receipts.
- `ERP_CREDIT_RECEIPT` journals use the payment ID as `sourceId`; reversal journals use `ERP_CREDIT_RECEIPT_REVERSAL` and `reversedFromId`. Company-scoped request-ID audit records provide idempotency without schema additions.
- `server/utils/bill-receipts.ts` owns trusted writes. The model adapter denies generated Payment mutations. Bill payment method/splits retain their original tender; payment status is PENDING until the credit portion minus active receipts is zero.

#### `money_transactions` (MoneyTransaction)
Cash/bank give-and-receive transactions with parties (customers, suppliers, employees, etc.).
- Fields: `companyId`, `partyType` (CUSTOMER/SUPPLIER/EMPLOYEE/OWNER/OTHER), `direction` (GIVEN/RECEIVED), `status` (PENDING/PAID), `amount`, `paymentMode`, `accountId` (`null` = primary bank, set = `bank_accounts.id`), `note`
- Reverse relation: `distributorCredit DistributorCredit?` — when an AMOUNT-type DistributorCredit is created, both rows are inserted in a transaction with the FK on the DistributorCredit side.
- **Used in:** storetools (accounts ledger — via raw SQL pool), AMOUNT-type DistributorCredit flow (distributor index UI + MCP `create_distributor_credit`).

#### `investments` (Investment)
Capital investments into/out of the company by owners/users.
- Fields: `companyId`, `userId`, `direction` (IN/OUT), `amount`, `paymentMode`, `status`, `note`
- **Used in:** storetools (accounts)

#### `cash_accounts` (CashAccount)
Primary cash account per company (one per company).
- Fields: `companyId`, `name` (default "Cash")
- Unique per company
- **Used in:** storetools (accounts — via raw SQL pool)

#### `bank_accounts` (BankAccount)
Bank accounts linked to a company (can have multiple).
- Fields: `companyId`, `accHolderName`, `ifsc`, `accountNo`, `bankName`, `gstin`, `upiId`, `openingBalance`, `openingBalanceDate`
- **Used in:** storetools (accounts — via raw SQL pool)

#### `account_ledger_entries` (AccountLedgerEntry)
Persisted cash/bank/investment/credit ledger with running balances. This is the read source for `/accounts/cash`, `/accounts/bank/primary`, `/accounts/bank/{id}`, `/accounts/credit`, and report balance fields after account-ledger cutover.
- Fields: `companyId`, `accountType` (`CASH`/`PRIMARY_BANK`/`BANK`/`INVESTMENT`/`CREDIT`), `accountId` (`null` for Cash, Primary Bank, Investment, and Credit; `bank_accounts.id` for secondary banks), `direction` (`CREDIT` increases account balance, `DEBIT` decreases), `amount`, `sourceType`, `sourceId`, `entryDate`, `note`, `balanceAfter`
- Source identity: indexed by `(companyId, sourceType, sourceId)` and unique by `(companyId, accountType, accountId, sourceType, sourceId, direction)` in ZenStack, with a runtime/backfill unique index that coalesces nullable `accountId`.
- Opening rows use `sourceType='OPENING'`; cash/primary bank source IDs are `${companyId}:CASH` and `${companyId}:PRIMARY_BANK`, secondary bank source ID is `bank_accounts.id`.
- **Used in:** storetools account ledger APIs, account write APIs, salary/user credit money-transaction mirrors, purchase-order distributor payment writes, statement execution, reports.

#### `account_transfers` (AccountTransfer)
Transfers between cash and bank accounts.
- Fields: `companyId`, `fromType` (CASH/BANK/INVESTMENT), `fromAccountId`, `toType`, `toAccountId`, `amount`, `note`
- `accountId = NULL` means the primary account (cash or primary bank from Company table)
- **Used in:** storetools (accounts ledger — via raw SQL pool)

---

### Notifications & Push

#### `notifications` (Notification)
In-app notifications for store users/clients.
- Fields: `companyId`, `userId`, `clientId`, `type` (enum), `title`, `message`, `read`, `actionPath`, `metadata` (JSON)
- Types: ORDER_RECEIVED, BILL_CREATED, PAYMENT_RECEIVED, EXPENSE_CREATED, INVENTORY_LOW, SHIPMENT_SENT, SYSTEM_ALERT
- **Used in:** storetools

#### `push_token` (PushToken)
Web push notification tokens (browser/PWA).
- Fields: `userId`, `token`, `userAgent`, `deviceId`
- **Used in:** storetools

#### `cap_push_token` (CapPushToken)
Capacitor (native mobile) push notification tokens.
- Fields: `userId`, `token`, `userAgent`, `deviceId`
- **Used in:** storetools

---

### Messaging

#### `conversations` (Conversation)
Chat thread container.
- Relations: `Message[]`, `UserConversation[]`, `ClientConversation[]`
- **PENDING:** not confirmed used in storetools server — likely marketplace/server

#### `messages` (Message)
Individual message in a conversation.
- Fields: `conversationId`, `senderId`, `text`, `seen[]`, `replyto`, `edited`, `deleted`
- **PENDING:** marketplace/server

#### `user_conversations` (UserConversation)
Junction: user in a conversation.
- **PENDING:** marketplace/server

#### `client_conversations` (ClientConversation)
Junction: client in a conversation.
- **PENDING:** marketplace/server

#### `user_clients` (UserClient)
Direct user-client relationship (for chat assignment or CRM).
- **PENDING:** marketplace/server

---

### UI Configuration

#### `product_inputs` (Productinput)
Controls which product form fields are visible in the UI, per company.
- Fields: `companyId` (unique), boolean flags: `name`, `brand`, `category`, `subcategory`, `description`
- **Used in:** storetools (product add/edit form)

#### `variant_inputs` (Variantinput)
Controls which variant form fields are visible, per company.
- Fields: `companyId` (unique), boolean flags: `name`, `code`, `sprice`, `pprice`, `dprice`, `discount`, `qty`, `sizes`, `shades` (default false), `images`, `button`
- **Used in:** storetools (variant add/edit form)

#### `general_preferences` (GeneralPreference)
Flexible per-company, per-page preference storage for reusable page rules/settings.
- `sidebar-navigation/defaults` holds version-1 JSON with a revision and per-section
  enabled/hidden-page selections for ERP, CRM, Storetools and Connect. Without saved
  choices, only ERP is enabled; CRM, Storetools and Connect default to false. Explicit
  company choices override these defaults. Live admin/manager
  settings APIs own writes and back up the previous JSON at `defaults-backup` within a
  company-locked transaction. Generic mutations of this namespace are rejected.
  Choices narrow existing menu gates without changing route/API authorization. No new
  fields or schema objects are required; see `ARCH-sidebar-navigation.md`.
- `sales-workflow/defaults` holds `{version:1,includeInvoicing:boolean,includeAfterSales:boolean}` for Sales
  and after-sales visibility. Missing settings enable invoicing and disable after-sales. The dedicated GET/PUT settings
  API authorizes company reads and admin/manager/accountant writes, preserves the
  preceding JSON at `defaults-backup` under a company row lock, and performs no
  schema, journal or historical-document changes. Generated preference mutations
  are blocked for this page by `organizationModelScope.ts`.
- `invoices/defaults` and `sales/defaults` hold version-1 billing/table defaults:
  customer notes, terms and conditions, invoice payment-term ID, page size and summary
  visibility. The preceding JSON is saved under `defaults-backup`; dedicated billing
  preference APIs authorize management writes and generic CRUD is blocked. New/reset
  drafts adopt defaults; existing drafts/issued documents retain their text and dates.
  Receipt designs keep their existing `printer/templates` ownership. These settings
  use existing JSON storage without adding fields or database schema objects.
- Fields: `companyId`, `pageName` (`page_name`), `key` (`preference_key`), `value` (`preference_value` JSON), `active`
- Unique constraint: `[companyId, pageName, key]`
  - Named invoice payment terms use `pageName = billing`, `key = payment-terms`, with the previous JSON at `payment-terms-backup`. Version-1 JSON contains `{terms: [{id,name,kind:'days',days}]}`. Invoice snapshots remain in existing Bill `invoicePaymentTerms` and `dueDate`; no model fields or schema objects are added.
  - Current active Storetools usage: company print designs (including optional A4/A5/Letter receipt paperSize and flow/absolute embedded images) at `pageName = printer`, `key = templates`; `templates-backup` retains the preceding saved JSON. `GET/PUT /api/settings/print-templates` provides authorized company reads and admin/manager writes. The older preferences page and `/api/general-preferences` route remain removed.
  - Quote defaults use `pageName = quotes`, `key = defaults` (previous JSON in `defaults-backup`): one validated A4 documentDesign (sections, embedded PNG/JPEG images, columns and typography), optional professional layout/live item thumbnails/paired text/headings/signature-contact field roles, terms/notes, visibility, accepted-edit and customer approval policies, conversion mode, invoice due days and independent `retainCustomerNotes` / `retainTermsAndConditions` booleans (default false). Optional design properties reuse existing section/column kinds. Company branding, client addresses and owned variant photos are read from existing records rather than copied into design JSON. Dedicated quote preference APIs require company access and management writes; generic model writes cannot change this family. No schema objects are added.
- Historical intent: approval settings, custom fields, validation rules, custom actions, and record-locking rules could be stored as additional page/key JSON preferences without adding one-off tables for every preference family.
  - **Used in:** `server/utils/printTemplateSettings.ts`, `server/api/settings/print-templates.{get,put}.ts`, `components/PrinterTemplateDesigner.vue`.

#### `storefront_sources` (runtime-managed)
Private storefront source-provisioning state, created defensively by `storetools/server/utils/storefrontSource.ts`.
- Provider fields: `repository_provider`/`hosting_provider` default to `github`/`vercel` for existing stores. New AWS rows select `codecommit`/`amplify` and persist `repository_arn`, `amplify_app_id`, `sandbox_role_arn`, the packaged `template_digest`, and resumable `provisioning_stage`. Migration `20261004120000_aws_storefront` is additive and mirrored in both ORM schemas.
- Fields: `company_id` (unique FK to `companies`, cascade delete), private `repository_id`, private `repository_full_name`, `preview_branch` (default `preview`), private `vercel_project_id`, immutable preview/production deployment IDs and URLs, stable `preview_branch_url` and `production_url` aliases, deployment statuses, overall `status` (`CREATING`, `READY`, or `FAILED`), private `error_message`, timestamps.
- Seller-facing APIs return only status and readiness; repository metadata is server-only.
- **Used in:** `GET/POST /api/ecommerce-cms/storefront-source` and `pages/storefront/editor.vue` setup gating.

#### `storefront_agent_sessions` (runtime-managed)
Company-scoped storefront editor conversation state, created defensively by `storetools/server/utils/storefrontAgent.ts`.
- `queued_messages` is an ordered JSONB array mirrored in both ORM schemas. Each entry has a stable UUID, content, creation timestamp, and optional durable R2 image metadata; it never stores image base64.
- Fields: `company_id` (FK to `companies`, cascade delete), authenticated affinity owner `user_id`, browser-generated `conversation_id`, latest turn `interaction_id`, assigned runtime `environment_id`, Pi `pi_session_id`, rollback-only legacy `opencode_session_id`, latest private GCS or company-prefixed S3 Pi JSONL `storage_uri`, selected `model`, pending dispatch payload (`pending_prompt`, `pending_model`, encrypted `pending_runtime_payload`), queue/dispatch coordination (`dispatch_state`, `queued_at`), status, user-facing lifecycle `stage`, title, persisted JSONB `messages`, persisted JSONB `timing_report`, nullable JSONB `plan_state`, `saved_interaction_id` assistant-message deduplication marker, initial branch SHAs, `deployment_triggered`, reply and timestamps. User-message objects in `messages` may include an `images` array containing only durable R2 URL, MIME type, and optional original name; base64 is never stored there. Assistant-message objects created by code-changing turns include the interaction ID, before/after commit SHAs, Pi leaf entry ID, and `canUndo`; these server-trusted values drive per-reply Undo and Fork controls. `pending_runtime_payload` temporarily seals BYOK runtime configuration, inline image/assets, and non-default plan run modes while a turn waits for a slot; it is cleared on completion or timeout. `timing_report` stores the latest turn's ordered spans (`startedAt`, `endedAt`, `durationMs`, status and safe detail) plus the total start/completion timestamps, so the report survives a cold container and Recent-chat reopen. `plan_state` mirrors Pi's durable plan phase, automatic flag, numbered steps, and completion counts for Recent-chat restore.
- `runtime_result` stores the latest terminal runtime response for replay after Fargate shutdown; new starts clear it.
- Unique constraint: `(company_id, conversation_id)` prevents conversation IDs from crossing company boundaries.
- **Used in:** Storetools storefront-agent routes, `orchestrator/server.js`, and the edit-sandbox Pi lifecycle.

#### `ai_provider_credentials`
Company-scoped seller BYOK model connections defined by `AiProviderCredential` in `schema.zmodel`. `server/utils/aiProviders.ts` checks the existing table using SELECT; it does not create or alter schema during requests.
- Fields: `company_id` (FK to `companies`, cascade delete), seller-facing `name`, `provider` (`openai`, `openrouter`, `gemini`, or `custom`), HTTPS `base_url`, provider `model_id`, AES-256-GCM `encrypted_api_key`, seller-declared `supports_images`, `enabled`, and timestamps.
- Unique constraint: `(company_id, name)`. API responses never return the encrypted value or plaintext key.
- **Used in:** `/api/ai/providers`, the AI Models page, storefront-agent model selection, and the ephemeral Pi model relay.

#### `storefront_design_profiles` (runtime-managed)
Company-scoped initial storefront design onboarding and rollout state, created by `storetools/server/utils/storefrontDesign.ts` and mirrored in both ORM schemas.
- Fields: unique `company_id` (FK to `companies`, cascade delete), status (`NOT_CONFIGURED`, `GENERATING`, `READY`, or `FAILED`), company/product description, design direction, optional Figma URL, asset/font/logo notes, other notes, selected vision model, dedicated agent `conversation_id`, error message, and timestamps.
- **Used in:** `/api/ecommerce-cms/storefront-design` and the storefront editor's post-provisioning design gate.

#### `edit_environment` (runtime-managed)
Provider-aware editing slot registry: generic GCP pool slots and company-bound AWS Fargate tasks. AWS rows are never reassigned across companies.
- AWS lifecycle fields: `compute_provider` defaults to `gcp`; `task_arn`, idempotent `task_token`, `lifecycle_state` (stopped/starting/running/stopping) and `lifecycle_error` track Fargate startup, capacity, shutdown and operational failures. `url` is the task?s private endpoint for AWS. All non-stopped AWS rows consume task capacity.
- `owner_company_id` identifies the storefront currently holding a processing slot; the orchestrator's partial unique index permits only one processing slot per non-null company.
- Fields: slot `id`, private Cloud Run `url`, `state` (`idle`, `processing`, or `quarantined`), authenticated affinity owner `owner_user_id`, currently hydrated Pi conversation `owner_conversation_id`, `last_activity_at`, hard-turn timer `processing_started_at`, legacy edit-session relation/assignment fields, and rollback-only `lease_owner`/`lease_until` compatibility fields. Runtime allocation does not renew or depend on the legacy lease fields.
- An idle slot remains reserved to `owner_user_id` for 15 minutes from `last_activity_at`, so that user can switch, create, or fork conversations in the same warm slot; the orchestrator rehydrates the requested conversation when it differs from `owner_conversation_id`. Processing rows cannot be claimed, and a user with a processing slot is not assigned a second slot. An idle row with expired affinity is globally eligible, ordered oldest first. A failed teardown is quarantined.
- **Used in:** `orchestrator/server.js`, `orchestrator/schema.sql`, and pool seed/provision tooling.

#### `sales_orders` / `sales_order_items`
The ERP Sales orders module uses the existing SalesOrder/SalesOrderItem models and
SalesOrderStatus DRAFT/CONFIRMED/CLOSED/CANCELLED. Its company counter/prefix supplies
order numbers. Existing GeneralPreference JSON at sales-orders/document:<id> holds
revision, subject, customer and line-pricing snapshots; sales-orders/defaults holds
independent design/defaults (with defaults-backup). The order's paymentTerms,
deliveryMethod, expectedShipmentDate and pricing totals use their existing columns.
Order saves preserve attachments, invoiced/payment flags and Bill.salesOrderId links;
confirmed orders have no bill/stock/receipt/journal effects until a separate workflow
creates those sources. Only schema.zmodel contract comments were added; no fields,
generated Prisma schema or database schema were changed.

#### `quote_custom_field_values` (QuoteCustomFieldValue)
Per-quote JSON values. The ERP quote editor reserves `_erpQuote` for its version,
revision, customer name/phone snapshot, payment terms, delivery estimate and per-line
discount/tax/barcode/size metadata. Other JSON keys survive quote edits.
- Fields: `quoteId` (unique, FK to `quotes`), `companyId`, `values` (`field_values` JSON)
- The table is declared in `schema.zmodel` and generated Prisma. Quote APIs only read/upsert records in the existing table; they do not create/alter the table at runtime.
- **Used in:** `server/utils/erp-quotes.ts` through `/api/quotes`; `pages/erp/quotes/index.vue` and `components/Quotes/Editor.vue` (add/edit routes). Existing `pdf_template` is retained for compatibility; the current company quote preference documentDesign controls presentation. `_erpQuote.document` records print visibility and `_erpQuote.workflow` records response revisions, invoice drafts, one issued Bill link, currency/document snapshots and email outcomes. Draft invoices in this metadata have no source/stock effects until issue. No new schema fields or posting functions are needed.

---

### CRM

#### `pipelines` (Pipeline)
Sales pipeline tracking clients through stages, per company.
- Fields: `companyId` (unique), `newClients[]`, `prospectClients[]`, `viewingClients[]`, `rejectClients[]`, `closeClients[]` — all arrays of client IDs
- **Used in:** storetools (CRM/marketing page)

---

### Misc / Infra

#### `addresses` (Address)
Polymorphic address table. Can belong to user, client, distributor, company, account, or delivery partner.
- Key fields: `firstName`, `lastName`, `phoneNo`, `street`, `locality`, `landmark`, `city`, `state`, `pincode`, `lat`, `lng`, `coord` (PostGIS geography point), `placeId`, `formattedAddress`, `type`, `active`
- Each FK is unique (one address per entity) except `clientId` which is non-unique (client can have many)
- **Used in:** storetools, server, marketplace, ecommerce-api/Revomotive cart checkout

#### `email_otp` (EmailOtp)
Temporary OTP for email verification.
- Fields: `email` (unique), `otp`, `expiresAt`
- **Used in:** storetools (auth)

#### `save_error_requests` (SaveErrorRequest)
Logs failed API requests for debugging.
- Fields: `companyId`, `requestData` (JSON), `errorMessage`
- **Used in:** storetools (error tracking)

#### `ai_chats` (AiChat)
AI chat conversation container.
- Fields: `id` (UUID, default), `title` (first 80 chars of first message), `companyId` (FK → Company), `userId` (FK → User), `createdAt`, `updatedAt` (touched on every new message)
- Relations: `Company`, `User`, `aiMessages AiChatMessage[]`
- **Used in:** storetools (AI chat)

#### `ai_chat_messages` (AiChatMessage)
Individual messages in an AI chat.
- Fields: `id` (UUID, default), `chatId` (FK → AiChat, cascade delete), `role` (`'user'` or `'assistant'`), `content` (text), `toolCalls` (Json? — `[{tool, args, result}]`), `attachments` (Json? — `[{type, url, name, size, duration, mimeType}]`), `createdAt`
- Relations: `AiChat`
- **Used in:** storetools (AI chat)

#### `statement_batches` (StatementBatch)
Bank statement upload batch — groups extracted rows from one statement file.
- Fields: `id` (UUID, default), `companyId` (FK → Company), `userId` (FK → User), `chatId` (String?, FK → AiChat — for chat-initiated uploads), `sourceFileName` (String?), `bankAccountId` (String?, FK → BankAccount — which bank this statement is for), `status` (`'PENDING'` or `'EXECUTED'`), `createdAt`
- Relations: `Company`, `User`, `AiChat?`, `BankAccount?`, `rows StatementRow[]`
- **Used in:** storetools (statement processing page, bank detail page upload)

#### `statement_rows` (StatementRow)
Individual transaction row extracted from a bank statement.
- Fields: `id` (UUID, default), `batchId` (FK → StatementBatch, cascade delete), `sno` (Int), `date` (String), `description` (String), `debit` (Float?), `credit` (Float?), `balance` (Float?), `operation` (String? — EXPENSE/TRANSFER/TRANSACTION/DISTRIBUTOR_PAYMENT/INVESTMENT/IGNORE), `operationMeta` (Json? — structured meta with real DB UUIDs), `operationLabel` (String? — e.g. "Expense(Rent)"), `userInput` (String? — what the user typed to classify), `executed` (Boolean, default false), `executionResult` (Json? — `{success, operationId}` or `{error}`)
- Relations: `StatementBatch`
- **Two-step flow:** Assign (AI classifies → saves operation/meta) → Execute (creates actual DB record using meta UUIDs)

#### `statement_mappings` (StatementMapping)
Saved remark→operation lookup for auto-matching future statements. Per-company.
- Fields: `id` (UUID, default), `companyId` (FK → Company), `remarks` (String — bank description), `operation` (String), `operationMeta` (Json?), `operationLabel` (String?), `userInput` (String?), `createdAt`
- Relations: `Company`
- **Auto-matching:** 30% keyword overlap matching (splits on `[\s\/\-\.]+`, matches if ≥30% of keywords present). Exact match takes priority; best-scoring partial match otherwise.

---

### Company holiday mutation ownership

`CompanyHoliday` stores one optional name per company/date (`@@unique([companyId, date])`). Generated create/update/delete operations are denied; validated holiday APIs own writes for admin/manager/accountant. The holiday editor supports explicit creation, scoped updates and confirmed removal. Bulk weekday actions are retired; weekly-off definitions remain in Shift work days. This policy change does not add database columns.

### Attendance adjustment mutation ownership

Generated AttendanceAdjustment create/update/delete operations are denied. Custom request APIs validate ownership and pending state; cancellation retains the row as CANCELLED. The management-only decision endpoint remains responsible for approval/rejection and atomic attendance/log correction. No database column migration is required for this permission change.
