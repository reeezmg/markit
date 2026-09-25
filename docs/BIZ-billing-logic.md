# Billing Business Logic

Business rules and calculations for the POS billing system (`pages/erp/billing.vue`).

---

## Item Pricing

### Rate
- `rate` = selling price (`variant.sprice`)
- `discount` on a row = `dprice - sprice` (always ≤ 0 or 0 if no discount)

### Per-Row Discount
- **Negative value** (e.g. `-50`) → flat rupee deduction: `discountedRate = rate - 50`
- **Positive value** (e.g. `10`) → percentage: `discountedRate = rate - (rate * 10 / 100)`
- **Zero / null** → no discount

### Per-Row Tax
Tax is resolved from the category after each item change:
- `taxType = 'FIXED'` → always use `category.fixedTax`
- `taxType = 'VARIABLE'` → compare `item.value / item.qty` against `category.thresholdAmount`:
  - ≤ threshold → `taxBelowThreshold`
  - > threshold → `taxAboveThreshold`

### Tax Inclusion
- `isTaxIncluded = true` (session flag) → tax is already embedded in `rate`; row value = `discountedRate × qty`
- `isTaxIncluded = false` → tax added on top: `rowValue = discountedRate × qty × (1 + tax/100)`

### Row Value Formula
```
discountedRate = rate - discount_amount
baseValue      = discountedRate × qty
rowValue       = isTaxIncluded ? baseValue : baseValue + (baseValue × tax / 100)
item.value     = parseFloat(rowValue.toFixed(2))
```

---

## Bill Totals

### Subtotal
Sum of `qty × rate` for all rows (before discount/tax). Return rows subtract from subtotal.

### Grand Total
```
baseTotal     = sum of item.value (return rows subtract)
afterDiscount = discount < 0  → baseTotal - |discount|      (flat deduction)
              = discount >= 0 → baseTotal - (baseTotal × discount / 100)
grandTotal    = afterDiscount - redeemedAmt
```
`redeemedAmt` = coupon value + redeemed points (combined).

### Grand Total Discount
- **Negative** → flat deduction from total (e.g. `-100` → subtract ₹100)
- **Positive** → percentage off total (e.g. `10` → 10% off)

---

## Sales Returns

- Return rows have `item.return = true`
- Return rows **subtract** from subtotal and grandTotal
- On save: `items.qty += qty` and `items.sold_qty -= qty` (stock reversal in DB)

---

## Loyalty Points

### Session Setting
- `session.pointsValue` — how many rupees equal 1 point (e.g. `pointsValue = 10` → spend ₹10 = earn 1 point)
- If `pointsValue = 0` or unset, no points are earned (`billPoints = 0`)

### Earning — Formula
```
billPoints = pointsValue > 0 ? round(grandTotal / pointsValue) : 0
```
- Points are only credited if a **client is linked** to the bill (`clientId` is set)
- If no client → `billPoints = 0` in the payload, no DB update
- Written inside the bill creation transaction:
  ```sql
  UPDATE company_clients SET points = points + $billPoints
  WHERE company_id = $companyId AND client_id = $clientId
  ```
- `billPoints` is stored on the `bills` record for reference

### Redeeming — Flow
1. User enters client phone → client loaded, `points` ref shows current balance
2. User clicks **"Redeem Points"** → `POST /api/bill/redeemClientPoints { mode: 'redeem' }`
3. Redeemable amount = `min(client.points, grandTotal)` — 1 point = ₹1
4. SQL guard (atomic): update only executes if `company_clients.points >= redeemablePoints`
   ```sql
   UPDATE company_clients SET points = points - $points
   WHERE company_id = $1 AND client_id = $2 AND points >= $3
   RETURNING points
   ```
5. If `rowCount = 0` → throws "Insufficient points or client not found"
6. On success: `redeemedPoints = redeemablePoints`, `redeemedAmt += redeemablePoints`
7. Client's displayed `points` balance updated to server response value
8. Button toggles to **"Cancel Redeem"** (`isRedeemPoint = true`)

### Cancelling Redemption
- `POST /api/bill/redeemClientPoints { mode: 'revert' }`
- SQL adds points back:
  ```sql
  UPDATE company_clients SET points = points + $points
  WHERE company_id = $1 AND client_id = $2 RETURNING points
  ```
- `redeemedAmt -= redeemedPoints` (coupon portion of `redeemedAmt` is **preserved**)
- `redeemedPoints = 0`, `isRedeemPoint = false`

### Points on Bill Save
- `redeemedPoints` value (pre-save deduction already applied) stored on `bills.redeemed_points`
- `billPoints` (newly earned) applied to `company_clients.points` inside the save transaction
- Net effect: client ends the transaction with `(balance - redeemedPoints + billPoints)` points

---

## Coupons

### Types
| Type | Calculation |
|---|---|
| `PERCENTAGE` | `orderValue × discountValue / 100`, capped at `maxDiscountAmount` if set |
| `FLAT` | fixed `discountValue` subtracted |
| `GIFT` | no monetary discount (handled separately) |

Discount cannot exceed `orderValue`.

### Eligibility Rules (all must pass)
1. `coupon.isActive = true`
2. Current date between `startDate` and `endDate`
3. `orderValue >= minOrderValue` (if set)
4. `timesUsed < usageLimit` (if set)
5. `clientUsage < perClientLimit` (if set)
6. `audienceType = 'SPECIFIC'` → client must be in `coupon.clients`
7. `audienceType = 'GENERATE'` → client usage < number of times client appears in `coupon.clients`

### Applying a Coupon
- Old coupon value subtracted from `redeemedAmt`, `couponValue` reset to 0
- New discount calculated and added: `redeemedAmt += couponValue`
- Recalculated automatically when items or grand total change (`watch([items, clientId])`)

### Deselecting a Coupon
- `redeemedAmt -= couponValue`
- `couponValue = 0`

---

## Payment

### Methods
| Method | `paymentStatus` |
|---|---|
| Cash | PAID |
| UPI | PAID |
| Card | PAID |
| Credit | PENDING |
| Split (no credit) | PAID |
| Split (with Credit leg) | PENDING |

### Split Payment
- `tempSplits` map: `{ Cash: { method, amount }, UPI: { ... }, ... }`
- `BillingSplitModal` validates: sum of entered amounts must equal `grandTotal` exactly before confirming
- Confirmed as `splitPayments[]` array stored on bill

### B2B Credit Accounts
- Selecting an account auto-sets `paymentMethod = 'Credit'`
- Account linked via `account: { connect: { id: selected } }` in bill payload
- `paymentStatus = 'PENDING'`

---

## Invoice Number

- Reserved via `POST /api/bill/findBillCounter` **before** the save transaction
- Uses atomic SQL: `UPDATE companies SET bill_counter = bill_counter + 1 WHERE id = $1 RETURNING bill_counter`
  - PostgreSQL row lock guarantees each concurrent biller gets a unique number
- Session `billCounter` updated on this call so the UI stays current
- `printData` is built with this number immediately — receipt is ready before save completes
- **Gap risk**: if `findBillCounter` succeeds but `create.post.ts` fails (all 3 retries exhausted), the counter was already incremented → gap in invoice sequence (e.g. …42, 44…). This is the accepted trade-off for instant-print UX.

---

## Bill Save — Validation Rules

Two validation layers run **before `findBillCounter` is called** (so the counter is never burned on a doomed bill).

### `validateBillState()` — pre-flight (whole-bill checks)
| Check | Error message |
|---|---|
| `session.companyId` missing | "Session expired. Please refresh and try again." |
| Barcode fetch still in flight | "Please wait for all items to finish loading." |
| No valid rows at all | "Add at least one item before saving." |
| `grandTotal` is `NaN` | "Grand total is invalid. Check discount values." |
| `grandTotal < 0` | "Grand total is negative. Reduce the discount amount." |
| `paymentMethod` not set | "Select a payment method before saving." |
| `paymentMethod = 'Split'` but `splitPayments` empty | "Confirm the split payment breakdown before saving." |
| `date` is invalid/empty | "Bill date is invalid." |
| Device offline | "No internet connection" |

### `validateBillEntries()` — per-row checks
| Check | Error message |
|---|---|
| No valid rows after filtering | "No valid items to bill." |
| Row missing `category[0].id` | "Row N: category is required" |
| `qty` is `NaN` | "Row N: qty is not a valid number" |
| `qty ≤ 0` (non-return row) | "Row N: qty must be greater than 0" |
| `rate` is `NaN` | "Row N: rate is not a valid number" |
| `rate < 0` | "Row N: rate cannot be negative" |

All errors surface as a red toast — no separate error UI needed.

---

## Draft System

- Key: `localStorage['bills']` — JSON array of bill objects
- Multiple drafts open simultaneously; each identified by sequential `billNo` (1, 2, 3…)
- Auto-saved on every reactive change via `watch(currentBill, ...)`
- `createNewBill()` appends and re-sequences all `billNo` values
- `deleteBill()` removes and re-sequences; loads first remaining draft
- `resetDraft()` clears all fields to defaults without touching the draft list

---

## User Tracking (optional)

When `session.isUserTrackIncluded = true`:
- A top-level "Parent User Code" field sets `parentUserCode/Id/Name` on the bill
- Each row has a per-row user field (`userCode`, `userId`, `user`) for commission tracking
- Setting parent user propagates to all existing rows and pre-fills new rows
- Individual row user can be overridden with `updateUserDetails(index, code)`
- Stored as `companyUser: { connect: { companyId_userId: { companyId, userId } } }` on each entry

---

## Cost Visibility

- `cost` column (`variant.pprice`) only visible when `session.role = 'admin'` AND `session.isCostIncluded = true`
- Always included in entry data sent to server for margin reporting

---

## Client Lookup Flow

1. User types phone (10 digits) → presses Enter
2. `GET /api/bill/findUniqueClient?phone=+91{phone}`
3. **Found** → `clientName`, `clientId`, `points` (from `companies[0].points`) populated; focus moves to discount input
4. **Not found** → `BillingAddClient` modal opens
5. After adding → `handleClientAdded(id, name)` sets `clientId`, `clientName`, `points = 0` (new client has no points yet)
6. Client is required for: coupon eligibility, points earning/redemption

---

## Barcode / Item Entry

### Barcode Format
- Expected format: `/^\d+[A-Z]\d{6}$/` (e.g. `12A000001`)
- Entered in barcode input → triggers `fetchItemData` which calls `GET /api/bill/findItem?barcode=...`

### Stale Response Guard
- Each fetch is assigned a unique request ID stored in `currentRequestIds`
- On response, ID is checked — if no longer current (user typed new barcode), response is discarded
- Prevents fast-typing race conditions where an old response overwrites a newer one

### Row Deletion Confirmation
- Clicking delete on a row sets `deletingRowIdentity` (row snapshot) and opens `isDeleteModalOpen`
- Confirmed deletion calls `removeRow`, which focuses the previous barcode input

### Camera Scanning
- Web: Quagga2 (`startBarcodeScanner` / `stopBarcodeScanner`) — `showCamera` ref controls visibility
- Native (Capacitor): `CapacitorBarcodeScanner.scanBarcode()`
- Both trigger the same `onBarcodeScanned(barcode)` callback → `fetchItemData` + `addNewRow`

---

## Bill Print / Send / Download

After a successful save, the action taken depends on `selectedAction`:
| `selectedAction` | Behaviour |
|---|---|
| `'print'` | Opens thermal print modal (`printBill`) |
| `'send'` | Sends bill via WhatsApp/SMS (calls `send()`) |
| `'download'` | Generates PDF receipt (dynamically imports `generateThermalReceiptPDF`) |
| (default) | No post-save action, just resets draft |

`printData` is built from final items + session + bill refs before save completes, so it is available even if the save API call is slow.

---

## FCM Notification on Save

After saving, a fire-and-forget push notification is sent to other devices on the same company:
```
POST /api/notifyfcm {
  companyId,
  excludeDeviceId: localStorage['device_id'],   // don't notify the saving device
  title: "New Bill Created in {companyName}",
  body:  "Invoice #{billInv} for ₹{grandTotal} has been created.",
  data:  { url: '/erp/sales' }
}
```
Errors are swallowed — notification failure never blocks bill creation.

---

## Table Column Visibility

The items table `<thead>` is driven by a `columns` computed:
- Always present: SN, Barcode, Category, Name, Rate, Qty, Discount, Tax, Value
- **User column** — added when `session.isUserTrackIncluded = true`
- **Cost column** — added when `session.role = 'admin'` AND `session.isCostIncluded = true`
