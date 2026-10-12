### Distributor (`/distributor`)

#### Payment modal allocation and field order (2026-10-12)

The shared payment modal orders distributor/date/amount/payment method before
account choices, linked POs and remarks. Selecting/removing a PO or changing the
payment amount allocates in selection order, capped at each PO's outstanding due;
there is no separate allocation button. Manual allocation edits remain available.
Opening an existing payment preserves its saved allocations until those inputs
change, and its own payment is excluded from the due calculation. Saves invalidate
payment, PO and distributor caches inside the shared modal before emitting `saved`.
Credit date precedes credit details; credit and purchase account selectors follow
the type/amount fields they depend on.

Account selectors request `GET /api/accountant/distributors/:id?view=form` with an
optional sourceKey. This company-scoped response omits ledger, balance and audit
queries, returning account choices, mappings and only the edited source snapshot.
The selectors reserve their labelled fields while loading, disable interaction and
emit a busy state so payment/credit/purchase saves wait for account initialization.
Failures display a retry action. Payment forms show a loading state until source
values, PO choices and saved allocations are ready; generation checks ignore late
responses after closing or switching payment. Supplier forms group identity,
address, tax, opening date/amount and bank details with visible field labels.

All active distributor routes use shared cache invalidation: supplier saves refresh
DistributorCompany and close the form; return create/edit/delete refresh return,
PO, payment, supplier and inventory queries. Return creation invalidates before PDF
download so a failed download cannot leave stale tables. `distributor-revision`
also refreshes the non-query-backed Accounts subtable on source mutations.
The historical `/distributor/credit` route renders the main distributor page,
reusing its payment/credit forms instead of the legacy `Distributor/List.vue`
mutation paths. Return account choices follow date/supplier/PO fields, and filter
amounts have persistent labels. Payment, PO, expense, detail and filter forms retain
their shared implementations.

#### Charge Credit (2026-10-12)

Add Credit offers Product, Amount and Charge Credit. Charge Credit requires a
connected supplier and an active same-company EXPENSE or OTHER_EXPENSE account.
It creates a numbered standalone DC with no money transaction or ERP expense row.
The credit increases payable; the offset is the selected expense account. Product
credits retain their Stock offset; Amount credits retain their cash/bank receipt.

`utils/distributor-credit-kind.ts` derives Charge Credit from the source snapshot's
`accounts.expense`, with linked money transactions identifying Amount credits.
`selectDistributorAccounts` validates the expense role only for Charge Credit and
copies it into the native non-money-credit debit slot (`accounts.stock`) for that
source alone. The installed posting function consumes that slot as an account ID;
it does not update inventory quantities. Supplier/default stock mappings are untouched.
This uses existing JSON snapshots and deferred posting, with no schema or database
function changes. Edits preserve the type and revalidate the expense account;
deletes use the existing native reversal lifecycle. The UI resolves saved type
before opening an edit, and Accounts labels the current source-backed row Charge
Credit under its DC reference, with only the payable credit in the row total.
Stale form selections are stripped by credit type before posting. Existing manual
journals are not converted by this code change.

#### Expense party integration (2026-10-12)

The detail panel adds an Expenses tab using `components/Distributor/Expenses.vue`
and the shared expense list, quick-add and edit forms. Creation fixes the company
and prefills/locks the selected distributor. The tab starts with all dates and does
not reuse the ERP table's persisted filters. Linked payment expenses are visible
but their actions route to Payments to prevent source divergence.

Accounts also includes current posted ERP expense journals linked to this supplier,
with company expense-prefix references and Expense as a filter type. It excludes
DP-linked expenses already represented by Payment. Expense debits include the full
expense plus recoverable tax; running purchase due changes only for actual Accounts
Payable lines, so ordinary expenses do not clear PO balances. Journal details show
the party snapshot. Edits refresh both tables without a page reload.

This requires the local Expense party fields in `schema.zmodel`; no database schema
deployment or production backfill was performed for this feature.

#### Accountant integration (2026-09-27)

Legacy bank disconnection (2026-10-06): supplier credit forms use only native
`AccountSelection` cash/bank choices. The old BankAccount hook and duplicate bank
selector are removed. Credit writes validate `accountingAccounts` against active
same-company native accounts and leave linked MoneyTransaction.account_id null.
Historical credits resolve recorded `bank:<id>` mappings to the native bank picker
before editing; runtime setup derives historical role IDs from source records and
saved mappings without querying the archived bank table.

The main distributor page's Accounts tab replaces the legacy Transactions table with
`AccountingTransactions.vue`. It shows only published entries whose journal ID is
the current distributor source pointer and whose source still exists in the event
projection. Superseded, reversed, deleted-source and unlinked journal rows are
excluded, including from CSV and running due. Rows use Purchase/Payment/Credit/Return/Receipt/
Opening source types; the table offers no Journal/Reversal filters. The preview joins
company-scoped source documents to supply `PO-{purchaseOrderNo}`, `DP-{paymentNo}`,
or `{distributorCreditPrefix}-{creditNo}` references (source IDs when unnumbered), ahead of journal references
or supplier invoice numbers. Payment and credit prefixes come from the owning company's
Numbering settings, defaulting to DP/DC when null; a saved empty prefix omits the dash.
All standalone Add Credit records, including received-money credits, display Credit;
accounting event kinds and amounts remain unchanged. The same source
references drive table search, sorting, details and CSV. It groups
current journal lines and computes running payable from Accounts Payable lines
before date/type/text filtering. Debit/credit details and journal links use current
source-linked accounting data. Full journal history remains available in accounting. Pay/Add Credit and mapped source edit/delete actions still write
the original documents. Source refetches refresh the accounting view. Unconnected
suppliers show an import/setup notice; existing source tables remain in use.

`scripts/audit-distributor-source-accounts.mjs` requires explicit company and report
arguments and runs in a repeatable-read, read-only transaction. It checks positive
PO headers (including separately posted unassigned POs), every distributor payment,
current source journals, all mapped accounting lines, distributor balances, unlinked
entries and the actual API reference query. It saves source/posted evidence and
issues without changing data or database schemas.

`components/Distributor/Accounting.vue` is embedded in Settings → Account → Purchase
for the selected distributor's company-scoped account choices, import preview,
reconciliation and journal lines. Supplier page Accounting buttons are removed.
Company purchase defaults prefill new transaction choices, while saved source
snapshots take precedence on edits. `AccountSelection.vue`
provides transaction overrides in payment/credit forms, the purchase information form
and purchase-return forms. All compatible active accounts are selectable, including
Accounts Payable subaccounts. `server/utils/accountant/distributors.ts` owns the
authenticated `/api/accountant/distributors/:id` GET/PUT and `/:id/import` POST.
Accountant roles and company authorization apply to configuration and import.

For new sources, company purchase defaults overlay supplier mappings for identical
roles, and explicit transaction choices overlay both. The company `opening`
default is now suggested by embedded supplier setup and snapshotted for first
opening postings during import. Additive migration
`20261006120000_supplier_opening_account_default` covers generated opening writes
without replacing the installed posting function. It is tested locally but awaits
deployment; existing source account snapshots stay frozen.

Four migrations (`20260927120000_distributor_accounting`,
`20260927123000_distributor_history_projection`, `20260927130000_distributor_purchase_tax`,
`20260927133000_distributor_receipt_consistency`)
create mappings/source snapshots, the source projection and deferred triggers. They
cover SQL and generated Prisma writes to credits, payments, POs, returns, opening dues
and linked money transactions. A source change and its journals commit or roll back
together. The native trigger reverses/reposts changed sources and deletions. Normal
PO and product edit APIs first call `server/utils/purchase-accounting-update.ts` for
an existing purchase linked to the same supplier: it keeps the journal ID and entry
number, updates its date/reference/total and replaces its payable/stock/GST lines.
The previous journal, lines and source signature are retained in the audit JSON.
The synchronized signature makes the deferred trigger a no-op for that purchase.
Both old and new accounting dates are checked; ALL/ACCOUNTS and relevant BANKING
locks remain enforced. Source signatures prevent duplicate imports. Posted lines
retain both a distributor ID and a company-specific VENDOR contact. Defaults change
future sources; purchase account overrides use the same in-place edit path, while
other transaction overrides retain native reversal/repost behavior. Audit rows retain
the source, revision and previous/new journal IDs. New purchases, supplier changes,
source removal and non-purchase transactions still use native posting. Direct SQL or
generic model writes bypassing these edit APIs retain native reversal behavior.

Purchase orders are the purchase source, for both Credit and paid purchases. Saving
a Credit PO creates no DistributorCredit. `server/utils/purchase-order-source.ts`
registers PO-header authority in the existing accounting audit mechanism inside the
source transaction; the installed deferred posting then reads the PO directly.
This uses data writes only, without runtime schema/view/trigger changes. PO-linked
credit records were removed with a backup; standalone Add Credit records remain.
Where a PO previously inferred its supplier solely from those credits, the existing
source supplier was carried onto the PO before deleting them.
Distributor totals and statements add positive PO totals and standalone credits,
then subtract recorded payments/returns and include the saved opening due. The
main Accounts view still resolves current source journal pointers. PurchaseOrder.tax is a percentage: input tax is
computed from subtotal less percentage/fixed discount, matching purchase totals.
Standalone product credits debit Stock; amount credits debit the mapped cash/bank.
Payments debit Payable and credit cash/bank; returns debit Payable and credit stock
and recorded return tax. Opening due offsets the selected opening account; a missing
opening date falls immediately before the earliest transaction (1970-01-01 when none).
Historical import never changes item quantities and does not import bank/cash openings
or sales/COGS: the new books are not a complete inventory valuation until those other
workflows/openings are adopted.

Credit writes in the main distributor page now use `/api/distributor/credits` and
`/api/distributor/credits/:id`, atomically maintaining the linked money transaction
and new native settlement journals; legacy ledger rows are no longer rebuilt. Deferred receipt checks reject amount/company/status/
direction changes that would separate a connected credit from its money transaction;
direct deletion requires removing the credit first. Purchase editing uses `/api/purchaseorder/update`;
the server reads the stored payment method and rejects unsafe payment-method changes
with existing settlements. PO/product recalculation never resets payment amounts.
An explicitly paid new PO creates one numbered DP after its total is finalized;
an existing payment/allocation prevents an extra payment. Generic direct and nested
PO-credit links are rejected by `organizationModelScope.ts`. Return deletion uses `DELETE /api/purchasereturn/:id`,
restores quantities and removes return/payment rows atomically, triggering reversal. Supplier-return edits lock the header before reading old lines to serialize concurrent edits/deletion; stock updates are company-scoped.

Apply with `npm run db:distributor-accounting`. The explicit-company import CLI is
`tsx scripts/import-distributor-accounting.ts --company=<id> [--company=<id> ...]`;
add `--apply` to import and enable posting. It selects standard accounts by code,
uses Petty Cash for legacy CASH, creates bank mappings without opening amounts,
and writes `distributor-accounting-preview.json` / `distributor-accounting-import.json`.
The import preserves existing configured mappings and checks expected versus posted
payable per distributor, balanced journals and a no-change second sync. Dry runs roll
back default chart creation as well as other database changes. JSON reports retain
source conflicts and reconstructed purchases; migration warnings are not rendered in
the distributor UI. See `scripts/DISTRIBUTOR-ACCOUNTING.md` for operational steps.
Integration tests run in a temporary isolated schema.

Head-office admins default to the active head office plus active direct branches. Each table uses `useCompanyScope('table')` and `CompanyTableFilter.vue`; filters remain local to the component and participate in query keys. `CompanyFormField.vue` is inside add/edit forms: new forms default to the active head office, while edits load the stored owner through `/api/organization/context`. Related quick-add fields inherit their enclosing form company. Supplier, purchase-order, payment, credit, and purchase-return tables use the local scope. Shared suppliers are selected through company/distributor links. Scoped requests also drive PDF and Excel exports. Requests use explicit company IDs without updating the authentication session or sidebar company. `useOrganizationActions.ts` resolves row ownership locally. Changing an existing record's company opens the transfer preview, requires explicit destination mappings and linked-record confirmation, then moves the saved record in a transaction. Save other form changes before confirming a transfer. See `ARCH-storetools-api.md` for transfer and authorization details.

The standalone Purchase Orders and Payments tables include a searchable distributor
choice in their filter modals. Options come from accessible company/distributor links;
the selected distributor ID joins the existing server-side date/search/payment filters,
so rows and counts paginate together. Reset clears the selection. PDF/Excel downloads
receive the same distributor ID; purchase-order exports calculate due from all
recorded payments and allocations for every payment type.

Payment creation from the payment and PO forms calls `/api/distributor/payments` with `createExpense: true`. This allocates payment/expense numbers and writes the linked source expense in one transaction. Payment edit/delete keeps that source synchronized; native supplier triggers post the payment once and suppress a duplicate ERP expense journal. No old account-ledger rows are created or rebuilt. Distributor and purchase-order options follow the selected form company.

`components/Distributor/PaymentFormModal.vue` is the shared add/edit form used by
`pages/distributor/payments.vue` and the distributor detail Payments and Accounts
tabs. The Pay actions in both purchase-order tables also open it with the selected
supplier and PO. The form preserves existing allocations on edit and saves through
`/api/distributor/payments`; the parent tables invalidate and refetch after save.

The Distributor Payments form supports one payment allocated across multiple outstanding
POs of the same supplier/company, regardless of the original payment method. `DistributorPayment.allocations` stores each PO
and its portion of the payment in `distributor_payment_allocations`; the payment
total and optional linked expense are stored once. Legacy `purchaseOrderId` remains
for single-order clients, while allocated payments leave that field null. The
payment table and PDF/Excel exports show all linked PO numbers. PO list/detail paid
and due values combine legacy payments with allocation amounts, never the whole
payment for each PO. A fully allocated payment clears the calculated due of fully
covered orders without setting the manual `dueCleared` flag.

`utils/purchase-order-payments.ts` calculates dues from the source total minus
direct payments and per-PO allocations in cents. Increasing an already-paid PO's
total preserves its original payment and exposes the remainder in both PO lists,
details and payment options, regardless of its original payment method. Manual
`dueCleared` remains respected; editing a payment excludes its existing portion.
After a PO or distributor payment write, `useModelCache` invalidates both the
purchase-order query and the `DistributorCompany` query that embeds PO totals,
payments and dues. Distributor, PO and payment tables refetch when reactivated;
open PO details follow their freshly loaded row. This keeps tables current after
product purchase-price edits and payment changes without a browser reload.

`server/utils/distributor-payment-save.ts` handles both create and edit atomically:
positive cent-precision amounts, unique selected POs, total allocation equality,
current unpaid order limits, supplier/company ownership and transaction
locks. An empty allocation list unlinks orders; editing replaces allocations.
Payment deletion cascades allocations, restoring those calculated dues. PO deletion
is restricted while allocated, and PO edits cannot change its supplier/payment type
or reduce its total below allocated payments. Generic allocation writes are denied;
reads are company-scoped by the organization proxy. The allocation table and its
indexes/foreign keys were applied with Prisma `db push` on 2026-10-11 after a
schema/data backup; existing payment and purchase-order data was preserved.
`node tests/distributor-payment-allocations.test.mjs` runs allocation/API and Vue
checks without a database.

`node node_modules/tsx/dist/cli.mjs tests/purchase-payment-flow.integration.test.ts`
exercises real product/PO/payment/credit/return handlers and installed accounting
triggers in one rollback-only transaction on the existing schema. It covers both
PO creation paths with Credit/Cash/Bank/UPI/Card/Cheque, edits preserving settlements
and purchase journal IDs, multi-PO allocation/edit/unlink/delete and invalid-input
rollback, standalone credits, supplier returns and stock after sales. Sales fixtures
use the already-installed billing function to avoid the HTTP wrapper's schema
bootstrap. No schema creation or migration runs. The report is saved under
`artifacts/purchase-flow-regression/latest.json` in the workspace root.
The `--remaining-due-only` option runs the focused paid-PO edit/settlement regression
and writes `remaining-due.json` in the same directory.

**Files:**
- `pages/distributor/index.vue` — Distributor list with two-pane split layout (PO + credit tabs)
- `pages/distributor/credit.vue` — Distributor credit/payment ledger per distributor (legacy — functionality now also in index.vue)
- `pages/distributor/purchaseOrder.vue` — All purchase orders across all distributors
- `pages/distributor/add-purchase-return.vue` / `pages/distributor/edit-purchase-return/[id].vue` — Purchase return entry/edit forms; rows capture barcode/product/category/size/qty/rate/reason, with subtotal and grand total derived from `qty × rate` only
- `components/Distributor/Dlist.vue` — Distributor list component (legacy — no longer used by index.vue)
- `components/Distributor/List.vue` — Distributor credit/payment list component (used by credit.vue)
- `components/Distributor/Form.vue` — Add/edit distributor form
- `server/api/purchaseorder/create.post.ts` — Create empty PO (used when starting product add flow)

**ZenStack hooks used:**
- `index.vue`: `useFindManyDistributorCompany`, `useDeleteDistributorCompany`, `useDeletePurchaseOrder`, `useCreateDistributorPayment`, `useUpdateDistributorPayment`, `useDeleteDistributorPayment`, `useCreateDistributorCredit`, `useUpdateDistributorCredit`, `useDeleteDistributorCredit`, `useDeletePurchaseReturn`, `useFindManyBankAccount`, `useCreateMoneyTransaction`, `useUpdateMoneyTransaction`, `useDeleteMoneyTransaction`
- `List.vue`: `useFindManyDistributorCompany`, `useCreateDistributorPayment`, `useUpdateDistributorPayment`, `useDeleteDistributorPayment`, `useCreateDistributorCredit`, `useUpdateDistributorCredit`, `useDeleteDistributorCredit`, `useDeleteDistributorCompany`
- `purchaseOrder.vue`: `useFindManyPurchaseOrder`, `useCountPurchaseOrder`, `useDeletePurchaseOrder`, `useCreateDistributorPayment`
- `Form.vue`: `useCreateDistributor`, `useUpdateDistributor`

**Tables touched:** `distributors`, `distributor_companies`, `distributor_payments`, `distributor_credits`, `purchase_orders`, `products`, `variants`, `items`, `expenses`, `addresses`

---

#### Key Architecture: Distributor is a Shared Entity

`Distributor` is NOT per-company. It's a shared entity linked to companies via the `DistributorCompany` junction table.

- All distributor list queries use `useFindManyDistributorCompany` (not `useFindManyDistributor`) — always filtered by `companyId` through the junction
- Delete distributor → `useDeleteDistributorCompany` with compound key `distributorId_companyId` — **unlinks** the distributor from the company, does NOT delete the distributor entity itself
- Create distributor → `useCreateDistributor` with nested `companies: { create: { company: { connect: { id: companyId } } } }` — creates + links in one call

---

#### `pages/distributor/index.vue` — Distributor List (Rewritten)

**Major rewrite:** `Dlist.vue` component is no longer used. All logic is now inline in `index.vue` with a two-pane split layout.

Fetches `DistributorCompany` records with distributor info + purchase orders + credits + payments.

- **Layout:** Left panel = distributor summary table; Right panel = selected distributor detail with tabs
- **Summary columns:** Distributor name, Orders, Total (sum of `distributorCredits.amount`), Paid (sum of `distributorPayments.amount`), Return (sum of `distributorPayments` where `paymentType='RETURN'`), Opening Due (`DistributorCompany.openingDue`), Due (`openingDue + Total − Paid`) — all computed client-side
- **Detail panel tabs:** Accounts, Purchase Orders, Purchase Returns, Payments, Expenses
  - **Transactions tab** (the main ledger view) — columns: **Date · No · Type · Remarks · Debit · Credit · Actions**.
    - Row taxonomy (mapped client-side in `distributors` computed):
      | Source row | Condition | Type label | No | Debit | Credit |
      |---|---|---|---|---|---|
      | `PurchaseOrder` | positive total | `PURCHASE` | `PO-{po.purchaseOrderNo}` | – | `totalAmount` |
      | `DistributorCredit` | no `purchaseOrderId` | `CREDIT` | `DC-{creditNo}` | – | `amount` |
      | `DistributorPayment` | `paymentType !== 'RETURN'` | `PAYMENT` | `DP-{paymentNo}` | `amount` | – |
      | `DistributorPayment` | `paymentType === 'RETURN'` (linked via `purchaseReturnId`) | `PURCHASE RETURN` | `PR-{returnNo}` (resolved via `returnMap` built from `purchaseReturns`) | `amount` | – |
    - Row backgrounds (via `row.class` — same idiom as `pages/accounts/cash.vue`'s `styledLedger`): credit rows green (`bg-green-50 dark:bg-green-900/20`), debit rows red (`bg-red-50 dark:bg-red-900/20`).
    - Type filter options: `ALL / PURCHASE / PAYMENT / CREDIT / PURCHASE RETURN` — applied as `t.type === filter` in `filteredTransactions`.
    - Source-backed Accounts purchase rows and Purchase Orders tab rows share Details, Print, Edit, Pay, Clear Due, Restore Due, and Delete actions. Edit opens `/products/add?poId=...&isEdit=true`. Payment rows in Accounts and Payments share Edit/Delete and the same payment form as the standalone Payments page. `CREDIT` rows open the Add Credit modal preloaded with `creditKind` (derived from `moneyTransactionId` presence) and (for AMOUNT credits) `paymentMode`/`bankAccountId` from the linked `moneyTransaction`. The kind toggle is locked during edit (`editingCreditKindLocked = true`).
  - **Purchase Orders tab:** PO list with columns: PO No, Date, Payment Type, Total, Qty (sum of `item.initialQty`), Due (all payment types, calculated from settlements), and the shared PO action menu.
  - **Purchase Returns tab:** date-filtered list with columns: Date, PO No, Subtotal, Tax, Total, Remarks, Actions (Download / Edit / Delete).
  - **Payments tab:** selected-distributor-only payment rows (purchase-return payments excluded), with Payment No, Date, PO No, Payment, Amount, Remarks, and Actions columns. Includes date range and payment-mode filters, pagination, New Payment, and the shared transaction Edit/Delete menu.
- **Pay flow:** opens the shared `PaymentFormModal.vue` with optional PO preselection; it supports multiple PO allocations, date, amount, payment type (CASH/BANK/UPI/CARD/CHEQUE), remarks, and account selection.
- **Add Credit flow** — modal with **Credit For** select (`PRODUCT` / `AMOUNT`) at top:
  - **PRODUCT** (default): inserts only a `DistributorCredit` row (date, billNo, amount, remarks). Same as legacy behavior.
  - **AMOUNT**: selects CASH/BANK and an optional existing bank identity. `POST /api/distributor/credits` atomically creates the linked MoneyTransaction and DistributorCredit through `distributor-credit-write.ts`; PUT/DELETE maintain both. New supplier triggers post the receipt, with source account selection retained. The retired standalone `/api/accounts/transactions` endpoint is not used; no legacy account-ledger rows are written. Bill No is hidden.
  - Edit also syncs the linked MoneyTransaction's amount/paymentMode/accountId/createdAt when editing an AMOUNT credit.
- **Delete:**
  - PO → `useDeletePurchaseOrder`.
  - Distributor → `useDeleteDistributorCompany`.
  - PURCHASE row deletes its PO through the existing PO delete action; standalone CREDIT rows use the atomic distributor credit API.
  - PAYMENT row → `useDeleteDistributorPayment`.
  - PURCHASE RETURN row → `useDeletePurchaseReturn` (handled in the dedicated branch of `transactionAction` for `paymentType === 'RETURN'`).
- **Main-table row menu (`mainAction`):** Edit · Pay · Add Credit · Purchase Return · **Download Transactions** (new — calls `downloadAllTransactions(row)` which hits `/api/downloads/distributor-credits.pdf` with no `startDate`/`endDate`/`type` so the endpoint returns the full all-time ledger) · Delete.
- **State persistence:** sort, page, pageCount, search, per-tab date ranges, per-tab filters all stored in `useLocalStorage` with `dist:*` keys.
- **Navigation change:** "Distributor > Credit" sidebar link is commented out in `layouts/default.vue` (credit functionality is now integrated into the distributor index detail panel)

---

#### `pages/distributor/credit.vue` + `List.vue` — Credit/Payment Ledger

Fetches `DistributorCompany` records with `distributorCredits` + `distributorPayments` (no purchase orders here).

- **Same summary columns** as index: Total, Paid, Due
- **Expandable rows:** show a merged **transactions** list — credits (type=`CREDIT`, styled red) + payments (type=`PAYMENT`, styled green), sorted by date descending
- Distributor actions: Pay, Add Credit, Edit, Delete

**Pay flow (inline modal):**
- Create: `useCreateDistributorPayment` linked to `distributorCompany` via compound key
- Update: `useUpdateDistributorPayment` by id
- Fields: date, amount, paymentType (CASH/BANK/UPI/CARD/CHEQUE), remarks
- **UPI QR code:** when `paymentType = 'UPI'`, generates UPI deep link `upi://pay?pa={upiId}&pn={name}&am={amount}&cu=INR&tn={remarks}` and renders as QR code via `qrcode.vue`

**Add Credit flow (inline modal):**
- Create: `useCreateDistributorCredit` linked to `distributorCompany` via compound key
- Update: `useUpdateDistributorCredit` by id
- Fields: date, billNo, amount, remarks
- If editing a credit that has `purchaseOrderId` → redirects to `/products/purchase?poId={id}&isEdit=true` instead of showing modal (credit is tied to a PO, edited via product page)

**Delete:** `useDeleteDistributorCredit` or `useDeleteDistributorPayment` based on `row.type`

---

#### `pages/distributor/purchaseOrder.vue` — Purchase Orders List

A company-wide list of all purchase orders (not grouped by distributor).

- Fetches via `useFindManyPurchaseOrder` — filtered: `{ companyId, products: { some: {} } }` (only POs that have at least one product)
- Includes `distributorPayment[]` (payment history) + `products > variants > items` (for qty calculation)
- **Qty column:** sum of `item.initialQty` across all variants/products of each PO (uses `initialQty` not `qty` — captures stock at time of purchase)
- **Due column:** calculated for every payment type from the PO total less linked payments and allocations.
- **"Pay" action:** shown when an associated supplier has an outstanding due; the menu also supports Clear Due and Restore Due.

**Pay flow:** opens the shared `PaymentFormModal.vue` preselected to this PO. Its API save creates the linked expense source in the payment transaction; native supplier settlement posts once while the ERP expense trigger suppresses duplicate posting.

**Expandable rows:** show payment history for that PO (date, type, amount, remarks)

**Edit PO:** navigates to `/products/add?poId={id}&isEdit=true&from=distributor-purchase-order`

---

#### `components/Distributor/Form.vue` — Add/Edit Distributor

- Create: `useCreateDistributor` with nested `address.create` + `companies.create` → links distributor to current company in one call
- Update: `useUpdateDistributor` with `address.create` — **Bug: creates a NEW address record instead of updating the existing one on edit. Should use `upsert` or `update`.**
- Fields: name, address (street, locality, city, state, pincode), GSTIN, bank details (accHolderName, bankName, accountNo, ifsc, upiId)

---

#### `POST /api/purchaseorder/create` — Empty PO Creation

Creates a bare PO with only `companyId` — no products, no distributor, no amount.

- Uses Prisma directly (not ZenStack)
- Returns `{ id }` — this ID is passed as `?poId=` query param when navigating to `/products/purchase`
- This is now the distributor/PO flow only. The normal `/products/add` page is draft-only and does not create an empty PO up front.

---

#### Bugs / Issues

- `Form.vue` distributor edit uses `address: { create: {} }` — creates a new address every time the distributor is edited instead of updating the existing one. **Address records accumulate on edit.**
- ~~`Dlist.vue` console.log on every data change~~ — **FIXED** (Dlist.vue no longer used; index.vue rewritten without debug logging)
- `purchaseOrder.vue` has a `watch(rows, val => console.log(...))` — logs all PO rows to console on every update

---
## Additional distributor pages

### `pages/distributor/payments.vue`

Distributor payment register. Uses company-scoped payment hooks to list, count and create records. Staff can filter by date, search and payment type, edit/delete a payment, and download the filtered register through `/api/downloads/distributor-payments.{format}`. Payment records are not the same as distributor credit entries or purchase orders.

### `pages/distributor/purchase-return.vue`

Purchase-return register for goods sent back to a distributor. Uses company-scoped `useFindManyPurchaseReturn` and `useDeletePurchaseReturn` to list/delete returns; it has date, amount and search filters with persisted table settings, Excel export of visible data, and per-return PDF download via `/api/downloads/purchase-return.pdf`. The row menu links to the edit form. This is not the customer ecommerce-return workflow in `pages/order/returns.vue`.

### `pages/distributor/add-purchase-return.vue`

Create a purchase return for a chosen distributor and optional purchase order. Staff can scan a barcode or search products, add/edit quantity, rate and reason rows, enter a date and remarks, then submit via `/api/purchasereturn/create`. Barcode lookup uses `/api/purchasereturn/findItem`. The page navigates back to the return register after a successful create and offers a PDF of the new return.

### `pages/distributor/edit-purchase-return/[id].vue`

Loads the return by route ID from `/api/purchasereturn/{id}`, pre-fills the same distributor/order/item/date/remarks form, and submits changes to `/api/purchasereturn/update`. The UI loads categories and can re-check scanned items; it is an edit of an existing return, not a second return creation.
