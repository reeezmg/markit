### Distributor (`/distributor`)

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
  - **AMOUNT**: shows `Payment Mode` (CASH/BANK) and (if BANK) a `Bank Account` select populated from `useFindManyBankAccount` + a `__PRIMARY__` sentinel option. On submit, creates a `MoneyTransaction` through `POST /api/accounts/transactions` (`partyType=SUPPLIER`, `direction=RECEIVED`, `status=PAID`, selected payment account) **then** creates the linked `DistributorCredit`. The transactions endpoint rebuilds the relevant persisted `account_ledger_entries`; the ledger read APIs do not query `money_transactions` directly. Bill No is hidden in AMOUNT mode.
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
- This means **every distributor payment from the PO page auto-creates an Expense record** — tracked in the accounts ledger

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
