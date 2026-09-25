### ERP (`/erp`)

**Files:**
 - `pages/erp.vue` — Parent ERP shell with `UDashboardPage`/`UDashboardPanel`; exact `/erp` path redirects to `/erp/billing`
- `pages/erp/billing.vue` — Main POS billing page (~1,700 lines; coordination layer only)
- `pages/erp/sales.vue` — Sales list with print/edit/delete
- `pages/erp/expenses.vue` — Expense management
- `pages/erp/accounts.vue` — Credit accounts (B2B) with bills
- `pages/erp/edit/[salesId].vue` — Edit an existing bill
- `components/Billing/AddClient.vue` — Shared add/link client modal (also used in /client)
- `components/Billing/ProductSearch.vue` — Product search modal for adding items to bill
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
| `/api/bill/findBillCounter` | POST | Raw SQL (pg pool) | Atomically increment and return `bill_counter` (`UPDATE … RETURNING`). Called before save so invoice# is available for instant print. Uses shared `~/server/db` pool. |
| `/api/bill/create` | POST | PostgreSQL `create_bill_plpgsql(jsonb)` function via shared `pg` pool | Create bill. The endpoint ensures the function exists and calls `SELECT create_bill_plpgsql($1::jsonb)`; invoice number is pre-reserved by `findBillCounter`. |
| `/api/bill/update` | POST | Raw SQL / pg transaction | Edit bill entries |
| `/api/bill/offline` | POST | Raw SQL (pg pool) | Offline stock updates (qty/soldQty sync) |
| `/api/bill/findUniqueClient` | GET | Prisma | Look up client by phone |
| `/api/bill/findManyClient` | GET | Raw SQL (pg pool) | Suggest up to 5 company-linked clients by name or phone digits for billing/edit client search |
| `/api/bill/findManyCategory` | GET | Raw SQL (pg pool) | List categories for billing (id, name, hsn) |
| `/api/bill/findFirstEntry` | GET | Raw SQL (pg pool) | Find entry by barcode + companyId + invoiceNumber. Joins `entries` → `bills` + `variants`. Used by SalesReturn for invoice-constrained barcode lookup. |
| `/api/bill/findManyCoupon` | GET | Prisma | List applicable coupons |
| `/api/bill/findManyAccount` | GET | Raw SQL | List credit accounts; with `includeUsers=true`, returns account/user selector options for POS credit billing |
| `/api/bill/createAccount` | POST | Prisma | Create a new credit account |
| `/api/bill/findFirstItem` | GET | Raw SQL (pg pool) | Fetch item by barcode for billing, including zero/negative stock items |
| `/api/bill/searchItems` | GET | Raw SQL (pg pool) | Suggest in-stock items by barcode, product name, variant name, or subcategory name; returns up to `limit` Prisma-like item rows for quote item typeahead |
| `/api/bill/redeemClientPoints` | POST | Raw SQL (pg pool) | Redeem or revert loyalty points |
| `/api/bill/by-barcode` | GET | — | Lookup by barcode (not read) |
| `/api/billSale/findManyBills` | POST | Raw SQL (pg pool) | Paginated bill list for sales page. Supports: `selectedPaymentMethods[]`, `minGrandTotal`, `maxGrandTotal` filters. Reads `cleanup` from session and the cleanup-only `showCleanedValues` body flag: normal users always exclude soft-deleted bills (`precedence IS NOT TRUE`); cleanup users with the toggle off see original cleanup values plus `precedence=true` rows; cleanup users with the toggle on see current cleaned values and exclude `precedence=true` rows. Returns `b.precedence` in SELECT. |
| `/api/billSale/updatePaymentMethod` | POST | Raw SQL (pg pool) | Updates a bill's `payment_method` and optional `split_payments`, leaving `payment_status` unchanged. Used by the sales page "Change method" action. |
| `/api/billSale/receipt` | GET | — | Bill receipt |
| `/api/billEdit/findUniqueBill` | GET | Raw SQL (pg pool) | Fetch full bill for edit page |
| `/api/billEdit/deleteBill` | POST | Raw SQL (pg pool) | Soft delete bill |
| `/api/billEdit/findEntriesToDelete` | POST | — | Find entry IDs to remove during edit |
| `/api/billEdit/updateBillNotes` | POST | — | Update bill notes |
| `/api/billEdit/updatePaymentStatus` | POST | — | Update payment status |
| `/api/discount/apply` | POST | Raw SQL (pg pool) | Bulk apply discount% to variants |
| `/api/accounts/expenses` | GET | Raw SQL (pg pool) | List expenses with search (note/category/user name via JOINs), status/paymentMode/category/user/amount/date filters, whitelisted sort columns (incl. nested `expensecategory.name`/`user.name`), pagination. Returns `{ rows, total }`. Rows shaped with nested `expensecategory {id,name}` + `user {userId,name,phone}` and `createdAt`. |
| `/api/accounts/expenses` | POST | plpgsql function (pg pool) | Create expense via a `create_expense(...)` plpgsql function called in **one round-trip** (`SELECT create_expense(...)`). The function bumps `companies.expense_counter`, inserts the expense (gap-free — single statement = single implicit txn), and for **PAID** expenses inserts the account-ledger DEBIT + recomputes that account's running `balance_after`. The function is created lazily once per server process (`ensureCreateExpenseFn` + an in-memory `fnReady` flag; `ensureAccountLedgerSchema` guarantees the ledger types/table). **Duplicates** the ledger logic from `server/utils/account-ledger.ts` (`expenseLedgerRows` + `rebuildAccountLedgerForSource` for a fresh source) — keep in sync. No `/api/counter/increment` call and no session-counter write (`expenses/next-number.get.ts` reads the counter from the DB). Returns `{ success, id, expenseNumber }`. |
| `/api/accounts/expenses/[id]` | PUT | Raw SQL (pg pool, transaction) | Update expense + rebuild account ledger for the source |
| `/api/accounts/expenses/[id]` | DELETE | Raw SQL (pg pool, transaction) | Delete expense + remove its account-ledger entries |
| `/api/accounts/expenses/status` | POST | Raw SQL (pg pool, transaction) | Bulk "Mark as" status update for `{ ids, status }`; rebuilds the account ledger per touched row (status drives ledger inclusion). Replaces the old `useUpdateManyExpense`, which never updated the ledger. |
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

billing.vue is a **coordination layer** (~1,700 lines). All logic lives in dedicated composables; the file owns only DOM refs, keyboard nav, table resize, and the template.

**Composable architecture:**

| Composable | Owns | Key exports |
|---|---|---|
| `useBillingDraft` | All bill state refs, localStorage sync, draft CRUD | `billNo, date, items, discount, redeemedAmt, grandTotal, subtotal, tQty, splitPayments, tempSplits, ...`, `createNewBill, deleteBill, resetDraft` |
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
- All in-progress bills stored in `localStorage` under key `bills` as a JSON array
- Multiple bills can be open simultaneously — each has a sequential `billNo` (1, 2, 3...)
- Entire bill state auto-saved to localStorage on every change via `watch(currentBill, ...)` in `useBillingDraft`
- On mount: loads existing drafts; if none exist, creates a default empty bill
- `createNewBill()` / `deleteBill()` manage the array with re-sequencing after changes

**Item row structure:**
Each row in the bill table: `{ id, variantId, sn, barcode, category[], size, unit, name, qty, rate, discount, tax, value, sizes, totalQty, return, userCode, userId, user, cost }`
- `unit` is display-only in the bill grid and is sourced from the resolved variant (`variant.unit`) with a `Nos` fallback; the column is hidden entirely when only one billing unit is enabled in settings

**Keyboard navigation flow:**
- Barcode field → Enter (with valid barcode) → auto-fetch item + add new row, focus next barcode
- Barcode field → Enter (empty) → jump to main discount field
- Barcode field → Enter (non-barcode text) → treat as category shortcut (lookup via `categoryStore.getCategoryByShortCut()`)
- Main discount → Enter → payment method
- Payment method → Enter → Save button
- Shift+Enter → focus phone number field

**Barcode format:** `/^\d+[A-Z]\d{6}$/` — Capacitor scanner enforces this; Quagga2 accepts any CODE_128/EAN

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
- Grand total discount: three modes based on input value:
  - Positive number (e.g. `10`) → percentage off total
  - Negative number (e.g. `-5`) → fixed amount subtracted (round off)
  - `+` prefixed number (e.g. `+50`) → fixed amount **added** to total
- Input is `type="text"` to allow the `+` prefix; stored as string in drafts, converted for DB (`+` case stores `discount: 0` since no discount was applied)
- Receipt total savings is computed from print data, not stored on the bill:
  - `lineSavings = tdiscount` from `buildPrintData()` (sum of per-entry discounts; negative entry discount is flat amount × qty, positive entry discount is percentage of rate × qty)
  - `billDiscountBase = ttvalue` (sum of final entry values after per-line discounts; fallback `subtotal`)
  - Main discount contribution:
    - Positive input (e.g. `10`) → `(billDiscountBase * 10) / 100`
    - Negative input (e.g. `-5`) → `+5` savings
    - `+` prefixed input (e.g. `+7`) → `-7` savings because it is an added round-off/charge
  - Coupon discount (`couponValue`) and redeemed points (`redeemedPoints`) are also added to receipt savings
  - `totalSavings = max(0, round2(lineSavings + mainDiscountContribution + couponValue + redeemedPoints))`
  - Receipt `DISC/ROUND OFF(+/-)` displays the raw meaning separately: `+7` for added amount, `-7` for subtracted round-off, or calculated amount for percentage discount

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
4. `POST /api/bill/findBillCounter` - get invoice number
5. `buildEntriesData()` - map items to Prisma entry shape
6. `buildBillPayload()` - pure function, assembles full bill payload
7. `buildPrintData()` - pure function, assembles thermal receipt data
8. `POST /api/bill/create` - raw SQL transaction; creates earned generated coupons and returns `generatedCoupons`
9. Attach returned `generatedCoupons` to `printData`, then `fireFcmNotification()` after create succeeds
10. Trigger print/send/download based on `selectedAction`
11. `reset()`

**After-save action** (persisted to `localStorage` key `markit_selected_action`):
- `print` → `usePrint` composable (thermal receipt)
- `send` -> `POST /api/whatsapp/send-payment-template` (WhatsApp bill) plus `POST /api/whatsapp/send-coupon-message` when earned coupons exist
- `download` -> `generateThermalReceiptPDF` (dynamic import from `~/utils/thermal-receipt.client`; appends earned coupon voucher barcodes)
- `null` → no action after save
- After a successful create, the new `billId` is stored in localStorage under `markit_recent_bill_id`; the billing-page dropdown action `Recent Bill` and `F2` both open `/erp/edit/<recentBillId>`.

**FCM push notification:** Fired non-blocking after save → `/api/notifyfcm` notifies other devices of new bill.

**ProductSearch modal (`components/Billing/ProductSearch.vue`):**
- Category → subcategory → product drill-down (all optional — category alone loads variants)
- Variant query filters by `productId` → `subcategoryId` → `categoryId` in priority order
- Loading spinner (`variantsLoading`) shown while variants fetch
- Multi-select items via checkbox; `done` emits selected barcodes array

**Sales return modal (`components/Billing/SalesReturn.vue`):**
- No ZenStack hooks — uses `$fetch` for all data (categories via `GET /api/bill/findManyCategory`, entry lookup via `GET /api/bill/findFirstEntry`)
- Invoice number is optional
- If invoice is provided: barcode lookup via `GET /api/bill/findFirstEntry` (raw SQL, joins entries → bills + variants)
- If invoice is empty: barcode lookup falls back to product catalog lookup (`GET /api/bill/findFirstItem`)

---

#### `POST /api/bill/create` — Bill Creation (PL/pgSQL)
Bill creation uses the shared `pg` pool and lazily installs/calls `create_bill_plpgsql(jsonb)` — NOT Prisma. After first-process setup (`ensureAccountLedgerSchema`, `bills.discount_type` DDL, `CREATE OR REPLACE FUNCTION`), the steady-state save path is one SQL call: `SELECT create_bill_plpgsql($1::jsonb)`.

**Function flow:**
1. INSERT bill into `bills`; `trigger_generate_invoice_number` assigns `invoice_number`
2. INSERT all entries into `entries` from `payload.entries.create` JSONB
3. Update staff credit `user_ledger_entries` and recalculate balances when `credit_user_id` is present
4. Insert/rebuild `account_ledger_entries` for Cash/UPI/Card/Credit/Split payments and recalculate running balances
5. Apply `company_clients.points += billPoints - redeemedPoints` when a valid client exists
6. Update `items.qty` + `items.sold_qty` through set-based JSONB stock deltas for sold and returned items
7. Apply coupon usage, decrement generated-voucher usage when applicable, increment `coupons.times_used`, and create earned GENERATE vouchers in `coupon_clients`
8. Return `{ success, billId, invoiceNumber, generatedCoupons }`

**Retry:** 3 attempts with exponential backoff for transient PG errors
**Error logging:** Failed requests → `save_error_requests`

**Invoice number:** assigned by the DB trigger `trigger_generate_invoice_number` inside the bill insert. `POST /api/bill/findBillCounter` is deprecated/unused for billing saves.

---

#### `pages/erp/sales.vue` — Sales List

- Fetches bills via `POST /api/billSale/findManyBills` — **raw SQL** with `pg` pool
- Search logic:
  - Non-numeric → search by `client.name ILIKE`
  - Numeric < 3 chars → search by `client.phone ILIKE`
  - Numeric ≥ 3 chars and fits integer range (≤ 2,147,483,647) → match `invoice_number` exactly OR `phone ILIKE`
  - Numeric ≥ 3 chars and exceeds integer range (e.g. full phone numbers) → search by `phone ILIKE` only (skips invoice match to avoid PostgreSQL integer overflow)
  - **Date range filter is SKIPPED when search is active** (intentional design — the WHERE clause excludes date filter if `normalizedSearch` is truthy)
- Filters: payment status (PAID/PENDING), payment method (`Cash`, `UPI`, `Card`, `Credit`, `Split`), min/max `grandTotal`, date range
- Filter UX: date picker is always visible in header; remaining filters open in modal and apply on explicit `Apply Filter` click
- Sort by: invoiceNumber, createdAt, grandTotal, paymentStatus
- Export: `Download` button generates `.xlsx` (exceljs + file-saver) for the currently filtered dataset (fetches all pages with active filters in batches of 500)
- **Table state persistence:** all filter/sort/pagination/column-visibility state saved to `localStorage` key `erp_sales_table_state_v1` and restored on mount
- Table columns omit `subtotal`; the sales grid now shows a `Method` column with plain text, and clicking `Split` opens the shared split modal instead of a hover popover
- Cleanup sessions (`session.cleanup === true`) render a cleanup-only `Cleaned values` toggle. Off is the original cleanup view: bill `subtotal`, `discount`, and `grandTotal` use saved original columns where available; entry `rate`, `discount`, and `value` use saved original entry columns; `precedence=true` rows are included. On switches the same sales list/export API to current cleaned values and filters out `precedence=true` rows. The API returns explicit original fields only for the original cleanup view. Non-cleanup sessions continue to read current visible values and never render the toggle.
- Summary cards use the totals response from `/api/billSale/findManyBills`; `Split` bills are broken down by `split_payments` and their amounts are folded into the existing Cash/Card/UPI/Credit totals so the top cards reflect mixed payments.
- Bills with `isMarkit = true` → show only "Open" action (no edit/print — marketplace orders)
- Bill actions: Print (via `usePrint`), Change method (opens payment-method modal; choosing `Split` opens the shared split modal before save, then prompts for Print/Send/Download), Details (expand entries inline), Edit (→ `edit/[salesId].vue`), Delete (soft delete via `POST /api/billEdit/deleteBill`)
- **Soft-deleted bill highlighting:** `styledSales` computed maps rows to add `class: 'bg-red-50 text-red-600'` when `row.precedence === true`. `:rows` is bound to `styledSales`.

---

#### `pages/erp/edit/[salesId].vue` — Bill Edit

- Fetches bill via `GET /api/billEdit/findUniqueBill` — **raw SQL** (returns bill + entries + client + coupon usages)
- Same UI as billing.vue (barcode rows, camera scanning, keyboard nav, tax calc, split payments, skip points toggle, `+n` discount add); the table shows `unit` next to `qty` only when multiple billing units are enabled in settings
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

#### `pages/erp/expenses.vue` — Expenses

**Fully raw-pg endpoints + TanStack Query on the client — no ZenStack hooks.** All reads/writes go through `/api/accounts/expense*` + `/api/accounts/company-users` (see API table above), but the list is cached and the writes are optimistic via `composables/useExpenses.ts` (`@tanstack/vue-query`).

- `composables/useExpenses.ts`:
  - `useExpenseList(params)` — `useQuery` keyed `['expenses','list', <params>]`, `placeholderData: prev` (keeps the page visible while refetching), `enabled` on `companyId`. Returns `rows`/`total`/`isLoading`/`refresh`.
  - `useExpenseMutations()` — `create`/`update`/`remove`/`status` `useMutation`s with **optimistic cache writes**: `onMutate` snapshots all `['expenses','list']` variants and patches them (create prepends a temp row + `total+1`; update merges fields by id; delete filters by id; status sets the field), `onError` restores the snapshot (**row removed on DB failure**), `onSettled` fire-and-forget `invalidateQueries(['expenses'])` to reconcile. Every mutation is gated by an `navigator.onLine` check that toasts "No internet connection" and aborts when **offline**. Exposes `creating`/`updating` (`isPending`) for spinners and `createExpense`/`updateExpense`/`deleteExpense`/`updateStatus` wrappers returning a success boolean.
- Parent `expenses.vue` calls the mutation wrappers (`createExpense` → resets the quick-add on success; `updateExpense` → closes the modal on success; `deleteExpense`). No manual `listRef.refresh()` — the cache invalidation drives the list.
- Sub-components:
  - `Expense/ExpenseQuickAdd.vue` — **inline quick-add bar** (replaced the old add modal). Rendered **below the KPI summary cards** via `ExpenseList`'s `#quick-add` slot (parent passes the component into the slot, so `ref`/`@create` stay in `expenses.vue` scope). Horizontal field row (date/category/user/amount/payment/status/note) + an Add button. Add is optimistic (the row appears instantly via the cache), and the parent clears the form (`quickAddRef.reset()`) **only after the create succeeds** (`await createExpense`); on failure (validation/DB error, or offline) the optimistic row is rolled back and the inputs are kept so the user can fix and retry. The Add button shows a **`loading` spinner** (`creating` = `create.isPending`) while the create is in flight (`submit` no-ops if already loading), since the inputs stay populated until the server confirms. Error toasts show the clean server `statusMessage` via `errMessage(err)` (data.statusMessage → data.message → message), not ofetch's verbose `[POST] "/url": 400 …` string. Emits `create` with the form payload. Stores status as title-case (`Paid`/`Pending`/…) so table badges/filters match. The **Category select mirrors `pages/erp/billing.vue`** — `multiple` + `searchable` + `creatable`, `v-model` an array — so clicking the selected option toggles it off (deselect) natively. Since an expense has one category, `handleCategoryChange` keeps only the most-recently-picked option (`form.category` is a 1-element array; `submit` reads `form.category[0]`). User, Payment and Status use the same single-item `multiple` pattern (`form.user[0]`, `form.paymentMode[0]`, `form.status[0]` via `coerceSingleSelection`) so any select's option can be toggled off while still holding one active value. **All four are `searchable`** — a non-searchable `multiple` Listbox does **not** close on programmatic focus-out (it stays stuck open), whereas the searchable Combobox does; Category is additionally `creatable`. **On pick, every select closes its menu and advances focus to the next field** via `advanceFromSelect(wrapper)` — it focuses the next field's element (which also closes the open Combobox through focus-out), counting only each select's trigger button as a field so an open panel's search input isn't treated as "next". (Earlier attempts — one-way binding for click-to-deselect, then `closeSelect`, then per-select reset `#hint` icons — were all dropped in favor of this billing-style approach.)
    - **Layout:** `grid grid-cols-2 sm:grid-cols-4` → 2 rows × 4 columns (Date/Category/User/Amount; Payment/Status/Note/Add).
    - **Keyboard** (`@keydown.capture` handler so it pre-empts HeadlessUI): ← / → / ↑ / ↓ traverse fields via a geometric nearest-neighbor search (`findFocusableNeighbor`, adapted from `pages/products/add.vue`), so ↑ / ↓ move between the two grid rows and ← / → move within a row (caret-edge aware for text inputs; `number`/`date` always traverse, ← / → fall back to doc order at row edges). On a **closed** select, ↑ / ↓ navigate rows — the capture handler `stopPropagation`s to block the native arrow-to-open; menus open only via **Enter / Space / click**. Only an **open** menu keeps native ↑ / ↓ for option highlighting. Each `USelectMenu` is wrapped in `<div ref="...">`; open menu + ← / → closes it via `wrapper.querySelector('button')` (focus + click) and keeps focus on the trigger; after an option is picked `advanceFromSelect` moves focus to the next field (closing the menu via focus-out) — mirrors `pages/erp/billing.vue` (`movecatgeory`). On mount focus goes to the Category select; Enter in inputs advances to the next field (via `onInputEnter`, bound to **`@keydown.enter.prevent`** — not `keyup`, so the Enter that *picks* a select option doesn't also fire the next input's handler when focus lands on it and double-advance; `.prevent` suppresses the follow-up `keypress` so the Enter that lands focus on the Add button doesn't also activate it) through the Add button; the Add button then saves only on its **own** fresh Enter (native `@click`)/click; `reset()` clears all fields and returns focus to Category after a successful add.
  - `Expense/ExpenseForm.vue` — **edit-only modal** now. Accepts `:loading` (Save button spinner) + `submitLabel` ("Update"). Opened only from a row's Edit action.
  - `Expense/ExpenseList.vue` — owns all filter state, table, and summary cards; the list comes from `useExpenseList(expenseQueryParams)` (cached query) and "Mark as" uses `useExpenseMutations().updateStatus`. Default sort is **`expenseNumber` desc** (numeric — newest/highest EXP number first; legacy `id`/uuid and older expense-number ascending localStorage state are ignored/migrated on restore). The old header "Add Expense" button and `open` emit were removed.
- `composables/useExpenseFormOptions.ts` — shared category (load/create/delete with 409 FK handling) + company-user loading, used by both `ExpenseQuickAdd` and `ExpenseForm`.
- Expense fields: `expenseDate`, `expensecategoryId`, `userId` (CompanyUser who spent, maps to `from_id`), `totalAmount`, `paymentMode`, `status`, `note`
- `CompanyUser` joined via `company_id` + `from_id` = `user_id`
- Notification code (for FCM) is **commented out** — not active
- **Expense list features:** search (note/category/user name via server JOINs), filter by user, filter by amount range (min/max), filter modal with draft pattern (apply on confirm); table state persistence via localStorage; page resets to 1 on filter change
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
- Create account inline: name, phone, address (street/locality/city/state/pincode)
- `pending` amount = sum of bills where `paymentStatus = PENDING`; for Split bills, only the Credit portion is counted
- **Payment method on mark PAID:** when changing a bill status to PAID, a modal prompts for payment method (Cash/UPI/Card), which is saved on the bill
- **Excel export:** `Download` button generates `.xlsx` (exceljs + file-saver) with account name, phone, pending amount, bills count
- **Table state persistence:** filter/sort/pagination/column state saved to `localStorage` key `erp_accounts_table_state_v1` and restored on mount
- **WhatsApp reminder:** `Send Reminder` action calls `POST /api/whatsapp/send-pending-template` with account phone, pending amount, receipt URL, and UPI payment deep link

---

#### `POST /api/discount/apply` — Bulk Discount Tool

Bulk-applies a discount percentage to variants using raw SQL (`pg` pool).

- Updates `variants.discount` and `variants.d_price = sprice - (sprice * discountPercentage / 100)`
- Filters: categoryId, subcategoryId, status, date range, brand, minRating, maxSprice, minMargin
- Returns `{ success, updatedCount }`

---

### Accounts (`/accounts`)

> **Moved to dedicated file:** See `ARCH-pages-accounts.md` for full accounts/finance documentation (cash ledger, bank, investment, transfers, transactions).

---
## Online sales pages

### `pages/erp/online/index.vue`

Online bill/sales list. Fetches report data through `/api/report/online` and bill rows through `/api/billSale/findManyBills`; exposes filtering, downloadable output, notes, print actions and expandable entry detail. Unlike POS bill creation, this page is for finding and reviewing existing online sales.

### `pages/erp/online/[salesId].vue`

Online sale detail and bill-edit screen for the selected sales ID. Loads bill and entry data, allows supported bill edits through `/api/billEdit/*` and `/api/bill/update`, and includes notification/WhatsApp-related actions. The page checks `bill.isMarkit` to disable certain editing actions for Markit-origin bills. Review the route's validation and server APIs before assuming all fields are editable.
