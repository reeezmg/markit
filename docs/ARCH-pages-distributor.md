### Distributor (`/distributor`)

#### Accountant integration (2026-09-27)

Legacy bank disconnection (2026-10-06): supplier credit forms use only native
`AccountSelection` cash/bank choices. The old BankAccount hook and duplicate bank
selector are removed. Credit writes validate `accountingAccounts` against active
same-company native accounts and leave linked MoneyTransaction.account_id null.
Historical credits resolve recorded `bank:<id>` mappings to the native bank picker
before editing; runtime setup derives historical role IDs from source records and
saved mappings without querying the archived bank table.

The main distributor page's Accounts tab replaces the legacy Transactions table with
`AccountingTransactions.vue`. It groups published journal lines by journal, computes
running payable from Accounts Payable lines before filtering, and includes reversal
journals. Date/type/text filters, CSV export, debit/credit details and journal links
use accounting data. Pay/Add Credit and mapped source edit/delete actions still write
the original documents. Source refetches refresh the accounting view. Unconnected
suppliers show an import/setup notice; existing source tables remain in use.

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
together. Changes/deletions reverse the previous journal at its original date before
posting a replacement; ALL/ACCOUNTS and relevant BANKING locks are enforced. Source
signatures prevent duplicate imports. Posted lines retain both a distributor ID and
a company-specific VENDOR contact. Defaults change future sources; an explicit
transaction account override reverses/reposts the affected source. Audit rows retain
the source, revision and previous/new journal IDs.

Purchase credits linked to the same PO are grouped by company/distributor. Their
actual amounts and distributor ownership take precedence over inconsistent historical
PO headers; the preview lists mismatches. A paid PO with linked payment(s) and no
credit gets a purchase-side journal. This is disclosed as a difference from legacy
due, whose calculation only sums credits less payments plus opening due. A PO without
a credit or payment does not post. PurchaseOrder.tax is a percentage: input tax is
computed from subtotal less percentage/fixed discount, matching purchase totals.
When credited amount disagrees with the PO, no unsupported tax split is inferred.
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
with existing settlements. Return deletion uses `DELETE /api/purchasereturn/:id`,
restores quantities and removes return/payment rows atomically, triggering reversal.

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

Payment creation from the payment and PO forms calls `/api/distributor/payments` with `createExpense: true`. This allocates payment/expense numbers and writes the linked source expense in one transaction. Payment edit/delete keeps that source synchronized; native supplier triggers post the payment once and suppress a duplicate ERP expense journal. No old account-ledger rows are created or rebuilt. `CompanySupplierField.vue` and purchase-order options follow the selected form company.

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
- **Detail panel tabs:** Transactions, Purchase Orders, Purchase Returns, Payments
  - **Transactions tab** (the main ledger view) — columns: **Date · No · Type · Remarks · Debit · Credit · Actions**.
    - Row taxonomy (mapped client-side in `distributors` computed):
      | Source row | Condition | Type label | No | Debit | Credit |
      |---|---|---|---|---|---|
      | `DistributorCredit` | `purchaseOrderId` set | `PURCHASE` | `PO-{po.purchaseOrderNo}` | – | `amount` |
      | `DistributorCredit` | no `purchaseOrderId` | `CREDIT` | `DC-{creditNo}` | – | `amount` |
      | `DistributorPayment` | `paymentType !== 'RETURN'` | `PAYMENT` | `DP-{paymentNo}` | `amount` | – |
      | `DistributorPayment` | `paymentType === 'RETURN'` (linked via `purchaseReturnId`) | `PURCHASE RETURN` | `PR-{returnNo}` (resolved via `returnMap` built from `purchaseReturns`) | `amount` | – |
    - Row backgrounds (via `row.class` — same idiom as `pages/accounts/cash.vue`'s `styledLedger`): credit rows green (`bg-green-50 dark:bg-green-900/20`), debit rows red (`bg-red-50 dark:bg-red-900/20`).
    - Type filter options: `ALL / PURCHASE / PAYMENT / CREDIT / PURCHASE RETURN` — applied as `t.type === filter` in `filteredTransactions`.
    - Edit action: `PURCHASE` rows route to `/products/purchase?poId=...&isEdit=true`; `CREDIT` rows open the Add Credit modal preloaded with `creditKind` (derived from `moneyTransactionId` presence) and (for AMOUNT credits) `paymentMode`/`bankAccountId` from the linked `moneyTransaction`. The kind toggle is locked during edit (`editingCreditKindLocked = true`).
  - **Purchase Orders tab:** PO list with columns: PO No, Date, Payment Type, Total, Qty (sum of `item.initialQty`), Due (for CREDIT only), Actions (Pay/Delete).
  - **Purchase Returns tab:** date-filtered list with columns: Date, PO No, Subtotal, Tax, Total, Remarks, Actions (Download / Edit / Delete).
  - **Payments tab:** selected-distributor-only payment rows (purchase-return payments excluded), with Payment No, Date, PO No, Payment, Amount, Remarks, and Actions columns. Includes date range and payment-mode filters, pagination, New Payment, and the shared transaction Edit/Delete menu.
- **Pay flow:** inline modal with date, amount, paymentType (CASH/BANK/UPI/CARD/CHEQUE), remarks. Uses `useCreateDistributorPayment` / `useUpdateDistributorPayment`. UPI QR code shown when paymentType = UPI. Optional PO link search.
- **Add Credit flow** — modal with **Credit For** select (`PRODUCT` / `AMOUNT`) at top:
  - **PRODUCT** (default): inserts only a `DistributorCredit` row (date, billNo, amount, remarks). Same as legacy behavior.
  - **AMOUNT**: selects CASH/BANK and an optional existing bank identity. `POST /api/distributor/credits` atomically creates the linked MoneyTransaction and DistributorCredit through `distributor-credit-write.ts`; PUT/DELETE maintain both. New supplier triggers post the receipt, with source account selection retained. The retired standalone `/api/accounts/transactions` endpoint is not used; no legacy account-ledger rows are written. Bill No is hidden.
  - Edit also syncs the linked MoneyTransaction's amount/paymentMode/accountId/createdAt when editing an AMOUNT credit.
- **Delete:**
  - PO → `useDeletePurchaseOrder`.
  - Distributor → `useDeleteDistributorCompany`.
  - PURCHASE/CREDIT row → `useDeleteDistributorCredit`; if the credit has `moneyTransactionId`, also call `useDeleteMoneyTransaction` (application-layer cascade — schema FK is `onDelete: SetNull` on the DistributorCredit side).
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
- **Due column:** only for CREDIT type POs → `totalAmount - sum(distributorPayment.amount)`; null for non-credit POs
- **"Pay" action:** only shown for CREDIT type POs

**Pay flow (inline modal for PO):**
- `useCreateDistributorPayment` with: `purchaseOrder.connect`, `distributorCompany.connect`, and a nested `expense.create`
- Expense created with: `expensecategoryId = session.purchaseExpenseCategoryId` (the "Purchase" category created at registration), `paymentMode = form.paymentType`, `status = 'Paid'`
- PO-page payments create a linked expense source; native supplier settlement posts once while the ERP expense trigger suppresses duplicate posting.

**Expandable rows:** show payment history for that PO (date, type, amount, remarks)

**Edit PO:** navigates to `/products/purchase?poId={id}&isEdit=true`

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
