### Accounts (`/accounts`)

## Independent Accountant area (`/accountant`)

The main ERP sidebar has an **Account** group. It renders the Accounts, Journals,
Planning and controls, Fixed assets and Setup headings and page links from
`utils/accountant-navigation.ts` through `components/Accountant/SidebarNavigation.vue`.
The group opens on accounting routes; the collapsed sidebar shows the same grouped
links in a scrollable popover. Each subheading is a keyboard-accessible dropdown;
the section containing the current page opens automatically, and other sections
start collapsed. It is available to admin, manager and accountant
roles across plans. Legacy Accounts is hidden from navigation; its history routes remain.
The previous `/accounts` pages are read-only history. Operational sources no longer
write, delete, move or recalculate `account_ledger_entries`.
Sales and expenses connect through ERP Accounting settings. Salary and staff credit
connect through Staff Accounting for new activity; bank statement posting remains independent. See `ARCH-pages-erp.md` for rollout rules.
Distributors are connected through Settings → Account → Purchase. Company account
configuration and transaction-form defaults are centralized on `/settings/account`;
see `ARCH-pages-settings.md` for the groups and default precedence.
Connected distributor purchases, credits, payments, returns and opening dues post
balanced journals in the same database transaction as the source write. Existing
history can be imported idempotently without replaying stock quantity changes.

Legacy posting disconnection (2026-10-06): billing, sale edits/status/deletion/restore,
expenses, purchase settlements, supplier credits/payments, payroll and staff credit
retain their source writes and new Accountant triggers. They have no runtime legacy
ledger dependency. Bill creation uses the distinct source-only
`create_bill_source_plpgsql` function. Expense creation reserves its counter and
inserts the full source/tax recovery in one transactional CTE without runtime DDL.
Company transfers exclude AccountLedgerEntry and legacy Investment/AccountTransfer
from graph traversal. Original archive rows stay in their original company while
native source journals reverse/repost. When old investments reference a transferred
staff member, the original CompanyUser link is retained inactive/deleted for history;
the destination gets the active membership. Staff operational sources still move.

The 15 legacy bank/opening, investment, standalone Receive/Pay and transfer mutation
endpoints return scoped HTTP 410 directing users to Accountant. Expense and recurring
expense APIs under the same `/api/accounts` prefix remain operational. Generated
CRUD for AccountLedgerEntry, MoneyTransaction, AccountTransfer, Investment, BankAccount
and CashAccount is denied in `schema.zmodel`; `organizationModelScope.ts` additionally
rejects direct/nested archive mutations. Source salary/supplier SQL still maintains
linked MoneyTransaction records needed by new postings. Salary and supplier credit
forms select active native BANK accounts; operational code never queries old
`bank_accounts`. Historical source IDs and saved `bank:<id>` snapshots are resolved
to native accounts when editing. No historical archive rows are deleted.

Legacy ledger GETs read persisted history without schema-ensure DDL. Old bank and
investment pages expose reads; Store settings displays legacy openings disabled and
links to native opening balances. Old bank history no longer launches statement
upload/execution. Legacy statement TRANSFER, TRANSACTION and INVESTMENT execution
and re-execution deletion are rejected. Expense/supplier statement source creation
remains available and does not write the archive. `statement-execution.ts` commits
source creation and row marking together, locks rows for retry safety and retains
prior receipts until replacement succeeds. Execution selects native BANK accounts;
`statementAmount` handles zero-debit deposits. Batch completion tracks remaining
rows so retries resume unfinished work. ISO date parsing remains a known limitation.

Tests: `tests/legacy-accounting-disconnect.test.ts` checks source dependencies, all
15 retired routes, direct/nested generated guards, statement rejection and Vue
compilation. The three actual ERP/supplier/staff API suites verify new postings and
fingerprint the whole legacy ledger after every operation inside an outer rollback.
`tests/legacy-company-transfer.integration.test.ts` verifies archive preservation
and native reversal/destination posting during a real source transfer.

`scripts/review-erp-accounting-workflows.mjs` reruns the maintained accounting
workflow, actual API, settings and archive checks sequentially. Set
`ACCOUNTING_REVIEW_DIR` to a new run directory to preserve prior fingerprints and
reports. Database-writing suites use disposable schemas or an outer rollback;
the runner uses Neon's direct endpoint for child suites so temporary-schema Prisma
sessions do not leave a test `search_path` on shared application pooler connections.
The standalone investor suite also selects the direct endpoint.
the three old committing company-page suites are excluded. It records public
source/financial table hashes and schema names before/after and exits nonzero on
failed/incomplete suites or persistent differences. Some focused probes deliberately
reproduce known defects: successful probe execution is not a product pass.
Raw rollback suites select the configured schema before their first source/archive
query because pooled sessions can retain a deleted fixture schema. The offline
archive-helper test also rolls back its warm-up DDL on a controlled connection.
`--resume --retry-failed --only=<comma-separated-suite-paths>` reruns selected
failures against the original baseline and archives each prior attempt's log.
`scripts/summarize-sidebar-accounting-recheck.mjs` combines their evidence with
the suite logs and focused Accountant/report type-check logs. Vue handler mocks
and injected API authentication do not establish browser or deployed-build behavior.

`pages/accountant.vue` owns the company selector above the page content. Accounting
navigation lives in the main layout, with no second sidebar or legacy-account link
inside the accounting page. `pages/accountant/[view].vue` chooses the chart,
journal list, transfers, directory, or management component under
`components/Accountant/`. Separate add/edit journal routes use the journal editor.
`composables/useAccountantApi.ts` sends requests to `/api/accountant` with the
selected company's authorized request headers. Changing company remounts the
child page; query-cache keys include the company ID.

Available views cover chart/account details, five-level sub-accounts, account
transactions, transfers, opening balances, bulk account status/watchlist updates,
manual journals, amount/percentage journal templates, recurring profiles,
reversals, credit entries, fiscal year-end adjustments, budgets and actuals,
transaction locks, currency adjustments, fixed assets/categories/depreciation/
disposal, contacts/projects, client engagements, and preferences.

### Ecommerce connection

`/accountant/ecommerce` (`components/Accountant/EcommercePage.vue`) connects new
ecommerce activity per company through `server/utils/accountant/ecommerce.ts`.
The `/api/accountant/ecommerce` router uses existing admin/manager/accountant
authorization, tenant scope and company transaction locks. Install migrations
`20261001120000_document_status_history` and `20261001130000_ecommerce_accounting`
with `node scripts/apply-ecommerce-accounting.mjs --apply`, then choose accounts
and activate in the page. Preview without `--apply` is read-only. The standalone
installer requires existing Accountant/ERP/party-link migrations, does not enable
companies and does not apply unrelated pending migrations.

Activation explicitly excludes existing orders: no fabricated payment dates or
silent historical import. Those orders show "History review required"; no history
import action is exposed. New storefront and seller-created orders use their linked
bill as financial truth. Deferred database triggers cover bill, entry and order
changes, including customer API raw SQL. ERP routes eligible ecommerce bills here
once; ordinary POS/expense and historical ERP posting paths remain unchanged.
Stock control flushes the ERP-prefixed constraints before comparing item quantities.

| Activity | Posting |
|---|---|
| Order/invoice | Dr receivable; Cr merchandise, delivery income, COD-charge income and output tax; Dr COGS / Cr stock at snapshotted entry cost |
| Discounts | Reduce merchandise consideration. Inclusive stored tax scales across discounted merchandise, never delivery/COD fees; exclusive tax already charged on top is retained |
| Redeemed rewards | Dr loyalty expense; only remaining money due enters receivables. Issuing unused reward points does not post money |
| First PAID bill | Dr courier COD clearing or gateway clearing / Cr receivable, using observed `paidAt`. Explicit cash uses cash; delivery is not bank settlement |
| Additional receipt | Dr collection account / Cr remaining receivable; full settlement synchronizes pending bill/order/checkout status without double collection |
| Bank settlement | Dr selected bank net of fees; Dr courier/gateway expense and supplied recoverable tax / Cr order clearing |
| Confirmed cost | Dr expense and supplied recoverable tax / Cr selected cash, bank, clearing or unpaid expenses. Quotes/waybills alone do not post cost |
| Payment of a recorded unpaid cost | Dr unpaid expenses / Cr actual funding; capped by the order's unpaid cost balance, with no second expense |
| Extra customer charge | Supplementary Dr receivable / Cr income and output tax. Does not rewrite the original storefront invoice total |
| Cancellation | Reverse sale/tax/receivable/COGS source posting; existing cancellation workflow restores quantities. Collected money remains an asset and becomes refund payable, not an automatic bank refund |
| Received return | Credit proportional merchandise/tax/rewards and optional original delivery/COD fees; restore received quantities and original-cost stock/COGS; create refund payable where needed |
| Completed refund | Dr refund payable / Cr actual funding account on the supplied date. Does not invoke a gateway refund API |

Return accounting accepts delivered/returned orders. Request approval, a policy fee,
reverse shipment or exchange waybill alone is not received stock, earned income, a
refund or a replacement sale. Exchanges use actual received returns and replacement
sales/extra charges. Returns remove any still-awarded bill points and cumulatively
restore whole redeemed points; fractional reward allocation stays in metadata until
it reaches a whole point. Rewards are never refunded as cash.

Activities require an actual date, reference and payload-checked UUID. Replays reuse
the journal; changed payloads fail. Per-order balances cap settlements/receipts/refunds
and clearing deductions. Invalid types, foreign accounts/items, excess quantities,
dates before the latest order posting and accounting locks roll back everything.
Once a financial return exists, edits/cancellation of the original invoice are blocked
to prevent double credit/restock; further received returns remain available.

Ecommerce-prefixed `accountant_v2_erp_sources` snapshots link balanced `ECOMMERCE` /
`ECOMMERCE_REVERSAL` journals with customer/order dimensions. Source corrections
reverse/repost at the source date under existing locks. Collections are retained
separately; refund-payable changes append dated adjustments. Journal links use the
existing viewer. Manual activities have no edit/delete endpoint, and their system
journals remain protected from generic edits. `npm run test:ecommerce-accounting`
covers PostgreSQL posting, API handlers, returns, scope, idempotency, locks and stock
control in an isolated schema which is rolled back. It also calls the production
`createEcommOrder` and `cancelEcommOrder` writers: COD creation through receipt,
bank settlement, delivery, received return and refund; and prepaid creation through
cancellation and refund. These checks verify fee/tax allocation, stock restoration,
collection deduplication, retained paid dates and balanced journals. This is backend
integration coverage; browser authentication and external carrier/payment-provider
calls are outside this test harness.

### Production adoption runner

`scripts/production-accounting/` owns schema installers, ERP setup, distributor,
cash/bank and ERP history imports, stock control and their shared helpers. Previous
script paths remain compatibility entry points. `run.mjs --config=<file>` performs
read-only preflight; `--apply` runs schema -> setup -> distributor -> cash/bank -> ERP
history -> transactions -> transfers -> staff setup -> stock -> verification. `plan.mjs` lists the canonical migrations under
`prisma/migrations`; source business logic remains in `server/utils/accountant`.
The folder runs within the deployed repository, not standalone.

Preflight lists missing tracked migrations; it does not verify that untracked tables
can be adopted. `apply-accountant-v2.mjs` rejects existing Accountant tables without
a matching completed migration record. Other installers also require matching
migration checksums. A schema created outside these migrations requires explicit
reconciliation before the standard schema stage can run.

Explicit production company IDs and cutoff are required. Per-run reports and stage
hashes support resume; earlier stages may already be committed when a later stage
fails. Cash import is not replayed after native ERP supersession. No development
review approvals or excluded source IDs are packaged. Final read-only verification
requires history coverage, native source lines, supplier dues, balanced journals,
current product Stock and cash-import balance plus ERP movement agreement. Detailed
usage and transaction boundaries: `scripts/production-accounting/README.md`.

The explicitly authorized purchase-order repair
`scripts/production-accounting/repair-purchase-order-accounting.mjs` changes only
PO IDs selected from a saved source audit, plus positive POs whose posted supplier
differs from the header in those selected companies. It adds `purchase-order-header-authority`
audit markers and a wrapper around the installed distributor event projection:
approved purchase amounts, GST, dates and suppliers follow PO headers; unapproved
sources keep normal credit precedence and existing exclusions. Native distributor
sync reverses/reposts mapped purchases. POs with no header/credit supplier use the
existing company Accounts Payable, ERP Stock and Input GST accounts, with null
supplier/contact IDs and immutable `PURCHASE_ORDER_SOURCE` journals linked through
`purchase-order-source-state` audit revisions. Deferred PO/credit triggers maintain
approved authority on edits, supplier assignment and deletion. Physical quantities,
old sources, credits and payments remain unchanged; stock control retains source
inventory valuation using Inventory Adjustments. Future distributor-view changes
must preserve the authority wrapper. Preview rolls back; apply requires an exclusive
backup and verifies PO/tax totals, supplier balances, stock, source hashes, unchanged
cash/bank and repeat synchronization. Usage and scope:
`scripts/production-accounting/DISTRIBUTOR-ACCOUNTING.md`.

Staff posting settings, source mappings and user-ledger journal links are documented
in `ARCH-pages-users.md` under Staff accounting connection. Activation excludes old
staff sources; it does not import salary history.

### Current stock control

`prisma/migrations/20260929110000_stock_control/migration.sql` installs opt-in
company stock control. `scripts/reconcile-stock-accounting.mjs` enables it and
reconciles each Stock account to current item quantity times variant purchase price.
Products with an already-posted PO use its saved stock account; other products,
including those without a PO, use `accountant_v2_stock_control.stock_account_id`.
That account is independently stored; changing Settings → Account → Billing's
Stock mapping does not change it. A differing sale mapping is offset by stock
reconciliation, which retains inventory in the control/product-mapped accounts.
Native source
postings are flushed before comparison so purchases and sales are not added twice.
The first difference posts to **Opening Inventory** (equity); later differences
post to **Inventory Adjustments** (expense). Entries use the reconciliation date,
respect date locks, and do not restate historical inventory balances. This is
current-cost valuation, not FIFO. Billing sales discounts do not reduce stock cost;
purchase discounts affect this valuation only if reflected in variant purchase price.

Deferred product/variant/item and journal triggers keep the control active after
source changes, including deletes. Product quantities are authoritative: manual
Stock postings are also reconciled back to that source value. Source records and
existing journals are preserved. Company snapshots and journal audit evidence keep
product, PO, item quantity and unit cost; journal details expose product/PO links.
Production commands and repeat behavior: `scripts/STOCK-ACCOUNTING.md`.

### Legacy Cash / Primary Bank history import

`scripts/production-accounting/remove-originals-nine-payments.mjs` is a narrowly
scoped, user-authorized correction for nine ORIGINALS CLOTHING supplier postings
totalling INR 249242. It keeps old payments and linked expenses, writes
`authorized-distributor-exclusion` audit records, and filters those exact
company/distributor/source keys from `accountant_v2_distributor_events`. Normal
distributor sync then posts balanced reversals and marks the source deleted in
the new accounting projection. Repeat sync is checked for zero changes. Future
redefinitions of this view must retain the audit exclusion filter. Apply requires
an exclusive backup containing source/journal/expense rows and the previous view
definition; preview rolls back. The subsequently authorized
`purge-originals-nine-journals.mjs` physically deletes these nine journals and
their nine reversals after exclusive backup and per-account zero-net checks.
Exclusions and old sources remain; repeat sync and Primary Bank balance are checked
before commit. The original/reversal rows are preserved in the purge backup.

`scripts/production-accounting/delete-originals-three-cash-postings.mjs` handles
the separately authorized hard deletion of three ORIGINALS cash supplier journals
totalling INR 27440. It backs up the exact source, projection, journals and lines,
adds the same audit exclusions, removes projection pointers and physically deletes
the journals (lines cascade). Old payments and linked expenses remain. Preview
rolls back; apply checks the cash increase, exactly three fewer journals, no leftover
lines, and zero changes on supplier sync, without creating reversals.

`scripts/import-legacy-cash-bank.mjs` reads the same `account_ledger_entries`
(CASH/PRIMARY_BANK, null account_id) as the old pages. Preview is read-only; explicit
`--apply` commits all selected companies together only after reconciliation. Targets
default to Cash code 1001 and the primary BANK account, with explicit-ID overrides.
It flips old money-in CREDIT into an asset DEBIT, preserves dates and source IDs,
combines matching cash/bank transfer legs and imports missing movements as immutable
LEGACY_CASH_BANK_HISTORY journals. Store settings `cash`/`bank` and their opening
dates must agree with old opening rows; these become normal OPENING_BALANCE journals
plus account-opening records, offset to code 2220 and reused on repeats. Other missing counterpart amounts require an explicitly
selected equity/liability migration offset account. This migrates these two ledgers,
not complete historical revenue/expense/tax/party subledgers.

ERP/distributor source-journal links identify already-posted movements; mismatching
amounts/dates/accounts or duplicate source aliases block the import. Native entries
are not edited and source data is not repaired. The script checks old stored running
balances, projected totals, locks and repeat execution. Changed/deleted previously
imported sources are reported for review instead of silently rewritten. Treat this
as an immutable migration snapshot; it does not install live legacy-write syncing.
Run `npm run test:cash-bank-import` for planner + isolated PostgreSQL coverage.
Production usage and offset policy: `scripts/LEGACY-CASH-BANK-IMPORT.md`.

Explicit reviewed exceptions use `--review=<snapshot.json>`: exact conflict objects
may be accepted only while old and projected new balances match the reviewed account
IDs and amounts. Other validation remains active; reports retain accepted conflicts
and imported journal audits store the review hash. `--migration-clearing` creates or
reuses a deterministic company-owned equity clearing account transactionally for
historical counterparts. It does not change the Store settings opening offset.

When upgrading to full ERP history, `scripts/import-erp-history.mjs` supersedes
source-matched cash migration entries using audited equal/opposite
ERP_HISTORY_MIGRATION_REVERSAL journals and native ERP postings. Do not force the
original cash-only importer over this upgraded history; use the ERP importer and
its repeat checks. The original cash snapshot does not include later source-based
corrections or previously absent refunds.

### Investors and ownership

The main ERP sidebar has an **Investments** group backed by `utils/investments.ts`.
`pages/investments.vue` provides the authorized company selector and remounts its
child on company/route changes; it does not nest the Accountant sidebar. Separate
routes/components cover `/investments/overview`, `/investors`,
`/capital`, `/allocate`, `/payouts` and `/settings` (all under `/investments`).
Investor accounts use `/investments/investors/:investorId`; the parameter deliberately
avoids `id`, which CompanyScope interprets as an ERP record lookup. Profile and
movement forms mount only when opened. `/accountant/investors` redirects to the
directory; the former all-in-one `Accountant/InvestorsPage.vue` was removed.
`DirectoryPage.vue` combines investor profiles, searchable contact details, dated
ownership/share totals, capital and profit-due balances in one list. Agreements
opens the selected investor's history and add/edit/delete controls on the same page.
Profile add/edit remains a modal; Account opens the individual ledger. The former
`OwnershipPage.vue` was removed. `/investments/ownership` redirects to the combined
investor page preserving query parameters, including the selected investor. There
is no separate Ownership sidebar entry.

The `investors` and `investor-profits` routers are registered in
`/api/accountant/[...path].ts`. The company-scoped
API links each new investor to a company user (`legacy_user_id` is reused for native
and imported links, unique per company/user). GET `/investors/users` lists active
company users and their existing investor link. Creation accepts `userId` or
`newUser {name,email,phone}`; selecting an existing membership never changes its role.
An existing email in the same company is reused; an identity outside that company
must first be added through Users. Fresh identities and memberships are created
atomically with role `investor`, an unusable random password hash (password-reset
flow for login), and the investor/accounts; failed profile creation rolls everything
back. Previously unlinked profiles can be linked when edited, but existing links
cannot be reassigned. Profile contact edits do not change the linked user's identity.
Native investor creation resolves existing active company accounts from the
Investments company defaults; explicit `capitalAccountId`, `profitAccountId` and
`loanAccountId` override those defaults for that investor. Equity is required;
profit payable and loan accounts are optional until those movements are used.
Native creation creates no chart accounts. Accounts can be shared by investors:
every journal line retains `sourceParties.investor`, while balances, profit-payment
limits and loan-repayment limits are calculated from that investor's events.
Events without the
required purpose account are rejected; receipts still debit the selected existing
Cash/Bank account and credit the mapped investor account. Legacy imports retain
their three-account creation contract, and existing profiles keep their mappings.
The profile modal offers account selections when adding or editing an investor.
Selecting Company default resolves the current default at save time; omitted
fields on an API edit preserve the existing mapping. Changing an account with a
nonzero balance for that investor/purpose is rejected until settlement or
reclassification; profile-only edits preserve all mappings. Mapping edits retain
before/after selections in the investor audit. Changing company defaults does not
rewrite existing investor mappings or journals.
Settings → Account → Investments also exposes an investor selector and override
editor. The same section configures
capital/loan cash-bank defaults, payout defaults and profit-distribution equity.
Dated ownership/profit-share terms
can be corrected by manager/admin through PUT `:id/terms/:termId` until protected
by posted allocations. The API rejects edits if either the original or proposed
effective date is on/before any allocation period end for that investor (including
reversed allocations), and validates duplicate dates and aggregate ownership and profit percentages, which cannot exceed 100% at any recorded effective date.
Ownership history exposes Edit/Delete agreement and explains protected records.
DELETE `:id/terms/:termId` requires manager/admin and rejects agreements on/before
any posted allocation period end. The confirmation explains that the earlier
agreement resumes (or the period has no agreement). Deletion revalidates company
ownership/profit totals, rolling back if restoring earlier terms exceeds 100%.
The deleted snapshot remains in AccountantAudit as `terms-deleted`. Corrections
retain the original nonzero company-share total; `terms-edited` AccountantAudit
entries retain the term ID and before/after values. Failed validations roll back
the correction. Shares, company share count and ownership must agree
when share counts are supplied. Total company shares are configured once under
Investment settings, stored in company-scoped append-only AccountantAudit records
(`investor-share-settings` / `configured`). GET/PUT `/investors/share-settings`
reads/writes the total; writes require manager/admin. Zero enables percentage-only
tracking. The agreement form displays the company total read-only and calculates
ownership when shares held are positive. The API requires a configured total for
share-count agreements, rejects a supplied stale total, and snapshots the configured
total in each new agreement. Existing agreements are never rewritten when settings
change; affected investors need new dated agreements. Percentage-only agreements
retain zero share counts. Capital contributions do not change ownership.

All six native movement types post published balanced system journals in company
base currency: CAPITAL_IN/OUT, PROFIT_ALLOCATE/PAY and LOAN_IN/OUT. The API uses the
existing transaction/company lock, role gate, active-account checks and date locks.
Request UUIDs are payload-checked for retries. The allocation page calculates
company profit from published, non-deleted INCOME/EXPENSE journal lines in the
selected period, converting each line to base currency with its journal exchange
rate and rounding to cents. Drafts/deleted lines are excluded. This is posted book
profit, so missing source accounting and closing/adjustment entries affect the
result; it is not a sales-only estimate. The user enters only the company amount
to share, which cannot exceed positive period profit. The preview lists every
active investor's saved share, allocation, unassigned/rounding amount and retained
profit. Missing agreements or changes inside the period block approval rather than
guessing entitlement; split the period at agreement changes.

Manager/admin approval posts all positive allocations in one company transaction.
The preview hash covers profits, participants, terms, funding account and amounts;
approval recomputes it and rejects changed inputs. Overlapping live allocations
anywhere in the company block another batch, including old individual allocations.
Amounts round down to cents so totals never exceed the chosen pool; unused shares
and rounding remain in the business. The canonical request and immutable result
are stored in AccountantAudit (`investor-profit-batch`, `approved`), while each
event retains `details.batchId`. Retries return the saved result. Batch history
shows original snapshots and counts later individual reversals. The legacy
per-investor event API remains compatible, but the UI uses company-wide allocation.
The snapshot retains the applicable agreement; later terms cannot rewrite a period
already used for allocation. Profit/loan repayments and reversals must preserve
nonnegative payable/loan balances throughout the event history. Capital may become
negative; it is shown explicitly rather than silently clamped.

The pages provide company/as-of balances, investor profile/doc links, term history,
capital/profit/loan ledger balances, reasoned reversals and CSV statement export.
A system equity account (`INV-DISTRIBUTION`, Investor profit distributions) is
created/reused automatically. Settings can select another active company equity
account, excluding dedicated investor accounts; latest append-only AccountantAudit
`investor-profit-settings` / `configured` records own this configuration. The
allocation form never asks for an equity account. Payouts select cash/bank separately.
No additional schema migration is needed beyond the original investor installation.
Documents are HTTP/HTTPS references, not file uploads. Access is the same
admin/manager/accountant gate as Accountant; this is not an investor login portal.

`scripts/production-accounting/copy-old-account-history.ts --only=investments` imports legacy `investments`
atomically for an explicit company/cutoff, with dry-run rollback by default. It
uses explicit completed-row counterpart mappings when supplied, otherwise derives
Cash/primary Bank from the old payment mode; verified existing source
journals can be reclassified from their equity line without replaying cash. Pending
rows remain unposted. Profiles group by company/user, with no inferred ownership.
Source fingerprints and request/legacy IDs make repeats safe, and the migration's
trigger prevents imported legacy rows being updated/deleted. All old investment writes are now retired; the old page links to
Investors but retains its history. Install/import commands and limits are in
`scripts/production-accounting/INVESTORS.md`; this is a standalone adoption step.

### Receive / Pay money

`/accountant/money` uses `components/Accountant/MoneyPage.vue` and the
`/api/accountant/money` router in `server/utils/accountant/money.ts`.
Select Receive/Pay, date, cash/bank account, purpose account, amount, optional
reference/note and a company-linked client, staff member, distributor or contact.
Receivables/payables require a person. Cash/bank-to-cash/bank movements use Transfers.
Receipts debit cash/bank and credit the purpose account; payments do the reverse.
Entries post immediately like transfers, in company base currency, without creating
legacy money transactions or marking source invoices/expenses paid. Existing paid
source documents should be handled on their source page to avoid a second posting.

No new table is needed: published system journals use MONEY_RECEIVE/MONEY_PAY and
retain sourceParties/distributorId/partyId on their lines. Request UUIDs plus an audited
canonical payload make identical retries safe and reject reuse with changed data.
The page lists entries with search/pagination. Reverse creates a separate
MONEY_REVERSAL journal preserving person links; originals remain visible. Company
scope, active accounts, cent precision, accounting/banking locks and role checks are
server-enforced. `npm run test:accountant-money` runs isolated database coverage.

### Posting and controls

- The new `Accountant*` models map to `accountant_v2_*` tables. Generated
  ZenStack CRUD is denied; the authenticated Accountant API owns their writes.
- Access requires `admin`, `manager`, or `accountant`. Cross-company selection
  passes `useCompanyRequestSession`; all database delegates receive company
  predicates from `server/utils/accountant/context.ts`.
- A request-local Prisma transaction and company advisory lock cover validation,
  posting, numbering, and audit together. Numbering includes soft-deleted records.
- Journal lines use positive two-decimal amounts and equal debit/credit totals.
  Only published, non-deleted journals contribute to account balances. Draft
  edits replace lines and clear approvals. Published manual journals are reversed
  through a separate journal, not edited. System journals are controlled by their
  originating transfer, opening, recurring profile, adjustment, or asset action.
- SIMPLE approval needs one distinct approver; MULTI_LEVEL needs two. Approvers
  must be admins/managers; self approval follows the preference. Preferences are
  editable only by admins. Manual journals, recurring children, and year-end
  drafts expose approval/publish actions in the journal list. Reversals become
  drafts when approvals are enabled.
- The chart and account ledgers report company base currency using each journal's
  exchange rate; original journal lines retain entered amounts/currency. Exchange
  conversion must also balance after cent rounding. Ledger dates carry forward
  earlier opening/movement, and the chart provides 50-row ledger pagination.
- Account-editor and opening-balance-screen writes share one `OPENING_BALANCE`
  journal per account. Opening values are entered in company base currency and
  offset against `Opening Balance Adjustments`. Used accounts cannot be deleted;
  they can be marked inactive.
- Locks apply to the new books only: ALL/ACCOUNTS guard accounting dates, and
  BANKING also guards transfers. Editing/removing a posted source checks its
  previous date as well. Unlocking records the actor and reason.
- Recurring generation is user-triggered using **Generate**, not a background
  scheduler. Month/year increments clamp to the original schedule day. Draft
  children are published from the journal list. Reversal dates are planning
  metadata; **Reverse now** performs the reversal.
- Budgets use the configured fiscal start month (default April). The UI's amount
  is per selected month/quarter/year; actuals follow the account's normal side.
- Asset registration records a starting book value; acquisition itself is entered
  through a manual journal. Depreciation posts once per successive month and
  cannot precede availability. Disposal cannot precede acquisition/depreciation.
- Currency revaluation uses entered foreign/base balances and rate. Draft
  adjustments have a Publish action; posting is journal-linked and respects the
  revalued account's normal side.
- Contacts/projects are separate directories for the new books. Client engagement
  service/access labels describe the engagement; they do not grant application login
  permissions to contacts.

### Setup and verification

`schema.zmodel` is authoritative; migration
`prisma/migrations/20260926120000_accountant_v2/migration.sql` only adds the new
tables, enums, indexes, and foreign keys. `npm run db:accountant` applies exactly
that migration atomically and records it in `_prisma_migrations`; it does not run
other pending migrations or copy old accounting data. It refuses partial/untracked
Accountant tables and verifies the checksum on subsequent runs. Generate the
Prisma client/policies with ZenStack and restart the dev server after schema changes.

`npm run test:accountant` compiles/renders the new Vue views and runs database
integration coverage against a randomly named, isolated schema. Integration tests
remove only their own test schema. They exercise tenancy, journals/approvals,
openings, transfers, recurring entries, budgets, assets, currency, locks, and
concurrent numbering.

## Existing accounts area

**Files:**
- `pages/accounts/cash.vue` — Cash ledger (date-filtered, PDF export)
- `pages/accounts/bank/index.vue` — Bank accounts list (primary + secondary)
- `pages/accounts/bank/[id].vue` — Bank ledger for a specific bank account
- `pages/accounts/tax.vue` — Tax account, bill-wise tax collected from bill entries
- `pages/accounts/investment.vue` — Capital investments / withdrawals
- `pages/accounts/transfer.vue` — Account transfers (cash ↔ bank ↔ investment)
- `pages/accounts/transaction.vue` — Money transactions (give/receive)
- `components/Accounts/Form.vue` — MoneyTransaction add/edit form
- `components/Accounts/List.vue` — MoneyTransaction list with filters
- `components/Bank/Form.vue` — BankAccount add/edit form
- `components/Investment/Form.vue` — Investment add/edit form
- `components/AccountTransfer/Form.vue` — AccountTransfer add/edit form

**Server API routes (ALL raw SQL via `pg` pool):**

| Route | Purpose |
|---|---|
| `GET /api/accounts/cashledger` | Cash ledger with running balance for date range |
| `GET /api/accounts/primaryledger` | Primary bank ledger (bank on `companies` table) |
| `GET /api/accounts/secondaryledger?bankId=` | Secondary bank ledger (from `bank_accounts`) |
| `GET /api/accounts/taxledger` | Computed tax account from `entries` joined to `bills` |
| `GET /api/accounts/cash-ledger.pdf` | PDF download of cash ledger |
| `GET /api/accounts/bank-ledger.pdf` | PDF download of bank ledger |
| `POST/PUT/DELETE /api/accounts/transactions` | Scoped 410; use Accountant Receive/Pay (includes retired bulk status) |
| `POST/PUT/DELETE /api/accounts/transfers` | Scoped 410; use Accountant transfers |
| `POST/PUT/DELETE /api/accounts/investments` | Scoped 410; use native Investments |
| `POST/PUT/DELETE /api/accounts/banks` | Scoped 410; legacy bank identities are read-only |
| `PUT /api/accounts/primary-bank`, `/opening-balances` | Scoped 410; use native account/opening management |
| `POST/PUT/DELETE /api/accounts/expenses` | Active source writes with deferred native ERP postings only |

**ZenStack hooks used:** historical investment, transfer and bank lists keep their
read hooks. The transaction page reads original MoneyTransaction source records;
linked staff/supplier source APIs may still maintain those records. Bank/investment
mutation controls and the old transaction-list bulk-status control are removed.

**Tables touched (all via raw SQL):** `companies`, `bills`, `expenses`, `money_transactions`, `account_transfers`, `bank_accounts`, `distributor_payments`, `distributors`, `distributor_companies`

**Persisted account ledger table:** `account_ledger_entries`

**Archive utilities:** historical row builders/schema/write helpers live only in
`scripts/lib/legacy-account-ledger.ts` for offline reconciliation tests. Runtime
`server/utils/account-ledger.ts` contains readers only, used by four historical
ledger GET routes. Source workflows cannot import the offline helper. Readers
perform no schema installation or financial writes. Unused legacy transaction
and transfer forms (`Accounts/Form.vue`, `AccountTransfer/Form.vue`) are removed.

**Credit account:** `pages/accounts/credit.vue` reads frozen persisted CREDIT rows.
New bill credit, settlement, staff credit and payroll changes post through native
ERP/Staff Accounting and no longer append or rebuild old credit rows.

**Computed tax account:** `pages/accounts/tax.vue` fetches `GET /api/accounts/taxledger`, which groups bill entries by bill and computes taxable value/tax using the same tax-inclusive formula as GSTR-1 (`entries.value`, `entries.tax`, `bills.created_at`, and `session.isTaxIncluded`). This page is derived from `entries`/`bills`; it does not write rows to `account_ledger_entries`.

---

#### Two-Tier Bank Architecture

The system has two distinct kinds of bank accounts:

| Type | Storage | Edit path |
|---|---|---|
| **Primary bank** | Fields directly on `companies` table (`bankName`, `accHolderName`, `accountNo`, `ifsc`, `gstin`, `upiId`, `bank` = opening balance, `openingBankDate`) | `PUT /api/accounts/primary-bank` |
| **Secondary banks** | `bank_accounts` table with `openingBalance` and `openingBalanceDate` | `POST/PUT/DELETE /api/accounts/banks` |

- `bank/index.vue` merges both into one list — primary is always shown as a synthetic row with `isPrimary: true`, using company bank fields when present and a `Primary Bank` fallback when blank
- Legacy banks expose Details only. Create/edit/delete APIs are retired (HTTP 410).
- Ledger routing: `/accounts/bank/primary` → `primaryledger`; `/accounts/bank/{id}` → `secondaryledger?bankId={id}`

---

#### Persisted Ledger Calculation (raw SQL, `pg` pool)

`account_ledger_entries` is the account ledger source of truth. Ledger APIs compute opening as the sum of persisted rows before `from`, fetch persisted rows between `from` and `to`, and return stored `balanceAfter` as the running balance. `CREDIT` increases account balance and `DEBIT` decreases it.

**Credit ledger row sources:**

| Source tag | Table | Debit | Credit |
|---|---|---|---|
| `BILL` | `bills` (paymentMethod=Credit) | 0 | grandTotal |
| `BILL` | `bills` (paymentMethod=Split, Credit portion) | 0 | split amount |
| `BILL` | bill payment-method change away from Credit | previous credit amount | 0 |
| `USER_CREDIT` | `user_ledger_entries` (`CREDIT_BILL_PAYMENT`) | amount | 0 |
| `USER_CREDIT` | `user_ledger_entries` (`USER_CREDIT_BILL`, non-bill source) | 0 | amount |

**Cash ledger opening balance:** `accountLedgerRowsForApi` sums signed `account_ledger_entries` before `from` for the company and CASH account. It does not recalculate the opening value by querying bills, expenses, transfers and transactions on each read. These rows are frozen historical data; operational source writes no longer rebuild them.

**Cash ledger row sources:**

| Source tag | Table | Debit | Credit |
|---|---|---|---|
| `OPENING` | — | 0 | openingBalance |
| `BILL` | `bills` (paymentMethod=Cash) | 0 | grandTotal |
| `BILL` | `bills` (paymentMethod=Split, Cash portion) | 0 | split amount |
| `EXPENSE` | `expenses` (paymentMode=CASH, status=PAID) | totalAmount | 0 |
| `DISTRIBUTOR_PAYMENT` | `distributor_payments` (paymentType=CASH) | amount | 0 |
| `MONEY_TRANSACTION` | `money_transactions` (CASH, PAID) | amount if GIVEN | amount if RECEIVED |
| `ACCOUNT_TRANSFER` | `account_transfers` (CASH involved) | amount if from_type=CASH | amount if to_type=CASH |

Salary payments and manual staff-credit rows flow into these account ledgers through `money_transactions`: salary payments are `EMPLOYEE/GIVEN/PAID`, manual `USER_CREDIT_BILL` rows are `EMPLOYEE/GIVEN/PAID`, and manual `CREDIT_BILL_PAYMENT` rows are `EMPLOYEE/RECEIVED/PAID`.

**Primary bank ledger:** Same structure but tracks `BANK`/`UPI`/`Card` payment modes (and split portions), `distributor_payments` (debit), `money_transactions` (bank mode), `account_transfers` (bank side).

`expenseLedgerRows` and `distributorPaymentLedgerRows` in `scripts/lib/legacy-account-ledger.ts`
build independent deductions. When a supplier payment and its linked paid expense
both have persisted rows, the old ledger can count the same payment twice. The
source uniqueness index distinguishes their source types and does not merge them.
The cash-history importer aliases linked expenses to native supplier journals and
reports mismatched legacy movements for review rather than posting the payment twice.

**Archive filtering:** the ledger APIs do not query or re-filter live bills. They read persisted rows; current bill status/payment changes do not alter history. New ERP marketplace exclusions belong to native source triggers.

**Opening dates:** the signed sum of persisted rows with `entry_date < from` determines opening, including any historical OPENING source rows. These readers do not add `companies.cash` or `companies.bank`, and do not apply a separate company opening-date guard.

**Zero-opening behavior:** the ledger reader does not special-case a `companies.cash` or `companies.bank` value of zero. Its opening balance is the signed sum of persisted account-ledger rows before `from`; a zero opening-source row does not erase prior posted movement.

---

#### `pages/accounts/cash.vue` — Cash Ledger
- Fetches via `GET /api/accounts/cashledger?from=&to=` using Nuxt `useFetch`
- Shows: Opening Balance, Total Cash In (sum of period credits, excluding the synthetic OPENING row), Total Expenses (sum of EXPENSE debits only; other cash debits still appear in the ledger)
- Ledger table: Date, Source, Description, Debit, Credit, Balance
- Footer: Closing Balance
- PDF download: `GET /api/accounts/cash-ledger.pdf`
- Date picker with preset ranges (7d, 14d, 30d, 3m, 6m, 1y)
- **Soft-deleted row highlighting:** `styledLedger` computed adds `class: 'bg-red-50 text-red-600'` when `row.precedence === true`; `:rows` is bound to `styledLedger`. Current persisted-ledger rows from `accountLedgerRowsForApi` do not return `precedence`, so this class is inactive unless an API adds that field.

---

#### `pages/accounts/bank/index.vue` — Bank Accounts List
- Lists primary bank (synthetic row from `useFindUniqueCompany`) + secondary banks (`useFindManyBankAccount`) merged
- Primary row has an `isPrimary: true` badge.
- Details is the only row action. Add/Edit/Delete controls and form modals are removed; the old mutation endpoints return 410.
- The page links to native Accountant chart/account management.
- Click "Details" → primary opens `/accounts/bank/primary`, secondary opens `/accounts/bank/{id}`

---

#### `pages/accounts/bank/[id].vue` — Bank Ledger
- Route param `id = 'primary'` → fetches `GET /api/accounts/primaryledger`
- Route param `id = '{bankId}'` → fetches `GET /api/accounts/secondaryledger?bankId={id}`
- Same UI as cash ledger (date range, table, running balance, closing balance)
- PDF download: `GET /api/accounts/bank-ledger.pdf`
- **Soft-deleted row highlighting:** same `styledLedger` pattern as `cash.vue` — `class: 'bg-red-50 text-red-600'` when `row.precedence === true`. Applied on `primaryledger` API; `secondaryledger` is not affected (secondary bank rows don't come from `bills`).

---

#### `pages/accounts/investment.vue` — Investments
Read-only history through `useFindManyInvestment`. Mutation controls are removed; the old APIs return 410. New capital, shares and payouts use native Investments.
- `useFindManyInvestment` with `include: { user: true }`, ordered by `createdAt desc`
- Fields: `direction` (IN = invested, OUT = withdrawn), `amount`, `paymentMode`, `status`, `note`, `createdAt`, `CompanyUser`
- `CompanyUser` connected via compound key `companyId_userId`

---

#### `pages/accounts/transfer.vue` — Account Transfers
Read-only original transfers. The old mutation APIs return 410; new transfers use `/accountant/account-transfers`.
- `useFindManyAccountTransfer` ordered by `createdAt desc`
- Fields: `fromType` (CASH/BANK/INVESTMENT), `toType`, `amount`, `note`, `fromAccountId?`, `toAccountId?`
- `fromAccountId / toAccountId = null` → refers to the primary account of that type
- `fromAccountId / toAccountId = {id}` → refers to a specific `BankAccount`
- Display label: if type != 'BANK' → show type name; if BANK + id exists → `BANK (bankName)`; if BANK + null → `BANK (Primary)`
- Historical bank labels remain; no legacy transfer form is exposed.

---

#### `pages/accounts/transaction.vue` + `components/Accounts/List.vue` — Money Transactions
The page reads original MoneyTransaction records and links to `/accountant/money`. Its legacy mutation APIs return 410. The unused filtered list component has also lost its old bulk-status write control.
- Optional `accountId` field: links to a specific BankAccount (if paymentMode is BANK)
- No explicit `companyUser` link on MoneyTransaction — only `companyId`

---
## Other finance views

### `pages/accounts/tax.vue`

Read-only tax account for a selected date range. It calls `/api/accounts/taxledger` and presents tax totals, bill-level ledger rows and a rate summary. Values are derived from bill entries rather than edited on this page; changing a bill is done in the sales editor.

### `pages/accounts/credit.vue`

Credit-account ledger for the selected date range. Calls `/api/accounts/creditledger`, showing opening, movement and closing balance from persisted CREDIT ledger entries. It is a financial account view, not the staff-specific credit register at `pages/users/credit-bills.vue`.

### Authorized old-account rebuild

`production-accounting/copy-old-account-history.ts --reset` replaces all native and
imported transfers, standalone money postings and investor events for ORIGINALS
CLOTHING only. All deletions and recopy share one transaction; apply requires an
exclusive backup file before deletion. Profiles/terms and old sources remain.
Repeat checks, unchanged-source verification, date locks and balanced-journal
checks run before commit. Related retry/import audit metadata is included in the
backup and rebuilt. See `scripts/production-accounting/COPY-OLD-ACCOUNT-HISTORY.md`.
The previous three import CLI files were removed; the runner/npm commands now use
this entrypoint with `--only` for incremental adoption.

### Standalone old transaction adoption

`scripts/production-accounting/copy-old-account-history.ts --only=transactions` and its `lib` helper import
PAID standalone `money_transactions` or reuse source-matched verified cash-history
journals. All selected companies are one transaction; preview rolls back, repeat
execution is checked, changed/deleted imports fail. Salary/staff/distributor-owned
sources are skipped and pending rows are reported without money posting. Missing
purposes require explicit per-source mappings or the optional migration clearing
flag. It never guesses revenue/expense from party type. Exact details and production
commands: `scripts/production-accounting/TRANSACTIONS.md`.

An audit `transaction-history-import` links each old source ID/fingerprint to its
journal. Receive/Pay lists native entries, LEGACY_MONEY_RECEIVE/PAY entries and these
verified existing journal IDs. It derives direction from the cash/bank line. The
old Transactions route and sidebar show read-only original `money_transactions` at `/accounts/transaction`, with a link to `/accountant/money`; old PUT/DELETE
reject migrated standalone entries. Reversals use MONEY_REVERSAL and retain history.
Old source tables remain. This importer does not install generic live legacy-write
syncing: new standalone activity belongs in Receive/Pay money.


### Old transfer history adoption (2026-09-30)

`production-accounting/copy-old-account-history.ts --only=transfers` and `lib/import-transfers.mjs` create
`accountant_v2_account_transfers` and balanced ACCOUNT_TRANSFER journals from old
`account_transfers`. Verified LEGACY_CASH_BANK_HISTORY postings are preserved and
reversed through TRANSFER_HISTORY_MIGRATION_REVERSAL before replacement. Missing
named-bank legs use existing unambiguous bank mappings. Investment transfers preserve
the verified clearing counterpart unless explicitly mapped; no investor is inferred.

Import audits link source fingerprints, transfer IDs, new journals and reversals.
Runs are atomic across selected companies, preview rolls back, and repeat runs must
be no-ops. `--verify` reads and checks the imported links/lines without mutation. The
production runner includes `transfers` after `transactions`; cash import replay is
blocked after replacement. New-page imported rows hide Edit/Delete; the router and
old transfer PUT/DELETE also reject imported-history mutation. Native new transfers
retain their existing edit/delete workflow. The old `/accounts/transfer` page shows read-only original `account_transfers`, with named banks and a link to `/accountant/account-transfers` for current entries. Source
tables remain intact.
