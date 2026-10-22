## Coupon Pages

### `pages/coupon/index.vue`
- Head-office lists use a local company filter, scoped coupon hooks and a company column. Create forms own their company selector and emit `companyId`; edits lock the existing owner. Detail client options come from the coupon's company. Switching the table filter clears selected rows/detail and resets pagination.
- Requires auth (inherits from layout)
- **Layout:** Two-pane split — left panel: `CouponList`, right panel: `CouponDetail` (slide-in with transition animation)
- `selectedCoupon` tracks which coupon is shown in the detail panel; `editingCoupon` tracks form editing state
- `CouponList` emits `@select` when a row is clicked → populates detail panel
- `CouponForm` shown in a `UModal` for create/edit (separate from the detail panel)
- **ZenStack hooks:** `useCreateCoupon`, `useUpdateCoupon`, `useDeleteCoupon` — all with `optimisticUpdate: true`
- `addCoupon`: awaits `createCoupon.mutateAsync` with the form's selected company connection.
- `editCoupon`: awaits `updateCoupon.mutateAsync`, including `targetType`, and refreshes the selected detail snapshot after success.
- `deleteCouponRow`: awaits `deleteCoupon.mutateAsync` and clears the selected detail only after successful deletion.
- `saveCoupon` retains the form and entered values after a rejected mutation, closes only after success, and prevents duplicate requests while saving. `CouponForm` shows the saving state and disables submit/cancel buttons during the request. Error toasts reflect asynchronous failures.
- **New component:** `components/Coupon/CouponDetail.vue` — detail view for the selected coupon (right panel)
- Detail usage and assignment queries have explicit reactive `enabled` conditions. Client-picker queries run only while the modal is open and retain the selected coupon's company. Passing undefined arguments is not a query-disable mechanism in the installed ZenStack runtime. Client add/remove actions await `mutateAsync` before showing success and report rejected mutations as errors.

---

### `components/Coupon/CouponList.vue`
**Data fetching:**
- Uses the company auth captured during setup. Reactive queries must not call `useNuxtApp()` when Vue Query reevaluates them during SSR prefetch or later filter/pagination changes; that previously caused `/coupon` to return a Nuxt-context HTTP 500. `tests/coupon-context.test.ts` evaluates and invalidates the actual query after setup context ends. `tests/coupon-dev-readonly.ts` checks authenticated head-office and branch SSR against a running dev server using GET requests only.
- `useFindManyCoupon(queryArgs)` with reactive filters: `type`, `audienceType`, `isActive`
- Type and audience use independent `in` filters. A single selected status adds `isActive`; selecting both statuses leaves it unrestricted. Applying one filter does not overwrite the others.
- `useCountCoupon` uses the same scoped `where` filter as the list and supplies the full matching record count.
- `useUpdateManyCoupon` for bulk activate/deactivate (appears when `selectedRows.length > 1`)

**Columns:** code, type, discountValue, audienceType, startDate, endDate, timesUsed (`timesUsed / usageLimit || '∞'`), isActive, actions

**Coupon type badges:** PERCENTAGE=blue, FLAT=green, GIFT=orange

**`isCurrentlyActive(row)`:** computed as `row.isActive && now >= startDate && now <= endDate` — a coupon may be `isActive=true` but still show "Inactive" if outside its date range

**Filters:**
- Type: `['PERCENTAGE', 'FLAT', 'GIFT']`
- Audience: `['ALL', 'SPECIFIC', 'GENERATE', 'PRIVATE']`
- Status: `[true, false]`
- Audience + Status filters hidden when a coupon is selected in detail panel (compact mode)

**Sort:** reactive `queryArgs.orderBy` uses the selected column and direction for server-side sorting.

**Pagination:** server-side `skip`/`take`, with `pageTotal` from the matching scoped count query. Changing the company filter resets the page and selected rows.

The server and initial client render use 10 rows. The saved supported row count is read from localStorage only after mounting, preventing hydration mismatches on reload/company switch; unavailable storage does not break the list.

**Bulk actions:** "Mark as" dropdown (Activate / Deactivate) appears when `selectedRows.length > 1`. It maps selected rows to explicit coupon IDs before calling `multiUpdate(status, ids)`; an empty selection does not call the mutation. Organization authorization still caps the update to accessible companies.

**Column visibility:** `USelectMenu` to toggle visible columns

**Bugs:**
- `formatAudienceType` has `console.log(coupon)` inside it — fires for every row render
- ~~"Details" action menu item opens the delete modal instead of a details view~~ — **FIXED:** Details action removed; detail view now handled by row click → `CouponDetail` panel
- `useCountCoupon` supplies the total matching rows for server pagination.
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
- Generation selects each existing assignment's `usageLimit` as well as `clientId`, so its per-client allocation calculation uses the stored allowance rather than treating every assignment as one.

**Tables:** `coupons`, `coupon_usages`, (referenced: `coupon_clients` for SPECIFIC audience — assignment not visible in storetools UI)

---
