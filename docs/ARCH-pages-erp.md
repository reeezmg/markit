### ERP (`/erp`)

The user-facing sidebar group and navbar are labeled **Sales**. Existing `/erp/*`
routes remain, including `/erp/settings` for sales accounts, printer settings,
numbering and the shared sales/invoice/quote/sales-order preference editors. See
`ARCH-pages-settings.md` for settings behavior and company scoping.

After-sales registration is part of the bill source transaction for products with
linked configurations. With after-sales enabled, billing requires a customer and
shows a unit-details icon beside each row's Delete action, including mobile cards.
The modal captures optional serial, delivery and installation dates for each covered
unit; returns select exact registered units there. There is no serial-number column
or standalone registration panel. Confirm stages the modal values on draft rows;
Cancel leaves the draft unchanged. Saving the bill maps them to the existing
per-unit payload. Ecommerce delivery remains order/carrier-owned. Invoice edits
require removed unit IDs for quantity reductions, product changes or customer
corrections, and link to service history. Returned/replaced units retain their original
quantity slots so later source edits cannot silently recreate coverage. Explicit
service-job invoicing uses the existing unpaid invoice flow; completion alone never
collects money. See `ARCH-after-sales.md`.

Completed service visits/resolved claims support named labour/other charge lines plus
regular and service product parts. Explicit conversion opens the existing invoice
editor for payment/print/share. Service invoices can total zero (including free stock
parts); ordinary invoice issuance retains its positive-total rule. Only the internal
service source option or a verified existing service-invoice link permits zero.
After saving a completed visit/resolved claim, the service product page asks whether
to create its invoice. Create invoice opens billing; Later leaves the saved job
available for invoicing afterward. Saving alone does not issue an invoice or payment.

Head-office administration uses local table filters or form company fields across
billing/sales/expenses, products/purchases, suppliers, staff, clients, coupons,
reports, Accountant and Investments. Settings now retains its own `entryCompany`
selection across tabs through `useSettingsCompany`, without a sidebar switch.
Offline stock, notifications, cleanup and legacy account-history pages also have
local company controls. Statement review resolves the saved statement's owner.
Organization management and global user credentials remain organization/user
operations. The separate Storefront navigation (CMS/orders/editor/AI) is not part
of this ERP company-control change.

#### Expense parties (2026-10-12)

`Expense/PartySelect.vue` is shared by quick-add and edit. Its searchable menu has
Users, Distributors and Clients headings and one optional selection. The scoped
`GET /api/accounts/expense-parties` endpoint reads company memberships; writes
validate and lock that membership and category in the source transaction.
`from_id` remains the staff link; the local `schema.zmodel` adds nullable
`distributor_id` and `client_id` relations to company memberships. At most one
party is allowed. These fields were synchronized to the authorized `.env` test
database on 2026-10-21 through the zmodel/generate/db-push workflow. Other database
deployments require their own authorized schema release before using the APIs.

Expense lists/search/exports display Party and accept typed `partyKeys`; legacy
`userIds` remain supported. Edit uses `expenseDate`, preserving the document date.
`server/utils/expense-party.ts` invalidates the native source signature on a
party-only edit so native posting checks its date locks and reverses/reposts.
After deferred posting, POST/PUT/status enrich only the current ERP journal lines
with the selected ID/name snapshot and distributor dimension. Amounts, tax,
cash/bank/accrual postings and excluded-history rules remain owned by native ERP.
The enrichment runs through these expense APIs, not arbitrary direct SQL writes.
Linked distributor-payment expenses resolve their party from DP, are edited/deleted
through Payments, and never create an extra expense journal. Expenses invalidate
the Accountant query cache and refresh open distributor Accounts views.

#### New Accountant posting

Operational source writes no longer maintain the old Accounts ledger (2026-10-06).
The source documents, stock effects and native deferred posting transactions remain.
Legacy historical ledger rows are preserved; see `ARCH-pages-accounts.md`.

Billing, Sales and Expenses use company-scoped defaults configured under
Settings → Account; their Accounting buttons have been removed.
`/api/accountant/erp` GET/PUT and POST `/enable` are implemented by
`server/utils/accountant/erp.ts`. Setup requires admin/manager/accountant access.
Enabling records existing bills/expenses as excluded; only new documents auto-post.
Billing and Sales share one bill source, not separate journals.
The 2026-10-21 test-branch activation also provisioned its company-owned chart and
enabled staff accounting without importing history (see `ARCH-pages-accounts.md`).
`tests/branch-billing-write.integration.test.ts` and
`tests/branch-expense-write.integration.test.ts` now require ERP enabled for both
offices instead of skipping branch journal assertions. Billing checks exact mapped
sales/tax/settlement amounts and customer receipt/reversal lines; expenses check
exact recovery/accrual/payment amounts through creation, edits and deletion.
Ordinary ERP posting requires bill `type = BILL` (null defaults to BILL). A linked
ecommerce invoice with `type = STANDARD` does not post through ordinary ERP history.
Its accounting belongs to the separate ecommerce connection; disabled connections
and excluded historical orders require their own history review. Enabling that
connection does not silently backfill old orders.
`20260927170000_erp_party_links` stores `sourceParties` ID/name snapshots on every
ERP journal line: bill client, bill staff user, bill credit recipient, and expense
selected user (`from_id`). `20260930140000_customer_account_links` additionally
snapshots the bill's company-scoped B2B `account_id` as `creditAccount` (ID/name).
This customer identity can coexist with client/staff dimensions on the shared
receivable account. `/api/accountant/erp/customers/:id` sums published receivable
lines tagged with that identity, including reversals, to return its due balance.
Company membership is validated for new/changed links.
These dimensions do not create separate accounts or turn a staff user into a debtor.
Party changes reverse/repost; reversals retain the original snapshots. Current posted
sources are enriched by migration without changing balances; superseded journals
are not assigned unverified historical identities. Journal details and account
transaction rows display these labels. Excluded history remains excluded.


`20260927150000_erp_accounting` adds settings/source snapshots and deferred triggers
on bills, entries, expenses and distributor-payment links. Writes and journals commit
together; edits/deletions reverse previous journals, and restored documents re-post.
Accounts are frozen per source. Company/date locks and balanced journals are enforced.
Cash/bank/credit/split bills post sales and output tax; entry tax is extracted from
tax-inclusive values and allocated proportionately to invoice totals. COGS uses the
variant purchase price captured per entry/variant on first posting, including returns;
unknown purchase prices contribute zero. This is not FIFO inventory valuation.
Only non-Markit `BILL` documents in PAID/PENDING state post. Other states reverse them.
Paid expenses credit cash/bank; pending/unpaid expenses credit accrued expenses.
Expense quick-add and edit forms capture total inclusive of tax, included tax and
an explicit full/none/partial recovery choice. `Expense.recoverableTaxAmount` alone
posts to Input GST; the remaining total posts to expense. POST/PUT validate finite
two-decimal amounts and require a choice for positive tax. Existing expense tax
treatment is preserved by `20260927160000_expense_tax_recovery`; new raw expenses
default to zero recoverable tax. Recording the choice does not verify eligibility.
Expenses linked to distributor payments never post a second expense journal.

Install with `npm run db:erp-accounting`. From Storetools, preview setup with
`npx tsx scripts/connect-erp-accounting.ts --company=<id>`; add `--apply` to connect.
Repeat company arguments for several companies. Preview rolls back database changes.
No existing history or cash/bank opening balances are imported by this command.

Explicit historical adoption uses `scripts/import-erp-history.mjs` with selected
enabled companies, `--through=YYYY-MM-DD` and optional `--apply`. It force-imports
bill/expense sources, reverses prior source-matched cash migration journals (including
their clearing counterpart), and retains those originals for audit. Existing stock
quantities and source documents are not replayed. Exact source errors block the batch;
current journal/account amounts, balance and repeat no-op checks run before commit.
Historical client snapshots may retain the bill's recorded client when current
membership is absent, with an audit entry. See `scripts/ERP-HISTORY-IMPORT.md`.

Historical `test:erp-accounting` fixtures create an isolated schema and must not be
run under the current no-schema-change policy. Customer receipt verification uses
the schema-free tests documented below.
`npm run test:erp-accounting:api` exercises actual billing/expense handlers against
installed database functions with test authentication. It wraps handler commits in
savepoints and flushes deferred triggers, then rolls back all test records, counters
and journals. It requires an enabled company with staff, a client and categories.
It does not test browser login. `node scripts/verify-erp-accounting.mjs` verifies
existing postings inside a rolled-back transaction.

`npm run test:products-distributor-accounting:api` additionally exercises the combined
purchase-to-sale lifecycle, including purchased stock, COGS and sale quantity changes,
using actual handlers with rollback-only fixtures.


Head-office admins default to the active head office plus active direct branches. Each table uses `useCompanyScope('table')` and `CompanyTableFilter.vue`; filters remain local to the component and participate in query keys. `CompanyFormField.vue` is inside add/edit forms: new forms default to the active head office, while edits load the stored owner through `/api/organization/context`. Related quick-add fields inherit their enclosing form company. Sales, online sales, B2B accounts, and expense tables use the local scope. Expense forms load categories and staff for their selected company. Billing drafts use company-specific storage keys. Requests use explicit company IDs without updating the authentication session or sidebar company. `useOrganizationActions.ts` resolves row ownership locally. Changing an existing record's company opens the transfer preview, requires explicit destination mappings and linked-record confirmation, then moves the saved record in a transaction. Save other form changes before confirming a transfer. See `ARCH-storetools-api.md` for transfer and authorization details.

**Files:**
 - `pages/erp.vue` — Parent ERP shell with `UDashboardPage`/`UDashboardPanel`; exact `/erp` path redirects to `/erp/billing`
- `pages/erp/billing.vue` — Main POS billing page (~1,700 lines; coordination layer only)
- `pages/erp/quotes/index.vue` — Saved quotes table; `add.vue` and `edit/[quoteId].vue` use the shared quote editor
- `pages/erp/sales.vue` — Sales list with print/edit/delete
- `pages/erp/expenses.vue` — Expense management
- `pages/erp/accounts.vue` — Credit accounts (B2B) with bills
- `pages/erp/edit/[salesId].vue` — Edit an existing bill
- `components/Billing/AddClient.vue` — Shared add/link client modal (also used in /client)
- `components/Billing/ProductSearch.vue` — Product search modal for adding items to bill
- `components/Billing/InlineProductSearch.vue` — Inline quote-style product suggestions beside the toolbar staff-code input on billing and bill edit
- `components/Billing/SalesReturn.vue` — Sales return modal
- `components/Billing/StockReturn.vue` — Stock return modal
- `components/Billing/AccountModal.vue` — B2B account creation modal (extracted from billing.vue)
- `components/Billing/SplitModal.vue` — Split payment modal (extracted from billing.vue)
- `composables/useBillingDraft.ts` — All bill state refs, localStorage sync, draft CRUD
- `composables/useBillingItems.ts` — Row add/remove, barcode fetch, per-row tax/value watchers
- `composables/useBillingClient.ts` — Phone lookup, client-add flow, points redemption
- `composables/useBillingCoupons.ts` — Coupon fetch, eligibility, discount calc, coupon watchers
- `composables/useBillingCamera.ts` — Quagga2 (web) + CapacitorBarcodeScanner (native) lifecycle
- `components/Expense/ExpenseForm.vue` — Add/edit expense form
- `components/Expense/ExpenseList.vue` — Expense list component

**Server API routes (bill):**

| Route | Method | Implementation | Purpose |
|---|---|---|---|
| `/api/bill/findBillCounter` | POST | Raw SQL (pg pool) | Deprecated for billing saves. Invoice numbering belongs to the bill INSERT trigger. |
| `/api/bill/create` | POST | Parameterized source DML through `server/utils/create-bill-source.ts` and shared `pg` pool | Creates source/entries and applies stock, staff credit, loyalty and coupons in the request transaction. Native deferred triggers post financial entries; the INSERT trigger assigns the invoice number. No stored create function or legacy ledger writes. |
| `/api/bill/update` | POST | Raw SQL / pg transaction | Edit bill entries |
| `/api/bill/offline` | POST | Raw SQL (pg pool) | Offline stock updates (qty/soldQty sync) |
| `/api/bill/findUniqueClient` | GET | Prisma | Look up client by phone |
| `/api/bill/findManyClient` | GET | Raw SQL (pg pool) | Suggest up to 5 company-linked clients by name or phone digits for billing/edit client search |
| `/api/bill/findManyCategory` | GET | Raw SQL (pg pool) | List categories for billing (id, name, hsn) |
| `/api/bill/findFirstEntry` | GET | Raw SQL (pg pool) | Find entry by barcode + companyId + invoiceNumber. Joins `entries` → `bills` + `variants`. Used by SalesReturn for invoice-constrained barcode lookup. |
| `/api/bill/findManyCoupon` | GET | Prisma | List applicable coupons |
| `/api/bill/findManyAccount` | GET | Raw SQL | List credit accounts; with `includeUsers=true`, returns account/user selector options for POS credit billing |
| `/api/bill/createAccount` | POST | Prisma | Create a new credit account |
| `/api/bill/findFirstItem` | GET | Raw SQL (pg pool) | Fetch item by full barcode or numeric slash shortcut for billing/edit, returning the resolved full barcode and including zero/negative stock items. Shortcuts resolve only the selected company's storecode and reject ambiguous prefixes. |
| `/api/bill/searchItems` | GET | Raw SQL (pg pool) | Quote and billing/edit product suggestions from the selected company: `q`, `field` (all/barcode/product/variant/brand/category/subcategory/collection), and `limit`. All includes each supported field; specific fields restrict matching. Returns in-stock active product/variant rows with tax, brand and collection metadata. |
| `/api/bill/redeemClientPoints` | POST | Raw SQL (pg pool) | Redeem or revert loyalty points |
| `/api/bill/by-barcode` | GET | — | Lookup by barcode (not read) |
| `/api/billSale/findManyBills` | POST | Raw SQL (pg pool) | Paginated bill list for sales page. Supports: `selectedPaymentMethods[]`, `minGrandTotal`, `maxGrandTotal` filters. Reads `cleanup` from session and the cleanup-only `showCleanedValues` body flag: normal users always exclude soft-deleted bills (`precedence IS NOT TRUE`); cleanup users with the toggle off see original cleanup values plus `precedence=true` rows; cleanup users with the toggle on see current cleaned values and exclude `precedence=true` rows. Returns `b.precedence` in SELECT. |
| `/api/billSale/updatePaymentMethod` | POST | Raw SQL (pg pool) | Updates a bill's `payment_method` and optional `split_payments`, leaving `payment_status` unchanged. Used by the sales page "Change method" action. |
| `/api/billSale/receipt` | GET | — | Bill receipt |
| `/api/billEdit/findUniqueBill` | GET | Raw SQL (pg pool) | Fetch full bill for edit page |
| `/api/billEdit/deleteBill` | POST | Raw SQL (pg pool) | Soft delete bill |
| `/api/billEdit/findEntriesToDelete` | POST | — | Find entry IDs to remove during edit |
| `/api/billSale/updateBillNotes` | POST | — | Legacy single-field bill notes update |
| `/api/billEdit/updatePaymentStatus` | POST | — | Update payment status |
| `/api/discount/apply` | POST | Raw SQL (pg pool) | Bulk apply discount% to variants |
| `/api/accounts/expenses` | GET | Raw SQL (pg pool) | List expenses with search (note/category/user name via JOINs), status/paymentMode/category/user/amount/date filters, whitelisted sort columns (incl. nested `expensecategory.name`/`user.name`), pagination. Returns `{ rows, total }`. Rows shaped with nested `expensecategory {id,name}` + `user {userId,name,phone}` and `createdAt`. |
| `/api/accounts/expenses` | POST | Raw SQL CTE (pg pool, transaction) | Validates amounts/tax recovery, locks company references, reserves the expense counter and inserts the source including recoverable tax in one CTE. Native deferred triggers post at commit. No legacy ledger or runtime function/schema setup. Returns `{ success, id, expenseNumber }`. |
| `/api/accounts/expenses/[id]` | PUT | Raw SQL (pg pool, transaction) | Update expense; native ERP trigger reverses/reposts the source |
| `/api/accounts/expenses/[id]` | DELETE | Raw SQL (pg pool, transaction) | Delete expense; native ERP trigger reverses its journal and retains old ledger history |
| `/api/accounts/expenses/status` | POST | Raw SQL (pg pool, transaction) | Bulk "Mark as" update for `{ ids, status }`; native ERP triggers update paid/unpaid postings in the same transaction. Old ledger rows stay unchanged. |
| `/api/accounts/expense-categories` | GET | Raw SQL (pg pool) | List `{id,name}` categories for the company |
| `/api/accounts/expense-categories` | POST | Raw SQL (pg pool) | Create a category; returns `{id,name}` |
| `/api/accounts/expense-categories/[id]` | DELETE | Raw SQL (pg pool) | Delete a category; maps PG FK error `23503` → HTTP 409 "used in expenses" |
| `/api/accounts/company-users` | GET | Raw SQL (pg pool) | List company users (`deleted=false`); `?activeOnly=1` also requires `status=true`. Returns `userId,name,phone,status` |

**ZenStack hooks used:**
- `expenses.vue`, `components/Expense/ExpenseList.vue`, `ExpenseForm.vue`, `ExpenseQuickAdd.vue`: **none** — the entire expense feature was migrated off ZenStack to the raw-pg `/api/accounts/expense*` + `/api/accounts/company-users` endpoints above (see expenses section below).
- `accounts.vue`: `useFindManyAccount`, `useCountAccount`, `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount`, `useUpdateBill`, `useFindManyCompanyUser` (for user filter in expense list)

**Tables touched:** `bills`, `entries`, `items`, `clients`, `company_clients`, `coupons`, `coupon_usages`, `companies`, `accounts`, `addresses`, `expenses`, `expense_categories`, `company_users`

---

#### `pages/erp/billing.vue` — POS Billing

**Pay now / Invoice:** A single billing mode selector appears at the far right of
the ERP navbar on desktop and mobile, after the company selector. The billing page
owns it and teleports it into `ErpPageNavbar.vue`'s `page-navbar-actions` target
after hydration.
When **Enable invoicing workflow** is off for the billing company, this selector
is hidden and Billing stays in Pay now mode. The page waits for the company workflow
setting before initializing billing. Restored Invoice preferences and invoice-mode
links cannot switch it to Invoice; draft items and custom notes are retained.
Invoice hides tender and B2B/staff account controls, requires a linked customer and
positive total, and captures due date, payment terms and an optional Subject.
Invoice details persist per company-local draft. The selected mode is a company-local
preference in `markit_billing_mode:<companyId>` and survives Save, reset, new drafts,
draft switching, navigation and refresh until explicitly changed. On first use,
the first saved draft supplies the mode when no preference exists. Invoice drafts
load with Credit and default due date/terms when Invoice is selected; selecting Pay
now restores tender controls. `/erp/invoices` links to
`/erp/billing?billingMode=invoice`, preserving a single selected company through
`entryCompany`. The billing-mode query is consumed with a router replacement after
applying it, so refreshing cannot override a later manual selection. The billing
card and navbar mode selector are disabled during save.

Invoice and Sales table Preference buttons open `Billing/Preferences.vue`, a right
drawer matching the quote preferences layout. Separate company defaults include
customer notes, terms and conditions, rows per page and summary-card visibility;
invoice preferences also select a preset/company-saved payment term. Receipt design
opens the owning company's Printer settings in a new tab. In a branch-filtered
table, preferences target that single branch; the all-stores view targets the active
company, identified in the drawer. Admin/manager/accountant roles can save; other
authorized users can view. Cancel discards unsaved edits and failed saves retain them.

Billing loads both document defaults before creating its draft state. New/reset
drafts adopt the selected mode's notes/terms; new invoice terms calculate the due
date from the invoice day. Mode changes replace untouched default text while
preserving entered text and existing invoice terms. Existing drafts and issued bills
are unchanged. Company row defaults apply when opening/reloading table preferences;
unconfigured Sales defaults preserve existing locally saved page size/pagination.
Column choices, filters and sort controls retain their existing persistence.
`npm run test:billing-preferences` checks permission/storage/draft contracts,
Sales hydration, and drawer save/cancel/failure/read-only behavior in Chrome.

On desktop, Payment terms and Due date occupy the second footer row
below Total and the return/redeemed amounts. Delete and Return sit directly below
them, aligned with Create invoice. Both billing toolbars show the invoice date
without a visible label, retaining its accessible name. Due date retains its minimum
invoice date and save lock. Subject sits at the far right of the Qty footer row on
desktop and mobile, with placeholder "Let your customer know what this invoice is
for"; it uses the existing draft reference binding and saved `subject` field. Mobile
keeps payment terms and due date in the header detail section and hides that section's
reference field. Desktop omits this header detail row entirely; the customer-selection
and unpaid-invoice helper message is removed. Bill edit uses the same placement:
desktop payment terms/due date in the footer, mobile details in the header, and
Subject at the right of the Qty row. `Billing/InvoiceDetails.vue` still defaults to
showing all fields for other callers.

`Billing/PaymentTerms.vue` replaces the invoice payment-term text box on desktop,
mobile and bill edit with a searchable dropdown: Due on Receipt, Due end of the
month, Due end of next month, Net 15/30/45/60, company-saved terms and Custom. The
footer action New Payment Term opens a Term Name / Due After (Days) modal with
Save and Cancel. Saving a named term selects it and calculates the due date from
the invoice day. Day and month-end rules use calendar dates, including leap years
and year boundaries. Invoice-date changes update a rule-calculated due date;
manual date overrides and legacy free-text terms remain editable through Custom.
Incomplete native date edits do not discard the last valid invoice day.
Billing and `InvoiceDetails.vue` explicitly import this control so rendering does
not depend on Nuxt component discovery. The footer browser check mounts the real
control and verifies its visible trigger, term selection and new-term modal with
mocked settings requests.

`GET/POST /api/settings/payment-terms` stores named terms in the owning company's
existing GeneralPreference `billing/payment-terms` JSON, with the preceding value
in `payment-terms-backup`. Company locks serialize additions and case-insensitive
duplicates (including preset names) reject. Billing roles can create terms. Names
are 1–100 characters and Due After is a whole number from 0 to 3650. Failures retain
the modal's entered values. Invoices retain their existing text/date snapshot;
adding a term does not change issued invoices or create database schema objects.

Invoice uses the same numbered `BILL` source and stock/posting transaction, forcing
`Credit` / `PENDING`. Existing `invoice_code` stores `INV-<invoice_number>`;
`due_date`, `invoice_payment_terms` and `subject` hold the entered details (subject
is the customer reference). `server/utils/invoice-flow.ts` validates membership
and enabled ERP Accounting with an active receivable mapping before issuance.
No schema/setup/history import runs. Generic model writes cannot bypass invoice
validation. Edit loads/preserves these fields; active receipts still block edits.

The desktop and mobile footer Create invoice button uses the same green split-button
layout and persisted Print / Send / Download / None receipt selection as Pay now's
Save button. Invoice creation executes the selected receipt action. The separate
header row of create actions and invoice/payment links is removed. Send/upload/
download failure leaves the saved invoice available in the action dialog and invoice
list. Retrying Send shares the saved bill rather than creating another. Sending
never changes the payment status or creates a receipt.

Billing's ellipsis menu opens `Billing/NotesModal.vue` with only Customer notes and
Terms and conditions. These values persist per company-local draft, survive draft
switching and are cleared for new/reset bills. Save stores them in existing Bill
`notes` / `termsAndConditions` fields; edit loads and updates them through the same
two-field modal. Server writes validate text limits (5,000 / 10,000 characters), and
omitted edit fields preserve saved values. Receipt reads, preview, custom designs,
original PDF and printer output include both through `billDocumentLines`.

`/erp/sales` is the unified Sales table for Pay now bills and invoices, with All sales,
Pay now, Invoices and Unpaid / overdue tabs. `/erp/invoices` redirects there with
`view=invoices`, retaining other query values such as `entryCompany` and `q`; its
separate sidebar link is removed. Invoice views add due date, payment terms, subject,
received, balance, overdue and sending status, and reuse the sales payment/receipt
actions. Invoice Send/Resend/PDF loads the saved owning-company receipt; it never
creates another bill. `/erp/payments` retains `Billing/InvoiceWorkspace.vue` with a
table company scope and only Record payment in the header. Recurring and retainer
pages remain separate workflows.

Payments received lists date, invoice, customer, amount, method, receiving account,
reference and Received/Reversed status. Its picker searches outstanding customer
credit invoices, including legacy Credit/Split bills; staff debt stays in Staff
Accounting. Payment history reuses dated reversals. Collections/reversals do not
repeat sale/stock effects. Outstanding derives from active `POS_CREDIT_RECEIPT`
rows and original tender, never the legacy `balance_due` cache.

Quotes and Payments received use `components/Erp/DocumentTable.vue` for
the Sales-style summary cards, card header/date picker, debounced search, rows per
page (3/5/10/20/30/40), column picker, Download, Filters/Reset, selectable rows and
Showing/pagination footer. Row actions use three-dot menus. Column choices restore
after mount from per-page/company browser storage. Status and amount filters use
draft/apply controls; filters and sorting reset to page 1. All dates is the initial
range. Invoice dates and payment dates use India-day boundaries; quote dates are
date-only. Summaries cover all matching rows, not just the current page. Payment
Received totals exclude reversed receipts, which have their own total.

`server/utils/document-list.ts` validates dates, amount bounds, allowlisted sort
keys/directions, page and pageSize (1–500). `quote-list.ts` and `invoice-lists.ts`
filter before pagination and return rows/total/summary in one SQL statement.
`utils/erp-document-table.ts` snapshots filters for full filtered exports in
500-row requests; selected rows export instead when selection is present.
`utils/erp-document-export.client.ts` exports the visible data columns to PDF or
Excel, excluding action controls. Requests capture the selected company scope.
`npm run test:erp-tables` (`tests/erp-document-tables.test.ts`) covers parameter validation and export paging;
its opt-in `INVOICE_READONLY_DATABASE=1` check executes SELECTs in a read-only
transaction. The quote browser regression exercises shared table controls and
existing edit/print/delete behavior. No table schema changes are involved.

Invoice documents include due date, terms, reference, received and balance through
`utils/invoice-flow.ts`. Every custom design appends that summary; original HTML/PDF
fallbacks include it too. UPI requests use the outstanding amount and disappear
after full settlement. Uploaded PDFs remain snapshots; regenerate to share an
updated balance. Sending status is provider acceptance, not delivery/read confirmation.

`npm run test:invoices` covers isolated type checks and mocked invoice creation,
drafts, resend, rendered balances/UPI, partial/full/reversed payments and source
guards. Set `INVOICE_READONLY_DATABASE=1` when running `tests/invoice-flow.test.ts`
for SELECT-only list checks and EXPLAIN without ANALYZE inside READ ONLY. Existing
`npm run test:billing` also covers invoice footer controls in isolated Chromium.
Verification does not create schemas or write live data.

Billing and bill edit use `utils/billing-error.ts` for save, receipt and client/account form error toasts. Offline failures show "No internet connection"; connection failures and timeouts get actionable messages. Clean validation messages are retained, while request URLs and database/runtime details use a plain action-specific fallback. Camera errors give permission/device guidance.

`npm run test:billing` runs the database-free regression suite in `tests/billing/`
and the existing billing error tests. It executes current page declarations and
composables with real Vue reactivity and mocked requests/storage/devices; a hidden
Chrome/Edge fixture mounts the actual desktop summary templates with native UI
stand-ins. The folder README lists covered scenarios and integration limits.
Results and fixture screenshots are saved under its ignored `reports/` directory.
This is scenario coverage, not a 100% application/branch coverage claim.
Barcode requests use unique per-request tokens; a stale completion cannot clear
the latest request's loading/save guard, even when the same barcode is requested
again. Network lookup failures preserve the typed barcode and show connection
guidance. Both save handlers reject non-finite totals/quantities/rates; edit also
blocks empty entries, pending item requests, missing payment/split/date/session
and duplicate submissions before issuing requests.

Desktop billing/edit share `assets/css/billing-layout.css`: the card gives remaining panel space to a scrolling table, while the header and payment/action footer keep their natural height. `useBillingTableLayout` measures the table header plus one row and padding as its minimum height. The panel scrolls only when those minimum contents cannot fit; the table header stays visible during table scrolling. Mobile retains the stacked form.

The desktop summary uses five columns sharing three rows. The first is Subtotal / Discount / Save (including receipt-action dropdown); the second is Grand Total / Payment Method / Delete, with both total labels above their values. The third contains return-redeemed amounts / account / Sales Return, the fourth coupon selection / count-value / New and Search, and the last column client phone / name-points / loyalty actions. Sales Return and Delete use solid variants. New and Search are text-only buttons at the bottom of the fourth column; Add Client is a solid person-plus icon button beside the Cell No. input, and Add Account is a plus beside its selector. Qty/Invoice stays in a separate compact information strip. The measured footer height automatically gives the saved space to the table.
Field labels, input values and select triggers on billing/edit use a consistent 12px font with 20px line height, matching the compact summary labels. Pay now summary labels and button captions use one word; Account/Coupon placeholders follow the same convention. Invoice mode uses Payment terms, Customer reference and Create invoice captions. Save retains its selected receipt action in the tooltip and dropdown. The action dropdown and Save buttons share Print, Send, Download and None icons; the selected action icon appears beside Save on desktop and mobile, with a check icon for None.
The desktop Cell No. controls use an explicit non-wrapping horizontal row: input and Add Client icon in billing; input, clear-client X and Add Client icon in bill edit. The input shrinks while the icon buttons remain 32px square with centered icons.
 The account selector uses "Account" as its placeholder and "Account Name" as its accessible label instead of a separate visible label; adjacent desktop actions reserve only button height.
The account selector aligns with the second row of inputs; Save, Delete, Sales Return and loyalty actions occupy the third row.

billing.vue is a **coordination layer**. Dedicated composables own drafts, items,
clients, coupons and camera state; the page retains save validation/payload/receipt
helpers, orchestration, DOM refs, keyboard navigation, table resizing and template.

**Composable architecture:**

| Composable | Owns | Key exports |
|---|---|---|
| `useBillingDraft` | All bill state refs, localStorage sync, draft CRUD | `billNo, date, items, discount, adjustment, redeemedAmt, grandTotal, subtotal, tQty, splitPayments, tempSplits, ...`, `createNewBill, deleteBill, resetDraft` |
| `useBillingItems` | Row add/remove, barcode fetch, per-row tax/value watchers, category-dedup watcher | `loadingStates, currentRequestIds, addNewRow, removeRow, fetchItemData, handleProductSelected, handleReturnData` |
| `useBillingClient` | Phone lookup, client-add flow, points redeem/revert | `isClientLoading, redeeming, handleEnterPhone, handleClientAdded, handleRedeemPoints` |
| `useBillingCoupons` | Coupon fetch, eligibility filter, discount calc, watchers | `allCoupons, selectedCouponId, eligibleCoupons, couponRefetch` |
| `useBillingCamera` | Quagga2 (web) + CapacitorBarcodeScanner (native) | `showCamera, videoRef, handleScan, stopCamera` |

**What stays in billing.vue:**
- DOM ref arrays: `barcodeInputs, nameInputs, qtyInputs, rateInputs, discountInputs, taxInputs, userInputs, categoryInputs`
- Single refs: `discountref, paymentref, saveref, resizableTable`
- Modal open/close state: `showSplitModal, isOpen, issalesReturnModelOpen, isClientAddModelOpen, isDeleteModalOpen, isProductSearchOpen`
- Keyboard nav: `focusInput, moveFocus, movecatgeory, handleEnterBarcode, handleEnterMainDiscount, handleEnterPayment, handleDiscountEnter, selectAllText`
- Table resize: `startResize, handleResize, stopResize`
- User tracking: `updateUserDetails, updateParentUserDetails`
- Account/category fetch: `getAccounts, getCategories`
- Print/send/download: `print, send, download, selectAction`
- `handleSave` helpers (module-scope pure functions): `validateBillEntries, buildEntriesData, computeBillPoints, buildBillPayload, buildPrintData, fireFcmNotification`
- `reset()` — calls `resetDraft()` + clears `selectedCouponId` + focuses first barcode + calls `couponRefetch()`

**Extracted sub-components:**
- `BillingAccountModal` — B2B account creation modal; emits `account-created`; `v-model` for open state
- `BillingSplitModal` — split payment modal; props `:grand-total`, `:payment-options-in-split`, `v-model:tempSplits`; emits `confirmed(splitPayments[])`

**Draft system (localStorage):**
- In-progress bills are stored as a JSON array in company-specific `bills:<companyId>` localStorage keys; `companyStorageKey` handles adoption of the active company's legacy `bills` key
- Multiple bills can be open simultaneously — each has a sequential `billNo` (1, 2, 3...)
- Entire bill state auto-saved to localStorage on every change via `watch(currentBill, ...)` in `useBillingDraft`
- On mount: loads existing drafts; if none exist, creates a default empty bill
- `createNewBill()` / `deleteBill()` manage the array with re-sequencing after changes

**Item row structure:**
Each row in the bill table: `{ id, variantId, sn, barcode, category[], size, unit, name, qty, rate, discount, tax, value, sizes, totalQty, return, userCode, userId, user, cost }`
- `unit` is display-only in the bill grid and is sourced from the resolved variant (`variant.unit`) with a `Nos` fallback; the column is hidden entirely when only one billing unit is enabled in settings

**Keyboard navigation flow:**
- Barcode field → Enter (with valid barcode) → auto-fetch item + add new row, focus next barcode
- Barcode field → `/` plus 1–6 digits → Enter resolves the saved barcode for the selected company, padding the numeric part to six digits (`/123` → `1A000123` when that is the matching code). The lookup uses that company's `storecode` and the saved letter prefix, including multiple letters. Distinct matching prefixes require the full barcode; malformed shortcuts retain the input and show a validation message. Billing and bill edit replace the abbreviation with the returned full barcode before saving.
- Barcode field → Enter (empty) → jump to main discount field
- Barcode field → Enter (non-barcode text) → treat as category shortcut (lookup via `categoryStore.getCategoryByShortCut()`)
- Main discount → Enter → adjustment → Enter → payment method
- Payment method → Enter → Save button
- Shift+Enter → focus phone number field

**Barcode format:** `/^\d+[A-Z]\d{6}$/` — Capacitor scanner enforces this; Quagga2 accepts any CODE_128/EAN

Manual barcode entry on billing/edit additionally accepts multi-letter prefixes (`/^\d+[A-Z]+\d{6}$/`) and the numeric slash shortcut above. Native scanner validation is unchanged.

**Barcode scanning (useBillingCamera):**
- Web: Quagga2 (`code_128_reader`, `ean_reader`, `ean_8_reader`) with rear camera (`environment`)
- Native (Capacitor): `CapacitorBarcodeScanner` with `CODE_128` hint only
- `handleScan()` switches between modes based on `Capacitor.isNativePlatform()`
- Callback `onBarcodeScanned` wired in billing.vue to set barcode on last row, call `fetchItemData`, then `addNewRow`

**Item fetching (useBillingItems):**
- `GET /api/bill/findFirstItem?barcode=...` → fills: `name` (subcategory + variant + product name), `rate` (sprice), `discount` (dprice - sprice), `tax`, `sizes`, `cost` (pprice); intentionally returns the barcode even when item stock is `0` or negative so POS billing can oversell
- In-flight deduplication via `currentRequestIds` map — stale responses are ignored
- **Save guard:** `handleSave` blocks if `Object.keys(currentRequestIds.value).length > 0` (prevents race condition where item.value = 0 gets saved)

**Tax calculation (useBillingItems — deep watcher on items):**
- Reads category from `categoryStore` using `item.category[0].id`
- `FIXED` → `fixedTax`
- `VARIABLE` → `taxBelowThreshold` or `taxAboveThreshold` based on `item.value / item.qty` vs `thresholdAmount`
- If `isTaxIncluded = false` → tax added on top: `baseValue += (baseValue * tax%) / 100`
- If `isTaxIncluded = true` → tax already embedded in price (no addition)

**Discount logic:**
- Per-entry: negative = flat deduction from rate; positive = percentage off rate
- `Billing/DiscountAdjustment.vue` splits the original discount space into equal-width Discount and Adjustment fields on desktop and mobile, for billing and bill edit.
- Discount accepts a positive percentage (`2` means 2% off) or a negative fixed deduction (`-2` means ₹2 off). The `+` key is blocked; pasted `+2` and invalid input prevent save with a validation message.
- Adjustment is a separate signed amount: `2` adds ₹2 and `-2` subtracts ₹2 after the discount. `utils/bill-adjustments.ts` shares validation, total calculation and legacy loading.
- Drafts persist both inputs independently and reset both for a new bill. Existing `+` discount drafts and saved `surcharge` bills load with Discount zero and the old charge added to Adjustment, preserving totals.
- Source create/update and edit/receipt reads use existing `bills.adjustment`; discounts retain `flat` / `percentage` types. Older edit requests omitting adjustment preserve the saved amount. No schema changes are needed.
- Receipt total savings is computed from print data, not stored on the bill:
  - `lineSavings = tdiscount` from `buildPrintData()` (sum of per-entry discounts; negative entry discount is flat amount × qty, positive entry discount is percentage of rate × qty)
  - `billDiscountBase = ttvalue` (sum of final entry values after per-line discounts; fallback `subtotal`)
  - Main discount contribution:
    - Positive input (e.g. `10`) → `(billDiscountBase * 10) / 100`
    - Negative input (e.g. `-5`) → `+5` savings
    - Historical `+` prefixed receipt data remains supported as an added charge
  - Coupon discount (`couponValue`) and redeemed points (`redeemedPoints`) are also added to receipt savings
  - `totalSavings = max(0, round2(lineSavings + mainDiscountContribution - adjustment + couponValue + redeemedPoints))`
  - Receipt `DISC/ROUND OFF(+/-)` includes the net discount/adjustment change when adjustment is nonzero. Preview, original PDF, custom receipt summaries and printer bytes include the same signed adjustment and savings.
  - `utils/receipt-entry-amounts.ts` keeps print rows and totals consistent across billing, bill edit and saved reprints: returned quantities, gross/final amounts and line savings carry negative signs, matching the billing total.

**Columns visibility (computed `columns` array drives `<thead>`):**
- `user` column: only shown if `session.isUserTrackIncluded = true`
- `cost` column: only shown if `session.role = admin` AND `session.isCostIncluded = true`
- **Parent user code:** top-level "User Code" input field, stored as `parentUserCode/Id/Name` on draft. Resolves via `userStore.getuserByCode(code)`, updates all existing rows and pre-fills new rows. Persisted across draft save/load.

**Payment modes:** Cash, UPI, Card, Credit, Split
- Credit/Split-with-credit → `paymentStatus = 'PENDING'`
- Others → `paymentStatus = 'PAID'`
- Split: `tempSplits` map per method → `BillingSplitModal` emits confirmed `splitPayments[]` array

**Credit parties:** The "Account Name" selector can include both B2B `accounts` and staff users when fetched with `includeUsers=true`. Account options save to `bills.account_id`; user options display as `Name (code)`, are searchable by code through the option label, save to `bills.credit_user_id`, and also auto-switch payment method to 'Credit'. Accounts created via `BillingAccountModal` → `POST /api/bill/createAccount`.

**Points system (useBillingClient):**
- `billPoints = round(grandTotal / session.pointsValue)` — earned after bill if client is present
- **Skip Points toggle:** `skipPoints` ref (default `false`). When `true`, `billPoints` is forced to `0` — client earns no points for this bill. UI shows red "Skip Points" / green "Assign Points" toggle button next to the Redeem button. Reset on `reset()` / `resetRedeemState()`.
- Redeem is staged locally first; the actual client points mutation happens on save in the bill transaction (`bill/create` for billing, `bill/update` for edit), so the saved bill remains the source of truth.
- Cancel-redeem subtracts only `redeemedPoints` from `redeemedAmt` (preserves coupon portion)
- Guard: `company_clients.points >= redeemedPoints` enforced in SQL
- Thermal receipt prints `Total Points Available` below the customer phone only when available points are > 0. If points were redeemed, `Points Redeemed` is printed below grand total only when redeemed points are > 0.

**Coupon (useBillingCoupons):**
- Generated coupons are created inside `POST /api/bill/create` after the bill insert, inside the same SQL transaction; failed bill creation rolls back earned coupon rows too.
- `couponId` for the currently applied coupon is still passed to create API and recorded as `coupon_usages`.
- `POST /api/bill/update` now uses a raw SQL / pg transaction, applies loyalty point reconciliation inside the same transaction, and returns newly earned coupon vouchers.
- Earned coupon vouchers are returned as `generatedCoupons` with the coupon `code` as the printable barcode and are attached to `printData` after the server save succeeds.
- `selectedCouponId` watcher: recalculates `couponValue` and adjusts `redeemedAmt` on select/deselect
- GIFT coupon selection fetches `giftBarcode` via `/api/bill/findFirstItem`, adds that product as a bill row, and sets row discount to `100` so the gift line is free; deselecting/changing the coupon removes the tagged gift row.
- `watch([items, clientId])`: recalculates coupon discount on order value change
- Deselecting coupon subtracts `couponValue` from `redeemedAmt`; `couponValue` reset to 0
- Thermal receipt prints `Coupon Discount` below grand total only when `couponValue > 0`; this coupon value is included in receipt `SAVINGS`.
- Generated coupon vouchers are appended to receipt print/download output after the main receipt, with coupon details and a CODE128 barcode built from the coupon `code`. WhatsApp send posts the normal bill template, then sends a coupon-code text message for any earned coupons.

**handleSave flow:**
1. Guard: reject if `isSaving` or any barcode fetch in flight (`currentRequestIds`)
2. `await nextTick()` - flush reactive updates so `item.value` is fully calculated
3. `validateBillEntries()` - filter + validate items, throw on missing category/qty/rate
4. The bill INSERT trigger assigns the invoice number returned by `/api/bill/create`
5. `buildEntriesData()` - map items to Prisma entry shape
6. `buildBillPayload()` - pure function, assembles full bill payload
7. `buildPrintData()` - pure function, assembles thermal receipt data
8. `POST /api/bill/create` - raw SQL transaction; creates earned generated coupons and returns `generatedCoupons`
9. Attach returned `generatedCoupons` to `printData`, then `fireFcmNotification()` after create succeeds
10. Trigger print/send/download based on `selectedAction`
11. `reset()`

**After-save action** (persisted to `localStorage` key `markit_selected_action`):
- `print` → `usePrint` composable (thermal receipt)
- Billing and bill-edit receipt actions use the company default design (including its printable width), loaded by `useWebUsbPrinter` through `usePrint`. Web requires a receipt WebUSB assignment; the native mobile app uses the selected Bluetooth printer in Settings > Printer. There is no localhost or browser-dialog transport. Fixed ESC/POS commands remain an internal pre-transmission rendering failsafe; USB errors never trigger a second print.

- `send` -> `POST /api/whatsapp/send-payment-template` (WhatsApp bill) plus `POST /api/whatsapp/send-coupon-message` when earned coupons exist
- `download` -> `generateThermalReceiptPDF` (dynamic import from `~/utils/thermal-receipt.client`; appends earned coupon voucher barcodes)
- `null` → no action after save
- After a successful create, the new `billId` is stored in localStorage under `markit_recent_bill_id`; the billing-page dropdown action `Recent Bill` and `F2` both open `/erp/edit/<recentBillId>`.

**FCM push notification:** Fired non-blocking after save → `/api/notifyfcm` notifies other devices of new bill.

**Inline product search (`components/Billing/InlineProductSearch.vue`):**
- Billing and bill edit place the shared field selector and search input immediately after the optional parent user-code input on desktop; mobile wraps the search onto its own toolbar row.
- Reuses the quote search field options and company-scoped `/api/bill/searchItems` endpoint, with a 250 ms debounce and five in-stock suggestions. Results show product/variant name, barcode, size, price and brand/category/collection metadata. Enter selects a sole match; Escape clears, and leaving the control hides suggestions.
- The field preference persists across billing/edit in `erp:billing-product-search-field:v1`, separately from quote preferences and document data. Field/company changes, disabling and unmounting invalidate pending responses.
- Selection runs the existing barcode item lookup and row tax/pricing logic. Empty rows are reused, existing filled/saved rows remain intact, and a blank row is retained. Saving disables the control; bill edit also respects the marketplace-bill lock.
- Billing resets the search when switching drafts. The existing footer Search button still opens the product browser below.

**ProductSearch modal (`components/Billing/ProductSearch.vue`):**
- Category → subcategory → product drill-down (all optional — category alone loads variants)
- Variant query filters by `productId` → `subcategoryId` → `categoryId` in priority order
- Loading spinner (`variantsLoading`) shown while variants fetch
- Multi-select items via checkbox; `done` emits selected barcodes array
- Billing and bill edit bind the dialog's `open` prop and `close` event; edit uses its existing barcode lookup to populate selected items without replacing saved entries.

**Sales return modal (`components/Billing/SalesReturn.vue`):**
- No ZenStack hooks — uses `$fetch` for all data (categories via `GET /api/bill/findManyCategory`, entry lookup via `GET /api/bill/findFirstEntry`)
- Invoice number is optional
- If invoice is provided: barcode lookup via `GET /api/bill/findFirstEntry` (raw SQL, joins entries → bills + variants)
- If invoice is empty: barcode lookup falls back to product catalog lookup (`GET /api/bill/findFirstItem`)

---

#### Recurring invoices and retainer invoices

`/erp/recurring-invoices` and `/erp/retainer-invoices` are separate ERP pages backed by
`Billing/RecurringWorkspace.vue` and `Billing/RetainerWorkspace.vue`. Both use a single
authorized company form scope; the toolbar selector locks while editing or viewing a
selected document. Sidebar links live in `layouts/default.vue`. Lists search within
that company and return at most 500 profiles/retainers; recurring history shows the
latest 200 occurrences. These are database-backed documents, not localStorage records.

Recurring profiles store a validated quote-shaped invoice template, customer, currency,
original start date, optional inclusive end date, interval/frequency (day/week/month/year),
due days and generation mode DRAFT or ISSUE. The original calendar anchor survives short
months/leap years. New profiles with a past start skip earlier occurrences. Active
profiles catch up dates missed during scheduler downtime; pausing stops generation and
resuming skips paused dates. Start/frequency changes require a new profile. Profile
edits use optimistic revisions and never rewrite existing occurrence templates.

`server/utils/recurring-invoices.ts` creates one unique profile/date occurrence at a
time. A draft freezes the invoice template/dates with no Bill, stock or posting. Issue
uses `issueProgramInvoice` -> `createBillSource`, retaining native invoice numbering,
stock and accounting behavior. Manual generation consumes only a due occurrence;
issuing a saved draft is idempotent even with a new request ID. Deleting the resulting
bill does not clear its occurrence or regenerate it. Issued invoices use the existing
Invoices page for payments, printing and sending. Automatic emailing/card charging is
not configured by this module.

The authenticated `/api/cron/recurring-invoices` job runs at 06:00 IST via `vercel.json`,
using the existing `CRON_SECRET` (minimum 16 characters, timing-safe Bearer comparison).
Company -> profile locks serialize scheduler and interactive actions. Each dated child
and schedule advance commit together; failures, including deferred posting errors, roll
back the entire occurrence and leave its date due. Failures store safe visible errors;
a run skips its failed profiles, caps work at 200 occurrences/40 seconds, and returns
HTTP 500 when any occurrence failed so scheduling can retry.

Retainers request a positive advance against an explicitly selected active same-currency
OTHER_CURRENT_LIABILITY account. Creating, editing, marking sent or voiding an unpaid
request posts no receivable, revenue, tax or stock. Mark as sent records a manual status;
Print / PDF produces an A4 advance request with requested/collected/applied/refunded/unused
amounts, customer notes, terms and transaction history. Collection posts Dr Cash/Bank,
Cr the frozen liability account. Partial collections cannot exceed the requested amount.
Applying unused collected credit posts Dr liability, Cr the invoice's frozen posted
receivable and creates a normal `POS_CREDIT_RECEIPT` Payment with mode `Retainer`.
Multiple retainers can pay the same invoice; a retainer can fund multiple invoices.
Applications share the normal outstanding calculation and edit/delete receipt guards.

`server/utils/retainer-invoices.ts` owns append-only collection/application/refund/removal
events and balanced system journals. Refunds debit liability/credit Cash or Bank and
cannot consume applied funds. Removing an application reverses its original journal,
marks its Payment `POS_CREDIT_REVERSED`, reopens the invoice and restores unused credit;
it can happen only once. The regular receipt reversal route directs Retainer payments
back to this module. All actions check company/customer/currency, active accounts,
accounting locks, dates, remaining credit and the exact posted invoice receivable.
Transactions cannot be dated before the request, invoice (for applications), or any
previous retainer event, or after today. Retainers with financial history cannot be
edited or voided. Draft/Sent/Void is stored; Paid/Partially paid/Applied/Refunded labels
are derived from events.

The source contract starts in `schema.zmodel`; local migration
`20261030120000_invoice_programs` prepares the four tables and checks/FKs. It has **not
been applied** as part of implementation. Separate explicit database authorization is
required. Missing-table API reads/writes return a setup-needed 503. Generated CRUD and
nested relation mutations cannot bypass the source APIs. Durable source request receipts
and browser retry IDs protect interactive saves/actions after timeouts.

Validation: `npm run test:invoice-programs` type-checks the new screens/APIs, runs real
services against a transaction-aware in-memory adapter, and exercises browser generation,
issue, pause/resume, collections, retries, application/removal/refund and print contents.
No database schema or data is changed by that suite. The workflows were checked against
Zoho Books [recurring invoices](https://www.zoho.com/in/books/help/recurring-invoice/ri-createsend.html)
and [retainer invoices](https://www.zoho.com/in/books/help/retainer-invoice/).

#### `POST /api/bill/create` — Bill Creation (source transaction)
Bill creation uses the shared `pg` pool and `server/utils/create-bill-source.ts` (2026-10-21). Parameterized application DML replaces the missing `create_bill_source_plpgsql(jsonb)` dependency. The handler retains ownership locks, the atomic request receipt and transient transaction retries. Shared `applyBillStock`, staff-credit and generated-coupon helpers run on that same transaction; native database triggers retain invoice numbering and financial posting. Neither the handler nor helper executes schema DDL. Combined coupon eligibility filters the bill total by the owning company, so a shared customer's branch purchases cannot earn a head-office voucher.

**Source transaction flow:**
1. INSERT bill into `bills`; `trigger_generate_invoice_number` assigns `invoice_number`
2. INSERT all entries into `entries` from `payload.entries.create` JSONB
3. Update staff credit `user_ledger_entries` and recalculate balances when `credit_user_id` is present
4. Deferred native accounting triggers post Cash/UPI/Card/Credit/Split sources; old ledger rows are untouched
5. Apply `company_clients.points += billPoints - redeemedPoints` when a valid client exists
6. Derive sold/return stock deltas from the entries actually saved through `applyBillStock`, with stable item locks and company checks
7. Apply coupon usage, decrement generated-voucher usage when applicable, increment `coupons.times_used`, and create earned GENERATE vouchers in `coupon_clients`
8. Return `{ success, billId, invoiceNumber, generatedCoupons }`

**Retry:** 3 attempts with exponential backoff for transient PG errors
**Error logging:** Failed requests → `save_error_requests`

**Invoice number:** assigned by the DB trigger `trigger_generate_invoice_number` inside the bill insert. `POST /api/bill/findBillCounter` is deprecated/unused for billing saves.

---

#### `pages/erp/quotes/` — Quotes

`/erp/quotes` (`index.vue`) opens the saved quotes table. Its Add quote button opens
`/erp/quotes/add` (`add.vue`). Clicking a quote number or Edit quote opens
`/erp/quotes/edit/:quoteId` (`edit/[quoteId].vue`). Add/edit routes share
`components/Quotes/Editor.vue`; Back to quotes navigates to the table. Each link
retains the selected company through `entryCompany`. The `quoteId` route parameter
avoids the shared company context's automatic Bill lookup for an `id` parameter.

These pages use the existing `Quote`, `QuoteItem` and `QuoteCustomFieldValue`
models. ERP → Quotes is available in both sidebar menus. Table and editor use a
single-company `useCompanyScope('form', true)`; the company selector remounts new
forms through `entryCompany` and is locked for saved quotes. Search, detail, save
and deletion use that selected company. Initial edit data loads through
`useAsyncData`; failed loads show Retry and hide the creation form.

- Customer name/phone search and add/link reuse the billing customer flow. Product
  search reuses `/api/bill/searchItems`; custom item names/descriptions are also allowed.
- Quote product search has All fields, Barcode, Product name, Variant name, Brand
  name, Category name, Subcategory name and Collection name modes. A specific mode
  searches only that field; Brand matches product and variant brand names. All
  fields includes every mode, ranking exact/prefix barcodes first. Searches remain
  case-insensitive substring matches over positive-stock active products/variants
  in the selected company, with five suggestions in the quote editor. Changing
  mode refreshes an existing query and discards stale results. Suggestions display
  their brand/category/collection names alongside barcode, size and price.
- The mode is separate from quote document data and is saved browser-locally in
  `erp:quote-product-search-field:v1`, shared across quote add/edit pages. It restores
  only after mount; unknown values or unavailable storage fall back to All fields.
  `utils/quote-product-search.ts` shares allowed values with the SQL builder in
  `server/utils/quote-product-search.ts`. No catalog schema changes are needed.
- Header fields: quote date, optional expiry, reference, subject, prepared-by name and
  DRAFT/SENT/ACCEPTED/DECLINED/EXPIRED status. Staff set statuses explicitly; SENT does
  not send a message and expiry dates do not automatically change stored status.
  Enabled customer approval can record ACCEPTED/DECLINED through a signed link.
- Customer reference is an optional customer enquiry/PO/project identifier; Subject
  is an optional short description of what the quote covers. Prepared by searches
  active users in the selected company by name, staff code or email through the
  existing authorized `/api/getuser?companyId=...` endpoint. Results are filtered
  locally (up to eight), with a debounced search, request reuse, stale-result guards,
  empty/error states and Retry. Selecting a result stores its display name in the
  existing `salesperson` text field, which is restored on edit and printed. Existing
  free-text names remain displayable. New selections use search results; an unfinished
  nonempty search must be selected or cleared before saving. No staff foreign key or
  schema field is added.
- Lines capture quantity (up to three decimal places), unit, tax-inclusive rate,
  percentage discount and included tax rate. Catalogue picks initialize category
  FIXED/VARIABLE tax or variant tax; tax-exclusive catalogue prices are converted to
  inclusive rates. Rates and tax remain editable snapshots rather than live tax rules.
- `utils/erp-quote.ts` owns shared validation and calculations. Totals sum rounded line
  amounts, apply a fixed/percentage document discount, then a signed adjustment.
  Included tax is reduced proportionately by the document discount. Adjustments do not
  carry tax. The server computes stored amounts and totals independently of browser totals.
- Payment terms, delivery estimate, notes and conditions print with the quote.
  `components/Quotes/PrintPreview.vue` provides A4 browser printing / Save as PDF for
  saved data. Printing never collects payment; accepting a quote can invoke the
  company's configured invoice conversion workflow.
- Saved quotes use the shared Sales-style document table described above, including
  search, status/date/amount filtering, sorting, configurable pagination and exports,
  editing and confirmed soft deletion. Failed saves preserve inputs; unchanged retries
  reuse their request ID. Revision checks reject stale edits. New quote forms auto-save
  incomplete inputs, selected customer, pending customer/staff/product searches and
  request ID to browser localStorage. `utils/quote-draft.ts` validates the versioned
  snapshot without requiring a complete/savable quote. Keys `erp:quote-draft:v1:<company>:<user>`
  and `erp:quote-status:v1:<company>:<user>` are captured for the form owner so branch
  changes cannot write the previous form into the new branch. Status changes are
  remembered for the next new quote; edit pages keep the saved server status. Restore
  runs after mount to preserve SSR hydration. Back/navigation/refresh retain new drafts
  without a discard prompt when local storage succeeds. Save clears the new-document
  draft while retaining status; Clear draft explicitly discards it. Storage failures
  display an alert and retain navigation warnings. Saved-document edit pages retain
  their existing unsaved-change confirmation and optimistic server revision checks.

`server/utils/erp-quotes.ts` owns transactional quote persistence. It validates
company-linked customers and company-owned variants under locks, reserves the existing
`quote_counter` with a company row lock, and skips existing number collisions. Numbering
uses the existing prefix (fallback `QT`) plus a hyphen and five-digit counter. It merges
only `_erpQuote` in the existing custom-value JSON, preserving other custom fields.
That namespace records a version, revision, customer name/phone snapshot, payment and
delivery terms, and per-line discount/tax/barcode/size keyed by saved line ID.
`saveSourceRequest` records an idempotency receipt in the existing audit table.
Ordinary quote saves do not change stock or post sales. An ACCEPTED save or customer
acceptance invokes the configured conversion described below; only issuing an invoice
calls the existing bill source and native stock/accounting path. No payment is recorded.
No schema installation or migration runs through the quote routes.

**Preference drawer and customer workflow:** `Quotes/Preferences.vue` opens a right
slideover from the table's Preference button. GET/PUT `/api/quotes/preferences` stores
versioned company settings in existing `general_preferences` (`quotes` / `defaults`),
backing up the prior JSON under `defaults-backup`. Reads require company access;
admin/manager/accountant roles can save. Default customer notes/terms and zero-value
item visibility initialize new quotes. Item visibility remains snapshotted under
`_erpQuote.document`; all items print when the entire quote total is zero.

The quote editor's Notes card contains only Customer notes and Terms and conditions;
sales orders retain their separate payment/delivery controls. Quote preferences
add independent `retainCustomerNotes` and `retainTermsAndConditions` checkboxes,
both unchecked by default. Invoice conversion filters the draft preview snapshot,
issued Bill fields and issued quote snapshot using these choices, leaving the quote
unchanged. Invoice email reads notes/terms from the issued Bill rather than copying
unselected text from the original quote. Preferences use existing JSON storage and
conversion uses existing Bill text columns; no schema migration runs.

There is one active company quote design, stored as `documentDesign` in the same JSON.
The editor offers Standard business, Professional proposal and Compact starter templates.
Applying one replaces only the local layout and supports Undo; Save persists it. Existing
`pdf_template` values remain readable for API compatibility but do not select a layout.
Preference > Design quote navigates to `/erp/quotes/design`; sales orders use
`/erp/sales-orders/design`. Each has its own page file with authenticated,
`layout: false` and `documentDesigner` metadata. `pages/erp.vue` bypasses the Sales
navbar/dashboard wrapper for these routes. `DocumentDesigner/Page.vue` loads and
saves company preferences and renders `Quotes/DesignEditor.vue` as a full-viewport
page. Its right inspector contains Back, Save design and save status; there is no
modal header or Undo/Redo button. Quote and sales-order layers use the same Conditions panel and visible strikethrough typography toggle as receipt/label layers. `designer-rules.ts` evaluates bounded All/Any data comparisons and conditional show/hide, text formatting and paint actions for the canvas and real document output. Numeric conditions use raw document/row values via `quoteDocumentRuleValues` and `quoteItemRuleValues`; nested item rules evaluate separately for each row. `quote-rule-guards.ts` and the design schema prevent visibility rules on required item/totals sections and protected native values or their ancestors. Rules persist in existing version-one design JSON and follow normal Undo/Redo, locks and Save.

Quote and sales-order designers share a Layers /
canvas / inspector workspace with `useDesignerHistory`. Numeric dimension edits and their fixed-size mode change use one transaction; Undo restores both geometry and the previous resizing mode. Layers can be named, reordered,
selected with Shift, hidden, locked and grouped. Required item/totals sections remain
visible and cannot be copied, cut or deleted. Toolbar, keyboard and context-menu
actions enforce these guards and the 30-section limit. Group duplication/paste is
rejected atomically when it would exceed that limit; the clipboard is local to the
open designer.

`utils/quote-layer-definitions.ts` describes the nested template frames and their
text/image/shape nodes. The company frame contains its logo and a details frame;
document metadata, customer cards, totals rows, table headings/row values and
signature/contact content also expose individual layers. `LayerTree.vue` displays
expandable nested rows. Double-click or Ctrl/Command-click drills inside a frame;
the tree selects a child directly. Native live fields start linked to the document.
Product nodes describe the row template, so an edit applies to every product row.
Required amounts/name content cannot be hidden, replaced with static text or cut.

Optional section `elements` store these presentation edits in the existing design
JSON. `utils/quote-layers.ts` resolves the tree, inherited locks and independent
transform selections. Native child X/Y edits are offsets within their layout;
the inspector reports position relative to the parent. Resized image/text nodes
reserve their original flow slot, so resizing a logo does not push company text.
`DocumentDesigner/QuoteLayer.vue` renders the same transforms/styles in the editor,
print and public document. Native frames move their descendants together. Custom
text, image, shape and frame layers can be inserted inside a selected frame, nested,
duplicated with their children and dragged into other frames in the same section.
Validation limits edits to 100 nodes per section, 300 per design and eight levels,
rejects duplicate keys/cycles/invalid parents, and retains the existing image and
total JSON size limits. This extends version-1 design JSON without database DDL.

The shared `ElementProperties.vue` inspector uses compact Position, Layout,
Appearance, Typography, Fill, Background and Stroke groups alongside existing Content/data
connections. It exposes alignment, X/Y, rotation and flips, measured dimensions,
persisted aspect lock, auto width/height or fixed text boxes, numeric font weight,
six system font families, size presets, Auto/percentage line height,
absolute/percentage letter spacing, vertical text alignment and separate fill
colour/hex, opacity, visibility and presets for up to eight solid fills. Text Background
uses the same colour controls, independent `backgroundOpacity`/`backgroundVisible`,
and Add/Remove background to restore transparency. Non-text backgrounds use Fill.
Helper text explains Fill as text/shape colour and Stroke as the layer outline.
Existing bold/italic/underline and
adapter-specific text options remain available. `utils/designer-presentation.ts`
owns optional shared version-1 presentation fields. `FourValues.vue` expands
corner radius into four independent corners, Padding into four inside edges and
Margin into four outside edges. Margin has a unified value or independent
top/right/bottom/left values (-300 to 300 mm). Root flow sections show existing
`gapBefore`/`gapAfter` as top/bottom fallback; nested layers default to zero.
Explicit `margin`/`marginSides` replace those fallbacks, including zero, and apply
through CSS margin in editor, print and public documents.
Unified controls display Mixed for unequal values; changing the unified value
replaces all overrides, while collapse keeps them. Optional `cornerRadii` and
`paddingSides` override scalar `radius`/`padding`, including explicit zero. These
values save on root sections and nested layers, use Undo/Redo and apply to print
and public documents. Fixed frame children retain parent-relative coordinates.
`QuoteLayer.vue` and root
section styles apply them in editor, print and public documents. Auto text sizes
follow current binding values; a manual resize restores fixed sizing. Layer and
fill visibility/opacity are distinct. Printer editors share these controls through
their raster adapter; no database fields or migrations are added.

`DocumentDesigner/QuoteCanvas.vue` measures rendered sections in millimetres. Every
section supports dragging, eight resize handles, precise X/Y/width/minimum-height
inputs and rotation. Multi-selection uses Shift-click or an empty-canvas marquee.
Alignment uses selection bounds (the parent frame for a single nested layer, page
margins for a single top-level layer); three or more
layers support horizontal/vertical equal spacing. Groups select and transform
together. Shift constrains moves, proportions and rotation increments; Alt bypasses
snapping or resizes from the center. Snapping compares other visible layers' edges
and centers and page edges/center, with optional 5 mm grid and live guides. Handles
retain their screen size across zoom levels. Pointer capture supports mouse/touch;
Escape, pointer cancellation and lost capture restore original values. A gesture is
one history entry. `utils/designer-geometry.ts` owns the pure geometry calculations.

The canvas provides rulers, move/hand tools, Space/middle-button panning, zoom/fit
and Ctrl/Command-wheel zoom. Arrows nudge 0.5 mm (Shift: 5 mm). Ctrl/Command supports
A select all, C/X/V local copy/cut/paste, D duplicate, G group (Shift: ungroup),
Shift-L lock/unlock, brackets back/front, Z/Shift-Z/Y history, 0 fit, 1 100%, and S
save. Input fields retain native text-editing shortcuts. Keyboard help lists the
actions; right-click opens layer actions. Double-click text edits through an escaped
textarea: blur or Ctrl/Command-Enter commits; Escape cancels. Rectangles/ellipses,
text, live fields, images and dividers do not alter financial data.

`DocumentDesigner/ElementProperties.vue` exposes frame geometry, rotation, opacity,
fill, stroke, radius, stacking, font/color/bold/italic/underline, line height, letter
spacing and image contain/cover/flip. The flat Design inspector follows the selected
layer: parent/name, position and dimensions, linked/static text, typography for text,
image controls for images, appearance and stroke. Page setup is a separate control;
the old Content tab is removed. Table settings appear with the selected table, and
insertion tools are collapsed below layer properties. A4/A5/Letter, page margins,
font/accent and templates remain in Page setup. Locked layers and descendants of
locked frames remain selectable but reject edits
until unlocked. Ctrl/Command-Z undoes and Ctrl/Command-Y redoes local edits
(Shift-Z also redoes); page keyboard listeners are removed on unmount. Input fields
retain native undo/redo. Save design persists current preferences through the
existing validated/authorized PUT and stays on the page; errors retain the draft.
`useDocumentDesignDraft` hands the whole preference draft between the drawer and
the page through Nuxt state, keyed by document kind and company. Back retains it
and returns to the originating route/query, including Sales settings. Reopening
Preference restores it; Cancel or closing that drawer discards unsaved changes.
These drafts last through SPA navigation, not a browser reload. Direct visits load
saved preferences for `entryCompany`; denied management access never mounts the
editor. Load failures offer Retry.

The Content panel at the top of the selected text/image inspector uses
`DocumentDesigner/DataBinding.vue` for both existing and new layers. **Link to data**
offers searchable groups for Company, Customer, Document, Totals and (within a
repeating product layer) Item row. It previews the selected source; document sample
values are only for the design canvas. Switching to Custom text retains the visible
value as escaped editable text; Uploaded image and the adjacent upload control use
an image instead of the data source. The quick **+ Text**, **+ Linked data** and
**+ Image** buttons insert inside a selected frame, or add a page section otherwise.
Root live-field sections and their value children edit the same source.

`utils/quote-bindings.ts` owns the compatible field catalog and display values from
the supplied document/company, including formatted dates, money, addresses and
per-row item values. Optional section/element `binding` properties extend the
existing version-1 design JSON; an empty element binding explicitly disconnects a
native field, while an absent binding retains its template source. Existing image
overrides remain uploaded images. `setQuoteLayerBinding` in `utils/quote-layers.ts`
applies the same operation to root sections, native children and custom children;
changes preserve layout/styles and participate in local undo/redo and saved designs.
`Quotes/Document.vue` and `QuoteLayer.vue` resolve the saved sources for both canvas
and print/public output. Text/images cannot use incompatible sources. Item fields
are available only in repeated layers; **Product details · each row** is a frame
that accepts new child layers and repeats their bindings for each product. Moving
these children outside their row scope is blocked. Required product names, line
amounts and summary amounts retain their original source and cannot become static;
the inspector explains this beside the disabled selector. Locked layers inherit
the same edit restriction for bindings.

`npm run test:document-designer` covers geometry, constraints, saved JSON and protected
sections. `tests/erp-quotes-browser.test.ts` uses mocked APIs and actual Chromium
pointer input to cover movement at 75%/150%, resizing, cancellation, history, groups,
clipboard, locking, inline text and mobile layout, alongside quote/order save/print
regressions. These tests do not write to a database.
`node tests/run-print-template-browser.mjs document-designer-browser.html` checks
canvas/print geometry, hidden-layer spacing, cancellation, resized totals and
validated style saves in an isolated Chromium fixture. It uses the real-time CDP
runner and resolves only the used Lucide icons for the fixture bundle.
`node tests/run-print-template-browser.mjs document-designer-page-browser.html`
checks the actual page components and preference handoff: viewport/sidebar layout,
keyboard history, failed saves, Back/Cancel, company/document isolation, settings
return, denied access and load retry, using mocked APIs without database writes.
`node tests/run-print-template-browser.mjs document-designer-layers-browser.html`
checks independent logo/text movement, sibling stability during logo resizing,
contextual inspector controls, child undo/redo/cancellation, inherited locks,
parent and custom nested frame transforms/duplication, rotated parents, 150% zoom,
save/reopen with live values and canvas/print geometry parity.
`node tests/run-print-template-browser.mjs document-designer-bindings-browser.html`
checks existing/new/nested text and image links, field search/preview, real document
and per-row values, disconnect/reconnect, escaped text, history, source protection,
locks, validated save/reopen and sales-order field labels, without database writes.

Quote, sales-order, receipt and label adapters share `DocumentDesigner/Tools.vue`,
`TextProperties.vue`, `CanvasToolbar.vue`, `useDocumentSections` and draft history.
Shared tools offer template application, page presets, custom sections with an optional
first-line heading, plain/bulleted/numbered text and borders. Sections use escaped text,
never HTML. Document-specific bindings/renderers retain quote totals and printer limits.
Reorder/duplicate/delete share guards; quote items/totals cannot be removed or copied.

Table selection shows shared `DocumentDesigner/TableProperties.vue` and
`ColumnWidth.vue` controls below the frame properties in Design. These control
columns and cells; individual row-template layers also expose typography/geometry.
Optional `tableStyle` JSON configures minimum body/header
heights (mm), cell padding (mm), body/header type sizes (pt), vertical alignment and
border thickness (mm). Quote product images support independent width/height (5–80 mm),
contain/cover and beside/above placement. Image boxes shrink into narrow columns and
text wraps below when necessary. Table section width is a percentage; alignment uses
the section alignment. Headers allow line breaks. Visible column widths are displayed
as percentages with sliders/numeric inputs and are normalized without changing hidden
columns. Header dividers support pointer dragging/cancellation and arrow-key resizing
(Shift increases the step). A gesture is one undo step; it changes presentation only.
Rows grow beyond their minimum to fit content. Preview/print use the same settings;
legacy designs without `tableStyle` retain their previous layout.

Page setup also supports an optional **Professional proposal** layout and live item
thumbnails within material descriptions. Standard designs retain their existing
appearance. Text sections can treat their first line as a heading; consecutive left
and right text columns render side by side, returning to full width when unpaired.
Live fields can use sign-off/signature or customer-care footer presentation. These
are optional version-1 JSON properties using the existing section/column kinds.
The professional totals show Gross total, the actual discount, Other and Net total;
the style does not set prices, discounts or financial workflow defaults.

The professional header reads the selected company's current logo, name, address,
phone, email and GSTIN through `server/utils/quote-document.ts`. Preferences GET
returns this public company profile for the designer, and saved quote detail includes
`documentCompany` plus the linked customer's most recently updated active address.
Signed public quotes use the same profile/address reader. Address lookup requires the
company/client link and excludes addresses belonging to another company. Bank and
authentication fields are not selected. Missing logo/contact details are omitted;
adding them in company settings populates later previews without embedding a copy
in the design. Item thumbnails use the owned variant's first current image and fall
back to an image placeholder; standalone/custom lines have no catalog image.
The shared `utils/quote-document.ts` formats addresses and accepts HTTPS images,
PNG/JPEG data URLs and CDN object keys, rejecting executable/credentialed URLs.

`utils/quote-design.ts` allowlists content and fields, limits 30 sections and 7 columns,
requires one visible item table/totals and visible item name/amount columns, validates
PNG/JPEG data URLs (350 KB encoded per image, 1.5 MB design total) and rejects remote/SVG
images. The upload UI accepts PNG/JPEG/WebP up to 10 MB, checks signatures and
resizes/compresses through the shared designer image helper before storage.
Legacy layouts retain their section flow and original single-sheet image bounds.
Optional section JSON stores frames (`frameWidth`, `frameHeight`, `x`, `y`), styling,
locks and group IDs, without database columns or migrations. Moving a flow section
stores its original height in `flowHeight` as a hidden placeholder so neighboring
sections retain their positions. New independent images and pasted layers do not
reserve flow space. Reset position/size returns a layer to document flow. Frame
height is a minimum so live text/tables grow rather than clipping content. Width/X
stay within the selected sheet; vertical positions support longer documents up to
the validated 5,000 mm limit. Colors/fonts and image fit are allowlisted.
`Quotes/Document.vue` applies these properties in preview and print, excludes canvas
controls/grid from output and compensates print margins for physical placement.
No raw HTML or
executable expressions are stored. `Quotes/Document.vue` renders the same live design
in the designer, `PrintPreview.vue` browser print/Save PDF, draft review and public
customer page. Detail/public reads return the current authorized company design;
changing it updates presentation of saved quotes without changing document amounts.
The source writer and invoice conversion snapshots do not embed large design images.
Browser PDF output uses the selected A4/A5/Letter size with saved margins and repeating table headings.
Issued-invoice emails keep their existing invoice PDF renderer.
Accepted-edit and customer-response policies apply to existing quotes too.

Accepted quotes are locked by default in the editor and source writer; preferences
can allow editing. Generated Quote/QuoteItem/QuoteCustomFieldValue writes and generic
mutations of quote GeneralPreference records cannot bypass the source APIs. A linked
issued invoice is never silently changed when its quote is edited.

Share quote generates a 30-day signed, revision-bound `/quote/:token` link for print,
copy or manual WhatsApp sharing. For companies with automatic quote notifications
enabled, the share transaction also queues one client notification for that revision;
it performs no external send before commit. The notification schema is separately
prepared, and absent/disabled notification setup leaves sharing unchanged. See
`WHATSAPP-NOTIFICATIONS.md`. `quote-share.ts` uses QUOTE_SHARE_SECRET, receipt/session
signing secrets or NUXT_AUTH_PASSWORD (minimum 32 characters); domain-separated HMAC
signatures prevent reuse of receipt tokens. Public GET/POST `/api/quote-share` expose
only that quote/company and record one final ACCEPTED/DECLINED response. Approval
must be enabled, the quote current/unexpired, and status DRAFT/SENT. Responses bump
the revision; their original link remains readable until another staff edit. Stale
links, altered tokens and changed repeat decisions reject. Same-decision retries do
not issue again. The public page requires no seller login and is excluded from the
auth plugin's remembered ERP route.

Conversion modes are none, draft or issue-and-email. `quote-workflow.ts` serializes
company/quote writes and persists `_erpQuote.workflow`. Draft invoices store a quote
snapshot and source revision there; they create no Bill, stock or journal until Issue.
`/erp/invoice-drafts` lists/reviews them and is linked from Invoices and the quote
table. Explicit issue requires a current draft revision. Issued invoices use the
existing Credit/PENDING bill source, client membership and ERP receivable setup.
Catalogue lines resolve owned stock by variant/barcode/size; ambiguous/missing stock
requires review. Document discounts allocate in cents before creating invoice lines;
signed zero-tax amount-only adjustments have zero quantity and do not record returns.
The existing source handles stock, native posting and generated coupons at issue.
The source receipt `quote-invoice` plus saved Bill ID prevents duplicate invoices.

Conversion failures roll back to a savepoint while retaining quote acceptance and a
visible retry error. `quotes/:id/workflow` supports retry, explicit draft issue and
email retry. Company currency and issued quote contents are captured with the link;
they do not require a Bill currency column. After issue commits and its connection
is released, `quote-invoice-email.ts` sends the PDF using the existing SMTP_HOST/PORT/
USER/PASS configuration. It reads the issued Bill's client email, current invoice
entries and receipt-derived balance under a Bill read lock; the issued quote snapshot
retains reference/notes/terms. It serializes delivery by quote and records Pending/Sent/Failed.
Email failure never undoes acceptance or creates another Bill. Retry is a staff action;
there is no background email worker. SMTP acceptance is recorded as Sent, not delivery
confirmation; a transport/commit failure after provider acceptance can leave an
uncertain send requiring staff review. Invoice payment stays pending until receipts.

Validation: `npm run test:quotes` runs isolated type checks, mocked source/API tests and
an isolated Chrome/Edge fixture mounting the real list/add/edit routes and shared editor
with Vue Router and UI stand-ins. The fixture covers table-first entry, Add/Back/Edit
navigation, company query preservation, unsaved navigation guards, failed saves/retries,
item pricing, preview, filters, exports, preferences/defaults, accepted locks, draft
issue, public acceptance, sharing, design image/text editing, undo/redo, save/reload and deletion;
it does not exercise authenticated Nuxt login or real database writes.
For schema validation, set `QUOTE_READONLY_DATABASE=1` and run
`node --import tsx --test tests/erp-quotes.test.ts tests/quote-preferences.test.ts`;
the extra tests use READ ONLY and EXPLAIN without ANALYZE, never executing DML or
schema changes. Workflow tests exercise the actual source writer with in-memory
transactions; SMTP is replaced by a capture so no real messages are sent.

#### `pages/erp/sales-orders/` - Sales orders

ERP Sales orders opens `/erp/sales-orders`, with Add at `/erp/sales-orders/add` and
edit at `/erp/sales-orders/edit/:orderId`. Both sidebar variants include the link
without a subpage icon. Links carry `entryCompany`; saved orders lock their company.
The list uses `Erp/DocumentTable.vue`: summary amounts, customer/order/reference/subject
search, order-date/status/amount filters, sorts, paging, persisted columns and PDF/Excel.
Its statuses are the existing SalesOrderStatus values DRAFT, CONFIRMED, CLOSED, CANCELLED.

Add/edit reuse `Quotes/Editor.vue` in sales-order mode: customer and prepared-by search,
catalogue field priorities, custom lines, tax-inclusive prices/discounts/adjustments,
order date, expected shipment date, reference, subject, payment terms, delivery method,
notes and terms. `utils/sales-order.ts` adapts the shared UI DTO to canonical order
fields. New drafts/status preferences use separate `erp:sales-order-{draft,status}:v1`
keys scoped to the form's company/user. Successful save clears only that document's
draft; existing order edits never replace the new-order remembered status.

Preference reuses the right drawer and full-page designer at
`/erp/sales-orders/design`, with independent company defaults at
GeneralPreference `sales-orders/defaults` and backup at `defaults-backup`. It controls
notes/terms, zero-value lines and editing of closed/cancelled orders. Quote customer
approval/automatic conversion controls are hidden. Design/printing uses the shared
`Quotes/Document.vue` with SALES ORDER and expected-shipment/delivery-method labels;
quote designs remain separate. Closed/cancelled orders are locked unless their own
preference permits editing. Invoiced/payment flags are read-only. Orders with stored
invoiced=true or live linked Bills cannot be deleted.

`server/utils/sales-orders.ts` writes existing SalesOrder/SalesOrderItem rows in one
transaction, with company-first locks, customer/variant ownership checks, collision-aware
sales_order_prefix/counter numbering, source-request idempotency, calculated line/totals
and revision checks. GeneralPreference `sales-orders/document:<id>` stores the revision,
subject, customer snapshot, per-line discount/tax/barcode/size and item visibility;
attachments and existing invoice/payment links are preserved. Generic model mutations
of SalesOrder/Item or their preference namespace cannot bypass these source APIs.
Saving or changing an order status does not create Bills, receipts, stock movements,
loyalty or journals. No schema changes or posting functions are installed. Read-only
schema planning validates the source SQL; source/API tests mock transactions and the
browser fixture exercises list/add/edit, local restoration, failed-save retry, design,
print, terminal locks and delete. Set SALES_ORDER_READONLY_DATABASE=1 for the additional
READ ONLY / EXPLAIN test in `tests/sales-orders.test.ts` (no source writes are executed).

#### `pages/erp/sales.vue` — Sales List

Clicking a sale row, its invoice number or Details opens a distributor-style split
view: a compact searchable/paginated list on the left and `Sales/DetailPanel.vue`
on the right (stacked on small screens). Close returns to the full sales table.
The panel has exactly Bill and History tabs. Bill reads the selected owner's
`billSale/receipt` payload and renders `ThermalReceipt`. Its Print action passes
that same loaded receipt and saved design directly to printing. Table Print also
loads this owner-scoped receipt instead of rebuilding it from list rows. History reads paginated saved snapshots through `billSale/history`, newest
first, with expandable historical items, totals, notes and split methods. Table
payment/notes/action controls retain their own clicks. Selection updates/clears
with refreshed rows and company changes; data saves refresh the panel. Receipt
and history requests explicitly pin both company headers to the selected sale.
Independent loading/errors/retry states and request versions prevent stale bill
responses after switching records or closing the panel. `tests/sales-detail.test.ts`
checks row selection, stale responses, scope, history pagination and compilation.

This page also owns the invoice table. `utils/sales-view.ts` defines its four URL
tabs (`view=all|paynow|invoices|unpaid`) and the old invoice-link redirect. All sales
retains the complete existing sales dataset. Pay now filters `invoice_code IS NULL`;
Invoices requires an invoice code on a non-marketplace BILL without staff credit.
Unpaid / overdue shows positive receipt-derived balances excluding staff credit.
All sales and Pay now default to the date range; Invoices and Unpaid default to All
dates, so old outstanding invoices remain visible. The date selector can be changed
in every view. Switching tabs resets status/method filters and pagination. Explicit
invoice links override stale saved search/amount filters. Existing company scopes,
cleanup visibility, entry expansion and source edit/payment protections remain.

`server/utils/sales-view.ts` supplies the SQL tab predicate, original credit obligation,
active receipt sum, received amount, outstanding and IST overdue expression to the
same `findManyBills` rows/totals query. Filters run before LIMIT/OFFSET. Retainer-mode
receipts use the same active receipt status; reversed receipts are excluded. The API
adds received/balance/overdue totals without adding collections to revenue. Invoice
view summary cards show total/received/balance/overdue; other views keep tender cards.
One Preference action opens the existing reusable drawer for the current invoice or
sale defaults. No database schema or stored sale records change for this unification.

Sales and online-sales selected columns compare stable column keys, so recreated responsive column objects preserve the same table columns during SSR and hydration.

- Fetches bills via `POST /api/billSale/findManyBills` — **raw SQL** with `pg` pool
- Search logic:
  - Non-numeric → bound search by client name/phone, invoice code or subject
  - Numeric that fits integer range (≤ 2,147,483,647) → match `invoice_number` exactly OR `phone ILIKE`
  - Numeric ≥ 3 chars and exceeds integer range (e.g. full phone numbers) → search by `phone ILIKE` only (skips invoice match to avoid PostgreSQL integer overflow)
  - **Date range filter is SKIPPED when search is active** (intentional design — the WHERE clause excludes date filter if `normalizedSearch` is truthy)
- Filters: payment status (PAID/PENDING), payment method (`Cash`, `UPI`, `Card`, `Credit`, `Split`), min/max `grandTotal`, date range
- Filter UX: All dates / Date range selector in the header; Date range exposes the existing date picker. Other filters open in the explicit Apply Filter modal.
- Sort allowlist includes invoiceNumber, createdAt, grandTotal, paymentStatus, customer, paymentMethod, notes, dueDate, amountReceived and balanceDue.
- Export: Download generates XLSX or PDF for the current dataset in batches of 500. Tab, company and filter values are frozen before paging. Invoice views export issued invoice codes, customer, due date, total, received, balance and payment state; other views retain the original sales columns. Export filenames identify the tab and date mode.
- **Table state persistence:** all filter/sort/pagination/column-visibility state saved to `localStorage` key `erp_sales_table_state_v1` and restored on mount
- Table columns omit `subtotal`; the sales grid now shows a `Method` column with plain text, and clicking `Split` opens the shared split modal instead of a hover popover
- Cleanup sessions (`session.cleanup === true`) render a cleanup-only `Cleaned values` toggle. Off is the original cleanup view: bill `subtotal`, `discount`, and `grandTotal` use saved original columns where available; entry `rate`, `discount`, and `value` use saved original entry columns; `precedence=true` rows are included. On switches the same sales list/export API to current cleaned values and filters out `precedence=true` rows. The API returns explicit original fields only for the original cleanup view. Non-cleanup sessions continue to read current visible values and never render the toggle.
- Summary cards use the totals response from `/api/billSale/findManyBills`; `Split` bills are broken down by `split_payments` and their amounts are folded into the existing Cash/Card/UPI/Credit totals so the top cards reflect mixed payments.
- Credit and credit-containing Split rows show Collect / Reverse actions with a read-only payment status. Collect opens the receipt form and is disabled for fully paid bills; Reverse opens receipt history to choose an active collection and confirm its dated reversal. Other rows retain the PAID/PENDING dropdown. The receipt modal's optional `mode` defaults to `collect`.
- The date/search toolbar shows Collections: credit repayments only, net of dated reversals, from `collections.creditRepayments`. It follows the selected date mode and authorized company scope independently of tab/search/status/method/pagination. All dates is labeled explicitly. Collections do not increase sales totals; loading/errors hide the previous amount. Hovering or activating the Collections button opens a payment-method breakdown (Cash, UPI, Card, Bank, Cheque) from `collections.byMethod`, with negative dated reversals retained. The breakdown shares the total's loading/error handling and SSR hydration snapshot.
- Bills with `isMarkit = true` → show only "Open" action (no edit/print — marketplace orders)
- Bill actions: Print (via `usePrint`), Change method (opens payment-method modal; choosing `Split` opens the shared split modal before save, then prompts for Print/Send/Download), Details (expand entries inline), Edit (→ `edit/[salesId].vue`), Delete (soft delete via `POST /api/billEdit/deleteBill`)
- **Soft-deleted bill highlighting:** `styledSales` computed maps rows to add `class: 'bg-red-50 text-red-600'` when `row.precedence === true`. `:rows` is bound to `styledSales`.

---

#### `pages/erp/edit/[salesId].vue` — Bill Edit

- Fetches bill via `GET /api/billEdit/findUniqueBill` — **raw SQL** (returns bill + entries + client + coupon usages)
- Resolves the bill's owning company, then loads its category options before assigning the bill to the form watcher; saved entry categories are matched by ID during row initialization.
- Same UI as billing.vue (barcode rows, camera scanning, keyboard nav, tax calc, split payments, skip points toggle, separate Discount/Adjustment inputs); the table shows `unit` next to `qty` only when multiple billing units are enabled in settings
- After-sales registration uses the shared `BillingSerialNumbers` icon beside Delete on desktop and mobile, with staged serial/delivery/installation fields and exact return selection. The old registration panels are absent from the header. A shield icon in the toolbar opens registered-unit history/removal controls; changes to existing unit details still use service history. All service controls require the owning company's after-sales setting. Save waits for the shared registration lookup before validation.
- The responsive toolbar groups date, optional staff code, inline product search, the saved bill/invoice identifier, Add item and Notes menu; search wraps onto its own row on mobile. Invoice edit places Payment terms and Due date below the totals on desktop, above Delete/Return, and uses the shared invoice-details section on mobile without duplicating Subject. Subject remains bound to the saved invoice reference in the Qty footer row. The card is inert while saving, and marketplace bills retain their disabled controls.
- Linked service invoices identify their non-stock charge rows on load. These retain the service's tax and tax-inclusive rate rather than adopting category tax or adding tax again in tax-exclusive companies. A missing legacy charge category uses the company's automatic Service Charges category when available, persisted only on explicit save; product rows retain their own category/tax behavior.
- The Account Name selector mirrors billing.vue: existing `accountId` values load as `account:<id>`, staff-credit `creditUserId` values load as `user:<id>`, and save back into separate bill columns.
- User tracking parity with billing: supports top-level user code input (near date); applying it updates all existing rows and pre-fills newly added rows
- Tracks `oldClientId` vs `newClientId` for points reversal on client change
- Bill update via `POST /api/bill/update` — **raw SQL / pg transaction**:
  - Creates new entries (items without `entryId`)
  - Updates existing entries (items with `entryId`)
  - Deletes removed entries (via `POST /api/billEdit/findEntriesToDelete`)
  - Stock reversal for old entries; stock deduction for updated entries
  - Coupon edit support: if the saved coupon is cleared or changed, the update route removes the previous `coupon_usages` row, restores one generated-voucher use in `coupon_clients.usage_limit` when the old coupon was `GENERATE`, and then applies the newly selected coupon if one is still chosen
  - Loyalty points reconciliation now happens inside the same raw SQL transaction, so edit save does not need a second client-side points round-trip

---

#### `pages/erp/recurring-expenses.vue` — Recurring Expense

The sidebar's Expense group contains Daily Expense (the existing `/erp/expenses`
page) and Recurring Expense. Both links are available in the ERP sidebar on all plans.
Recurring Expense uses a form company scope, scoped raw-pg APIs and existing category,
tax-recovery and Accountant-connection components. Users can add/edit fixed monthly
schedules, pause/resume them, and generate due entries for the selected company.
Existing expenses are edited/paid on Daily Expense. Variable bills are entered there
manually; recurring schedules require a fixed positive amount. There is no automatic payment.

`server/utils/recurring-expenses.ts` runs one occurrence per transaction with row locks,
`SKIP LOCKED`, and a unique schedule/date receipt. It reserves the expense counter,
inserts a Pending expense including tax recovery and company currency, links the receipt,
and advances the date atomically with existing deferred accounting triggers. No cash
ledger movement occurs until paid. Accountant accruals require ERP integration enabled.
Failed accounting/category checks retain the due date and show an error; other schedules
continue. The original day survives short months (Jan 31 -> Feb 28 -> Mar 31).
Resuming catches up missed dates; editing the next date intentionally skips periods.
Dates cannot be edited to/before the latest generated occurrence.

Vercel calls `GET /api/cron/recurring-expenses` daily at `30 0 * * *` (06:00 India time).
Due-date comparisons use Asia/Kolkata's UTC+05:30 calendar. The handler requires a
`CRON_SECRET` of at least 16 characters and bearer authentication; responses are not cached.
Each run handles at most 200 occurrences, with a 40-second loop budget and SQL/lock
timeouts. Nitro's Vercel function duration is 60 seconds. Remaining work catches up on
later runs or via Generate due expenses. The existing five-minute marketing cron remains.

Setup: the owner pushes the updated schema to the development database, then to
production when ready. There is no separate recurring-expense installer command.
Configure the production `CRON_SECRET`, then
deploy with Storetools as the Vercel root. Do not replace an existing marketing secret.
Vercel scheduling/authentication reference: https://vercel.com/docs/cron-jobs/manage-cron-jobs.
The existing marketing schedule requires a plan supporting more-than-daily runs.
Tests: `npm run test:recurring-expenses` validates dates/money and tests concurrent runs,
catch-up, deleted occurrences, deferred-commit rollback, company boundaries, CRUD handlers
and cron authentication in a temporary database schema. No production records are changed.
This integration suite creates a schema. Under the current repository no-DDL policy,
do not run it as part of ordinary feature validation; use the pure date/money checks
and in-memory service/browser tests until separately authorized database work is scoped.

#### `pages/erp/expenses.vue` — Daily Expense

**Fully raw-pg endpoints + TanStack Query on the client — no ZenStack hooks.** All reads/writes go through `/api/accounts/expense*` + `/api/accounts/company-users` (see API table above), but the list is cached and the writes are optimistic via `composables/useExpenses.ts` (`@tanstack/vue-query`).

- `composables/useExpenses.ts`:
  - `useExpenseList(params)` — `useQuery` keyed `['expenses','list', <params>]`, `placeholderData: prev` (keeps the page visible while refetching), `enabled` on `companyId`. Returns `rows`/`total`/`isLoading`/`refresh`.
  - `useExpenseMutations()` — `create`/`update`/`remove`/`status` `useMutation`s with **optimistic cache writes**: `onMutate` snapshots all `['expenses','list']` variants and patches them (create prepends a temp row + `total+1`; update merges fields by id; delete filters by id; status sets the field), `onError` restores the snapshot (**row removed on DB failure**), `onSettled` fire-and-forget `invalidateQueries(['expenses'])` to reconcile. Every mutation is gated by an `navigator.onLine` check that toasts "No internet connection" and aborts when **offline**. Exposes `creating`/`updating` (`isPending`) for spinners and `createExpense`/`updateExpense`/`deleteExpense`/`updateStatus` wrappers returning a success boolean.
- Parent `expenses.vue` calls the mutation wrappers (`createExpense` → resets the quick-add on success; `updateExpense` → closes the modal on success; `deleteExpense`). No manual `listRef.refresh()` — the cache invalidation drives the list.
- Sub-components:
  - `Expense/ExpenseQuickAdd.vue` — **inline quick-add bar** (replaced the old add modal). Rendered **below the KPI summary cards** via `ExpenseList`'s `#quick-add` slot (parent passes the component into the slot, so `ref`/`@create` stay in `expenses.vue` scope). Horizontal field row (date/category/party/amount/payment/status/note) + an Add button. Add is optimistic (the row appears instantly via the cache), and the parent clears the form (`quickAddRef.reset()`) **only after the create succeeds** (`await createExpense`); on failure (validation/DB error, or offline) the optimistic row is rolled back and the inputs are kept so the user can fix and retry. The Add button shows a **`loading` spinner** (`creating` = `create.isPending`) while the create is in flight (`submit` no-ops if already loading), since the inputs stay populated until the server confirms. Error toasts show the clean server `statusMessage` via `errMessage(err)` (data.statusMessage → data.message → message), not ofetch's verbose `[POST] "/url": 400 …` string. Emits `create` with the form payload. Stores status as title-case (`Paid`/`Pending`/…) so table badges/filters match. The **Category select mirrors `pages/erp/billing.vue`** — `multiple` + `searchable` + `creatable`, `v-model` an array — so clicking the selected option toggles it off (deselect) natively. Since an expense has one category, `handleCategoryChange` keeps only the most-recently-picked option (`form.category` is a 1-element array; `submit` reads `form.category[0]`). Payment and Status use the same single-item `multiple` pattern (`form.paymentMode[0]`, `form.status[0]` via `coerceSingleSelection`); Party uses the grouped single-selection popover so any select's option can be toggled off while still holding one active value. **Category, Party, Payment and Status are searchable** — a non-searchable `multiple` Listbox does **not** close on programmatic focus-out (it stays stuck open), whereas the searchable Combobox does; Category is additionally `creatable`. **On pick, every select closes its menu and advances focus to the next field** via `advanceFromSelect(wrapper)` — it focuses the next field's element (which also closes the open Combobox through focus-out), counting only each select's trigger button as a field so an open panel's search input isn't treated as "next". (Earlier attempts — one-way binding for click-to-deselect, then `closeSelect`, then per-select reset `#hint` icons — were all dropped in favor of this billing-style approach.)
    - **Layout:** `grid grid-cols-2 sm:grid-cols-4` → 2 rows × 4 columns (Date/Category/User/Amount; Payment/Status/Note/Add).
    - **Keyboard** (`@keydown.capture` handler so it pre-empts HeadlessUI): ← / → / ↑ / ↓ traverse fields via a geometric nearest-neighbor search (`findFocusableNeighbor`, adapted from `pages/products/add.vue`), so ↑ / ↓ move between the two grid rows and ← / → move within a row (caret-edge aware for text inputs; `number`/`date` always traverse, ← / → fall back to doc order at row edges). On a **closed** select, ↑ / ↓ navigate rows — the capture handler `stopPropagation`s to block the native arrow-to-open; menus open only via **Enter / Space / click**. Only an **open** menu keeps native ↑ / ↓ for option highlighting. Each `USelectMenu` is wrapped in `<div ref="...">`; open menu + ← / → closes it via `wrapper.querySelector('button')` (focus + click) and keeps focus on the trigger; after an option is picked `advanceFromSelect` moves focus to the next field (closing the menu via focus-out) — mirrors `pages/erp/billing.vue` (`movecatgeory`). On mount focus goes to the Category select; Enter in inputs advances to the next field (via `onInputEnter`, bound to **`@keydown.enter.prevent`** — not `keyup`, so the Enter that *picks* a select option doesn't also fire the next input's handler when focus lands on it and double-advance; `.prevent` suppresses the follow-up `keypress` so the Enter that lands focus on the Add button doesn't also activate it) through the Add button; the Add button then saves only on its **own** fresh Enter (native `@click`)/click; `reset()` clears all fields and returns focus to Category after a successful add.
  - `Expense/ExpenseForm.vue` — **edit-only modal** now. Accepts `:loading` (Save button spinner) + `submitLabel` ("Update"). Opened only from a row's Edit action.
  - `Expense/ExpenseList.vue` — owns all filter state, table, and summary cards; the list comes from `useExpenseList(expenseQueryParams)` (cached query) and "Mark as" uses `useExpenseMutations().updateStatus`. Default sort is **`expenseNumber` desc** (numeric — newest/highest EXP number first; legacy `id`/uuid and older expense-number ascending localStorage state are ignored/migrated on restore). The old header "Add Expense" button and `open` emit were removed.
- `composables/useExpenseFormOptions.ts` — shared category (load/create/delete with 409 FK handling) + grouped party-option loading, used by both `ExpenseQuickAdd` and `ExpenseForm`.
- Expense fields: `expenseDate`, `expensecategoryId`, `userId` / `distributorId` / `clientId` (one selected party; staff maps to `from_id`), `totalAmount`, `paymentMode`, `status`, `note`
- `CompanyUser` joined via `company_id` + `from_id` = `user_id`
- Notification code (for FCM) is **commented out** — not active
- **Expense list features:** search (note/category/party name via server JOINs), filter by party, filter by amount range (min/max), filter modal with draft pattern (apply on confirm); table state persistence via localStorage; page resets to 1 on filter change
- **Fixed this session:** the "Mark as" bulk action passed `selectedRows.id` (always `undefined`) — now passes `selectedRows.map(r => r.id)` to `/api/accounts/expenses/status`.
- **Status casing:** legacy rows were stored uppercase (`PAID`) while newer rows are title-case (`Paid`). `ExpenseList` normalizes display via `formatStatus`/`statusColor` (case-insensitive) for both the table badge and Excel/PDF export, so casing in the DB no longer affects the UI. NOTE: the status **filter** still sends title-case and compares `e.status = ANY($)` case-sensitively in `/api/accounts/expenses` (GET), so filtering legacy uppercase rows by status would miss them — not yet normalized.

**Summary cards (`components/Expense/ExpenseList.vue`):**
- 6 cards rendered above the table: Total Expense, Cash, Card, UPI, Bank, Cheque
- Totals computed from `sales.value` (current visible page rows) — not a separate query
- `paymentMode` enum values used in cards: `CASH`, `CARD`, `UPI`, `BANK`, `CHEQUE`
- Clicking a card sets `selectedPaymentMode` to that mode and resets to page 1; clicking the active card clears the filter; clicking Total Expense clears all payment mode filters
- Total Expense card always shows the sum of all currently visible rows regardless of which mode card is active

---

#### `pages/erp/accounts.vue` — Credit Accounts (B2B)

Lists `Account` records (B2B customers with deferred payment) with their bills.

- ZenStack hooks: `useFindManyAccount`, `useCountAccount`, `useCreateAccount`, `useUpdateAccount`, `useDeleteAccount`, `useUpdateBill`
- Uses `select` (not `include`) for optimized queries: `id`, `name`, `phone`, `address`, `bill[]` with entries + category
- Filter: name/phone search + payment status filter (applied at Account → Bill level)
- Expandable rows show bills per account; bills further expand to show entries
- Actions: Edit account, Delete account, Edit bill (→ `edit/[salesId].vue`), Delete bill (soft delete), Update payment status, **Send Reminder** (WhatsApp pending invoice notification)
- Bill deletion awaits the scoped `billSale/deleteBill` service, then refreshes the
  table. It restores stock/loyalty and reverses connected staff/native journals;
  historical old-ledger rows remain frozen. Nested bill actions retain the parent
  customer's company ID.
- Create account inline: name, phone, address (street/locality/city/state/pincode)
- `pending` amount = original Credit obligation minus active `POS_CREDIT_RECEIPT` payments on PENDING bills; Split bills count only their original Credit portion.
- **Credit payments:** Sales and Credit Accounts open `Billing/CreditReceiptModal.vue` to record an amount, payment date, method, receiving native CASH/BANK account and optional reference. Full settlement changes status to PAID; partial settlement remains PENDING. The original payment method/splits and invoice date are retained. Payment history offers manager/accountant/admin dated reversals.
- **Excel export:** `Download` button generates `.xlsx` (exceljs + file-saver) with account name, phone, pending amount, bills count
- **Table state persistence:** filter/sort/pagination/column state saved to `localStorage` key `erp_accounts_table_state_v1` and restored on mount
- **WhatsApp reminder:** The legacy `Send Reminder` action calls `POST /api/whatsapp/send-pending-template` with phone, customer/company names, amount and row ID as `receiptId`. The current template route has one URL button, not a separate UPI payment button. Company-owned automatic invoice reminders are configured separately in `WHATSAPP-NOTIFICATIONS.md`.

---

#### `POST /api/discount/apply` — Bulk Discount Tool

Bulk-applies a discount percentage to variants using raw SQL (`pg` pool).

- Updates `variants.discount` and `variants.d_price = sprice - (sprice * discountPercentage / 100)`
- Filters: categoryId, subcategoryId, status, date range, brand, minRating, maxSprice, minMargin
- Returns `{ success, updatedCount }`

---

### Accounts (`/accounts`)

> **Moved to dedicated file:** See `ARCH-pages-accounts.md` for full accounts/finance documentation (cash ledger, bank, investment, transfers, transactions).

Verified retry/owner fixes (2026-10-06): Billing saves its request UUID in the
company-specific draft through `useBillingDraft`. Unchanged retries reuse it,
including draft reloads. `bill/create.post.ts` uses `saveSourceRequest` inside the
source transaction: a durable audit receipt returns the original result and a
changed payload with the same ID returns 409. Source, receipt and postings commit
together. Sales inline payment status and its paid modal explicitly send the
bill's company in body/header; dropdown owner scoping remains supported.
Payment-method changes still replace the native journal and preserve the archive.

---
## Online sales pages

### `pages/erp/online/index.vue`

Online bill/sales list. Fetches report data through `/api/report/online` and bill rows through `/api/billSale/findManyBills`; exposes filtering, downloadable output, notes, print actions and expandable entry detail. Unlike POS bill creation, this page is for finding and reviewing existing online sales.

### `pages/erp/online/[salesId].vue`

Online sale detail and bill-edit screen for the selected sales ID. Loads bill and entry data, allows supported bill edits through `/api/billEdit/*` and `/api/bill/update`, and includes notification/WhatsApp-related actions. The page checks `bill.isMarkit` to disable certain editing actions for Markit-origin bills. Review the route's validation and server APIs before assuming all fields are editable.

### Customer credit accounts in Accountant

`pages/erp/accounts.vue` embeds the per-customer
`Accountant/CustomerLedger.vue`. GET `/api/accountant/erp/customers/:id` shows posted
receivable lines and their net balance for that company-owned B2B `Account`.
`20260930140000_customer_account_links` extends ERP source snapshots with
`sourceParties.creditAccount` (ID/name). Current journal lines are enriched without
changing balances; new/changed source links validate company ownership. Customers
share the configured receivable account while retaining separate identities.

Customer credit settlement uses company-scoped `billSale/receipts` GET/POST and
`billSale/reverseReceipt` POST. `server/utils/bill-receipts.ts` reuses the existing
`payments` table and native journals; no new table, trigger or schema installation
is required. Receipt status is `POS_CREDIT_RECEIPT`; reversed records remain as
`POS_CREDIT_REVERSED`. `deposit_to` stores the receiving native account ID.

The Sales row shows Collect only for a bill that is not PAID and has a positive
balance due. Reverse appears only when the row has an active, non-deleted
`POS_CREDIT_RECEIPT`. The button container is hidden when neither action applies;
payment history remains available from the row menu.

Each receipt debits the selected cash/bank account and credits the original ERP
source's receivable account, carrying its original customer party snapshots.
The receipt uses its own payment date. The invoice's Credit/Split payment portions,
created date, sales/tax and COGS remain unchanged. PENDING-to-PAID changes retain the
existing ERP financial signature and therefore do not reverse/repost the sale.
Partial receipts keep PENDING until the original credit obligation is fully paid.

Receipt/reversal writes, status history, journals and request-ID audit receipts
share one transaction. Bill row locks serialize collections; integer cents validate
amounts and prevent overpayment. Changed-payload retries reject. Receipts also verify the original posted credit amount against the invoice. They cannot
precede the invoice day or use a future date, foreign/inactive receiving account,
or a locked Accounts/Banking period. A reversal posts opposite lines on its own
selected date and reopens the due, retaining both original receipt and journal.

Collection requires an existing published ERP receivable source. Excluded/unposted
history must be reviewed and posted through the existing history workflow first;
no receipt backfill or invented historical collection date is performed. Staff
credit recipients use Staff Accounting and are rejected by this customer API.

Active receipts block invoice edits, deletion and payment-method/status changes.
Unpaid credit edits preserve original paid portions; use receipts to collect money.
Sales Delete and Change method first inspect active receipts (including partial
collections). They show a reverse-first toast and open `CreditReceiptModal` in
reverse mode instead of the requested action. A structured server conflict
`BILL_RECEIPTS_REQUIRE_REVERSAL` also opens reversal if a collection raced the UI.
Users explicitly reverse each active receipt and retry the original action.
After all receipts are reversed, or if none were collected, Delete follows the
existing soft-delete/stock/points/coupon lifecycle and Change method allows PAID
or PENDING customer credit corrections. Changing Credit to a fully paid tender
marks the bill PAID; retaining Credit derives PENDING. Staff-credit corrections
still use the bill editor/Staff Accounting. Later collections use dated receipts.
Reversed payments, original journals, reversal journals and their audit records
remain intact. The sales payload includes reversed receipt summaries, so Payment
history remains available after changing away from Credit; receipt history reads
also work for corrected or soft-deleted bills. Receipt writes retain active-bill
and customer-credit validation. Method/split/delete errors use `billingErrorMessage`,
and requests use the selected bill's company scope.
Transfers and cleanup reject any receipt history, including reversed receipts.
Generated Payment/Entry mutations and financial Bill mutations are blocked by the
scoped model adapter so nested or bulk CRUD cannot bypass the source flow.
Customer accounting ledgers refresh after receipt/reversal saves.

Verification: `npm run test:bill-receipts` runs targeted type checks, in-memory
transaction/journal tests and compiled Vue/form regressions. `npm run test:bill-receipts:readonly` uses SELECT CTE fixtures and EXPLAIN without ANALYZE
inside a PostgreSQL read-only transaction, checks the existing schema/ERP function,
and compares screen/export totals. `npm run test:customer-accounting` combines
these safe suites. Neither creates schemas nor modifies database records.


Sales history tolerates absent account objects and category data that arrives after the history snapshot. Its watcher updates category labels when categories load, and reads the stored `return_Amt` field with the older `return_amt` fallback. Category/account options use scoped query adapters.


Sales-history list query callbacks use the captured company scope rather than looking up the Nuxt app after setup, preventing an unavailable-instance error during SSR.

Sales-history initial date filters use a timestamp serialized through Nuxt state, so server rendering and client hydration retain the same query key.

Online sales await the initial company scope, rows and report totals through useAsyncData. The browser restores that initial snapshot before mounted refreshes or persisted filters run. Bill-store updates continue to refresh the page without an immediate setup-time fetch.

useExpenseList awaits company scope and the initial query in onServerPrefetch. Successful rows and failed-query loading states therefore finish before the Nuxt payload is transferred. Missing database columns remain backend errors; the hook does not alter the schema.

ExpenseList awaits companyScope.ready before creating its query observer. This aligns the initial client company-filter key with the server-rendered cache when the query fails and canceled earlier keys are absent from the payload.

The ordinary sales list also awaits its initial company-scoped rows, page count, payment totals and credit-collection total through useAsyncData. Bill-store changes refresh later without an immediate setup-time fetch, keeping SSR and client hydration aligned.

#### Receipt PDF sending

Billing, bill edit and online bill detail generate the selected receipt PDF in the browser, using the same monochrome canvas as preview and ESC/POS for Tax, No Tax and custom designs. Send uploads the PDF through `shareReceiptPDF` and passes the resulting signed PDF suffix to the existing WhatsApp `invoice_1` URL button. It sends a PDF download link, rather than a WhatsApp document attachment; the approved template is unchanged. Online detail uses the bill ID for sharing. Upload and WhatsApp failures show an error instead of receipt-send success. Generated coupon messages remain after successful invoice notification. Legacy Original receipt retains its existing PDF layout.
