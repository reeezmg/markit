## Coupon Pages

### `pages/coupon/index.vue`
- Requires auth (inherits from layout)
- **Layout:** Two-pane split — left panel: `CouponList`, right panel: `CouponDetail` (slide-in with transition animation)
- `selectedCoupon` tracks which coupon is shown in the detail panel; `editingCoupon` tracks form editing state
- `CouponList` emits `@select` when a row is clicked → populates detail panel
- `CouponForm` shown in a `UModal` for create/edit (separate from the detail panel)
- **ZenStack hooks:** `useCreateCoupon`, `useUpdateCoupon`, `useDeleteCoupon` — all with `optimisticUpdate: true`
- `addCoupon`: `createCoupon.mutate({ data: { ...fields, company: { connect: { id: companyId } } } })`
- `editCoupon`: `updateCoupon.mutate({ where: { id }, data: { ...fields } })` — does NOT update `targetType` on edit (missing from update payload)
- `deleteCouponRow`: `deleteCoupon.mutate({ where: { id } })` — also clears `selectedCoupon` if deleted coupon was selected
- **New component:** `components/Coupon/CouponDetail.vue` — detail view for the selected coupon (right panel)

---

### `components/Coupon/CouponList.vue`
**Data fetching:**
- `useFindManyCoupon(queryArgs)` with reactive filters: `type`, `audienceType`, `isActive`
- Filters use ZenStack OR pattern: `OR: selectedType.map(t => ({ type: t }))`
- `useCountCoupon` imported but **not used** (pagination uses `coupons.value?.length` instead — means total is per-page count, not full DB count; pagination breaks for large datasets)
- `useUpdateManyCoupon` for bulk activate/deactivate (appears when `selectedRows.length > 1`)

**Columns:** code, type, discountValue, audienceType, startDate, endDate, timesUsed (`timesUsed / usageLimit || '∞'`), isActive, actions

**Coupon type badges:** PERCENTAGE=blue, FLAT=green, GIFT=orange

**`isCurrentlyActive(row)`:** computed as `row.isActive && now >= startDate && now <= endDate` — a coupon may be `isActive=true` but still show "Inactive" if outside its date range

**Filters:**
- Type: `['PERCENTAGE', 'FLAT', 'GIFT']`
- Audience: `['ALL', 'SPECIFIC', 'GENERATE', 'PRIVATE']`
- Status: `[true, false]`
- Audience + Status filters hidden when a coupon is selected in detail panel (compact mode)

**Sort:** client-side (`sort-mode="manual"` but no server-side re-query on sort change — sorts only current page)

**Pagination:** client-side only — `skip`/`take` in query args, but `pageTotal = coupons.value?.length` is the length of the returned page, not total records. Pagination UI is broken for multi-page datasets.

**Bulk actions:** "Mark as" dropdown (Activate / Deactivate) appears when `selectedRows.length > 1`; calls `multiUpdate(status, ids)` → `useUpdateManyCoupon`

**Column visibility:** `USelectMenu` to toggle visible columns

**Bugs:**
- `watchEffect(() => { console.log(coupons.value); console.log(pageTotal.value) })` — logs all coupon data + page total on every data change
- `formatAudienceType` has `console.log(coupon)` inside it — fires for every row render
- ~~"Details" action menu item opens the delete modal instead of a details view~~ — **FIXED:** Details action removed; detail view now handled by row click → `CouponDetail` panel
- `useCountCoupon` imported but never called — dead import
- `pageCount` now persisted to `localStorage` key `couponList_pageCount`

---

### `components/Coupon/CouponForm.vue`
**Mode detection:** `props.coupon` present = edit mode; absent = create mode. Coupon code field is disabled (`disabled="!!coupon?.code"`) in edit mode — code cannot be changed after creation.

**Coupon types:**
- `PERCENTAGE` — `discountValue` = 0–100%; optional `maxDiscountAmount` cap shown
- `FLAT` — `discountValue` = flat currency amount; `maxDiscountAmount` hidden + cleared on type switch
- `GIFT` — `discountValue` not required; discount section replaced by a required `giftBarcode` field

**Audience types:**
- `ALL` — applies to all customers
- `GENERATE` — auto-generated; shows "Generation Rules" section (`isBillCombine`, `minBillAmount`)
- `SPECIFIC` — specific client list (no additional UI for specifying which clients in this form)
- `PRIVATE` — hidden code-only coupon; excluded from automatic customer/storefront and POS coupon lists, but accepted when its exact code is entered in an ecommerce storefront

**Target types:** `ALL`, `CATEGORY`, `PRODUCT` — stored but no category/product selector shown in form

**Default dates:** startDate = today, endDate = today + 30 days

**Client-side validation (in `saveForm`):**
1. Code required
2. Code unique check — `useFindManyCoupon` fetches all company coupons (just `id`+`code`) for dedup; same coupon in edit mode is excluded
3. discountValue > 0 (unless GIFT type)
4. GIFT requires `giftBarcode`
5. PERCENTAGE discountValue ≤ 100
6. endDate > startDate

**Emits:** `save(couponData)` with all values converted (string → float/int, option objects → `.value` strings)

**Fields summary:**

| Field | Type | Notes |
|---|---|---|
| `code` | string | Unique per company; disabled on edit |
| `type` | enum | PERCENTAGE / FLAT / GIFT |
| `discountValue` | float | % or flat amount |
| `giftBarcode` | string? | Required when type is GIFT; barcode of the product to auto-add in billing/edit |
| `maxDiscountAmount` | float? | Cap for PERCENTAGE type only |
| `minBillAmount` | float? | Min bill for GENERATE audience |
| `minOrderValue` | float? | Min order value |
| `targetType` | enum | ALL / CATEGORY / PRODUCT |
| `audienceType` | enum | ALL / GENERATE / SPECIFIC / PRIVATE |
| `startDate` | Date | |
| `endDate` | Date | Default: +30 days |
| `usageLimit` | int? | null = unlimited |
| `perClientLimit` | int? | null = unlimited |
| `isActive` | bool | Default: true |
| `isBillCombine` | bool | Used for GENERATE audience |

---

### Coupon Usage at Bill Creation
Coupons are applied during billing (`billing.vue`) and saved as part of bill creation in `POST /api/bill/create`:
- `coupon_usage` record inserted: `{ couponId, billId, companyId, discount, clientId }`
- `coupons.times_used` incremented by 1
- Point redemption and coupon application are mutually exclusive in the UI (one OR the other per bill)
- In bill edit, the `Remove Coupon` flow can clear an already-applied coupon before saving again; `POST /api/bill/update` reverses the previous usage row and restores one `coupon_clients.usage_limit` slot when the removed coupon was generated (`audienceType = GENERATE`). Generated voucher rows are created as single-use rows (`usageLimit = 1`)

**Tables:** `coupons`, `coupon_usages`, (referenced: `coupon_clients` for SPECIFIC audience — assignment not visible in storetools UI)

---
