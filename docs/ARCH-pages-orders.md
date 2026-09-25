## Coupon Pages

> **Moved to dedicated file:** See `ARCH-pages-coupon.md` for full coupon documentation.

---

## Order Pages

The `order/` pages handle order operations. The visible sidebar currently exposes **Orders** (`/order/ecomorders`) and **Requests** (`/order/requests`); older Try N Buy and Bookings pages remain in source but are hidden from the sidebar for now.

### Navigation (`pages/order.vue` layout)
- Sidebar links: Orders (`/order/ecomorders`), Requests (`/order/requests`)
- `/order` redirects to `/order/ecomorders`
- Packing pages (`/order/pack`, `/order/ready`) are navigated to directly from the list rows

---

### `pages/order/ecomorders.vue` - Ecommerce Orders
**Data model:** `EcommOrder` rows from `ecomm_orders`, created by the Revomotive custom storefront checkout flow.

**Query:** `useFindManyEcommOrder`
- `where.companyId = current company`
- includes `client` name/phone/email and linked `bill` invoice/status
- ordered by `createdAt desc`; server-side `skip`/`take` pagination and a separate count query replace the old client-side latest-100 limit

**UI:** Server-side search by order/customer/phone/email/invoice, status/payment filters, and a table with order, date, customer, item summary, payment, status, total and detail view. It bulk-checks live carrier tracking and displays that status ahead of a stale stored status. Staff can mark an eligible order packed, inspect/override status with a note, cancel through the dedicated rollback endpoint, and create shipments in bulk. A manual status change does not override a newer live carrier status in the table.

**Detail popover:** Shows shipping address, item snapshot from the `items` JSON (including variant, size, and shade when present), subtotal, discount, delivery fee, and grand total.

---

### `pages/order/trynbuy.vue` — Try N Buy Orders
**Data model:** `Trynbuy` — marketplace Try N Buy order. Multi-company (M2M via `company` relation). Each trynbuy has `cartItems` linked to specific items/variants.

**Query:**
- `useFindManyTrynbuy` with `useCountTrynbuy` for pagination
- `where.company.some.id = companyId` — filters to current company's orders only
- `cartItems` filtered inline: `variant.product.companyId = companyId` — only shows items belonging to this company (marketplace has multiple companies per order)
- `include.bill` filtered by `companyId` — shows associated bill for this company

**Filters:** orderNumber (numeric search), orderStatus (PAID/PENDING), date range picker (default: last 7 days)

**Columns:** Order#, Date, Delivery type, Delivery Time, Status (from `cartItems[0].status`), Actions

**Pickup OTP in table:** The Delivery column also shows the current store's pickup OTP from `pickupOtps[currentCompanyId]` once generated, so each company sees only its own persisted code for a multi-store Try N Buy order.

**Cart item status badges:**
- BILLED = green, ALL_RETURNED = purple, CANCELLED = red, OUTOFSTOCK = red, DELIVERED = orange, ORDER_RECEIVED = yellow

**Actions per row:**
- "Pack" → navigates to `/order/pack?id={trynbuyId}`
- "Bill" → navigates to `/erp/edit/{row.bill[0].id}` (edit the existing bill)

**Sub-table (expand):** shows `cartItems` with barcode, variant name, size, qty, rate, tax

**Reactive refresh:** watches `checkoutStore.lastUpdate` → re-fetches (socket-driven update from marketplace checkout flow)

**Notes editable per row:** `useUpdateBill({ notes })` — updates bill notes inline via popover textarea

**Bugs:**
- `watch(trynbuys, newData => console.log('📦 Fetched TrynBuys:', newData))` — logs all order data on every load
- `handleUpdate` calls `UpdateBill` and `console.log`s result
- `useUpdateBill` imported but only used for notes update, not status changes

---

### `pages/order/pack.vue` — Pack Try N Buy Order
Accessed via `/order/pack?id={trynbuyId}`.

**Data fetching:** `useFindUniqueTrynbuy` with `orderId = route.query.id`
- Fetches: order metadata (orderNumber, subtotal, deliveryType, deliveryTime, orderStatus), location (name, formattedAddress, houseDetails), client (name, phone), cartItems (filtered by companyId, includes variant images + item barcode)

**Items table (read-only most fields):** sn, image (S3), barcode (editable), name, qty, rate, discount (editable), tax, value, actions

**Item value calculation:** `qty * sprice - discount%` (tax commented out)

**Per-item actions:**
- **Out of stock / In stock toggle:** `UpdateTrynbuyCartItem({ status: 'OUTOFSTOCK' / 'ORDER_RECEIVED' })`
- Item-level action is an icon-only stock toggle button (no unpack action)
- Item `status` field now tracked from `cartItem.status` (defaults to `ORDER_RECEIVED`); `outOfStock` is derived as `status === 'OUTOFSTOCK'`
- Returned red highlighting is row-scoped from that cart row's own `cartItem.status === 'RETURNED'`, not from matching `itemId`, so duplicate same-item rows can show one returned and one kept correctly.
- Stock toggles also call `GET /api/pack/{trynbuyId}/{clientId}?companyId={companyId}` after the row update so marketplace and delivery consumers refresh their active item list immediately

**Pack all (handlePack):**
1. Iterates current item rows
2. Uses a `packLoading` flag so the Pack button shows loading and is disabled until the request flow completes
3. `Promise.all(items.map(row => UpdateTrynbuyCartItem({ where: { id: row.id }, data: { status: row.outOfStock ? 'OUTOFSTOCK' : 'ORDER_RECEIVED' } })))`
4. Fires `GET /api/pack/{trynbuyId}/{clientId}?companyId={companyId}` at `serverUrl` — notifies backend to emit Socket.io event to client, returns the current store's pickup OTP, and lets the server decide whether the overall order can now move to `PACKED`

**Store cancel action:**
- Bottom action row now includes a red `Cancel` button beside `Pack`
- Clicking `Cancel` opens a modal that requires a free-text cancellation reason and shows the fixed store penalty `Rs 50`
- Submit posts to `POST /api/pack/{trynbuyId}/{clientId}/cancel-store` with `{ companyId, reason }`
- Storetools pack-page cancellation is rejected once that store has already been picked; post-pickup cancellation has to continue through the delivery return flow instead
- On success the page reuses the same pack sync endpoint so downstream marketplace and delivery state stays aligned

**Order-level status aggregation:**
- `ORDER_RECEIVED` when placed from marketplace
- `PACKED` only after all stores on the order are marked packed in `trynbuys.store_statuses`
- Per-store pickup OTP is store-scoped, persisted in DB, and reused across Pack clicks / refreshes
- Per-store cancellation is tracked in `trynbuys.store_statuses[companyId].cancelled`; the top-level order moves to `CANCELLED` only after all linked stores are cancelled

**Pickup OTP behavior:**
- Pickup OTP is stored in `trynbuys.pickup_otps` as a JSON map keyed by company/store ID
- Clicking Pack reuses the existing OTP for that store if one already exists; it does not generate a new OTP on every click or refresh
- On refresh, `pack.vue` calls `GET /api/pack/{trynbuyId}/otp?companyId={companyId}` to re-render the saved OTP for the current store

**Header displays:** Order#, Ordered Time, Delivery Time, Client name/phone, Address (with hover popover for full address), Notes, Order Status badge

**ZenStack hooks:** `useFindUniqueTrynbuy`, `useUpdateTrynbuyCartItem` (removed `useUpdateEntry` — no longer used)

**Bugs (remaining):**
- ~~`handleSave` dead code~~ — **REMOVED**
- `console.log(trynbuy)` in the `watch` block — logs full order on every data change
- Import `item` from `@unovis/ts` at line 3 — unused import (still present)

---

### `pages/order/bookings.vue` — Booking Orders
**Data model:** Uses `Bill` table filtered by `type: 'BOOKING'` — bookings are regular bills with a special type.

**Query:** `useFindManyBill` + `useCountBill`
- `where: { companyId, type: 'BOOKING', ... }` — same filters as sales.vue (status, date, invoice search)
- `include.entries.include.category.select.name` — includes entries with category names

**Default page count:** `ref('3')` — very small default (likely a dev artifact)

**Columns:** Inv#, Date, Entries (count), Status, Notes (editable), Actions

**Action per row:** "Pack" button → navigates to `/order/ready?id={billId}`

**Notes:** Same inline popover textarea pattern as trynbuy.vue — `useUpdateBill({ notes })`

**Bugs:**
- `watch(sales, newsales => console.log(newsales))` — logs all bookings on every load
- `handleUpdate` logs result with `console.log(res)`
- `useUpdateManyCategory` imported but never used — dead import
- `action(row)` defined with a "Delete" item but the delete handler is never wired (template uses a separate "Pack" button instead of the action dropdown)

---

### `pages/order/requests.vue` — Requests Queue
**Purpose:** Admin queue shell for ecommerce cancellation, return, exchange, and refund requests.

**Current state:** UI scaffold only. It shows summary cards, status/type filters, an empty `UTable`, and a link to `/settings/requests`. No request model/API is wired yet.

**Request buckets:** Cancellation, Return, Exchange, Refund.

---

### `pages/order/ready.vue` — Pack Booking Order
Accessed via `/order/ready?id={billId}`. Booking variant of the pack page.

**Data fetching:** `useFindUniqueBill` with full detail select — entries with barcode, name, qty, rate, discount, tax, value, size, outOfStock, category name, variant images

**Barcode scan/enter flow (`handleEnterBarcode`):**
1. Scan barcode → look up `useFindFirstItem({ where: { barcode } })`
2. Check `item.variantId === entry.variantId` — validates correct item for the slot
3. If out of stock: first calls `handleInStock` to clear outOfStock flag
4. `UpdateEntry({ barcode, item: { connect: { id: itemData.id } } })` — links scanned physical item to bill entry

**Pack all (handlePack):**
1. `UpdateBill({ status: allOutOfStock ? 'OUTOFSTOCK' : 'BOOKED' })` — updates bill status
2. `Promise.all(items.map(item => UpdateItem({ status: 'booked' })))` — marks physical items as booked

**Per-item actions:** Unpack / Out-of-stock / In-stock actions on `Entry` rows (booking flow keeps unpack action)

**Grand total calculation:** Computed from entries (qty × rate − discount%) + bill-level discount + tax

**Header displays:** Invoice#, Delivery Time, Client name/phone, Address (hover popover), Notes, Bill type badge, Payment method

**ZenStack hooks:** `useFindUniqueBill`, `useFindFirstItem`, `useUpdateEntry`, `useUpdateItem`, `useUpdateBill`

**Bugs:**
- `handleSave` is another empty try/catch dead code block
- Import `item` from `@unovis/ts` at line 3 — unused import (same as pack.vue)

---

## Receipt & History Detail Pages

### `pages/receipt/[id].vue` — Thermal Receipt Viewer
Route: `/receipt/:id`

**Purpose:** Renders a printable thermal receipt for a given bill ID.

**Data:** `GET /api/billSale/receipt?id={id}` — fetches bill data for receipt

**Rendering:** Passes response data to `<ThermalReceipt :data="printData" />` component

`definePageMeta({ layout: false })` — no app shell

**Bugs:** `console.log('PRINT DATA:', res)` on every load

---

### `pages/saleshistory/[billId].vue` — Bill History Snapshot Viewer
Route: `/saleshistory/:billId`

**Purpose:** Read-only view of a `BillHistory` record — shows the exact state of a bill at the time of a past operation.

**Data:** `useFindUniqueBillHistory({ where: { id: route.params.billId } })` — fetches by BillHistory ID (not Bill ID)

**View:** Read-only version of the billing form — all inputs are `disabled`. Shows:
- Date, entries table (barcode, category, name, qty, rate, discount, tax, value)
- Footer: total qty, discount, subtotal, grand total, return amount, payment method, account, client name/phone/points
- Split payment modal (view-only with disabled inputs)

**Resizable columns:** Implements mouse-drag column resize via `startResize / handleResize / stopResize` on table headers

**Bugs:** `console.log(newData?.data)` in watch callback — logs full BillHistory data on load

---

## Checkout / Store Frontend Pages

### `pages/checkout/[orderId].vue` — Empty Stub
`<template></template>` — completely empty, reserved route.

### `pages/checkout/index.vue` — Empty Stub
`<template>\n</template>` — completely empty, reserved route.

---

## Cleanup Page

### `pages/cleanup.vue` — Bill Cleanup / Bulk Delete Tool
**Purpose:** Admin tool to selectively delete old bills to reduce data volume while preserving a target total revenue amount.

**Access control (fully in-page — middleware no longer guards this route):**

- `const unlocked = useState('cleanup-unlocked', () => false)` — shared state with `layouts/default.vue` (controls sidebar + navbar visibility)
- `hasAccess` computed: reads `route.query.code` first (to register it as reactive dep), then returns `session?.cleanup === true && unlocked.value`
- **Keyboard shortcut Ctrl+U:** opens a hidden `<input type="text">` (`opacity-0 absolute pointer-events-none`). On Enter, checks typed code against `session?.cleanupCode` locally. If correct: `unlocked.value = true`. No URL navigation.
- `unlocked` resets to `false` in `onUnmounted`
- **Sidebar hidden:** when `!hasAccess`, `default.vue` hides `UDashboardPanel` via shared `useState('cleanup-unlocked')`
- **Navbar hidden:** `<UDashboardNavbar v-if="hasAccess">` inside cleanup.vue
- **404 UI (inline):** when `!hasAccess`, page renders orange "404", "Page not found", and a "Go back home" button — not via middleware or `showError()`

**Tabs:**
- **Bill Delete:** cleanup delete tool with Preview Delete, then Soft/Permanent confirm.
- **Bill Reduce:** cleanup amount-reduction tool with Preview Reduce, then Reduce Amount confirm.
- **Bulk Payment Method:** shifts a specific amount from one or more source payment methods into a target method across bills in the selected date range. Partial simple-method bills become `Split`; existing `Split` bills have source method amounts reduced and target method amount increased while preserving the bill `grandTotal`.

**Two-step flow:**
1. **Preview Delete** or **Preview Reduce** - fills form -> `POST /api/cleanup/getCleanupBill` returns both plans; the page displays only the selected preview mode.
2. **Confirm Cleanup** - delete preview modal offers Soft/Permanent delete; reduce preview modal offers Reduce Amount. Both post to `POST /api/cleanup/deleteCleanupBill` with the relevant preview plan and `deleteType: 'soft' | 'permanent' | 'reduce'`.

**Delete types:**
- **Soft Delete:** sets `precedence = true` on matched `bills` and their `billHistories` — does NOT remove rows. Bills with `precedence = true` are excluded from all normal queries but visible in cleanup view. Uses `applySoftBillDeletionCleanup` utility.
- **Permanent Delete:** hard-deletes bills and re-sequences invoice numbers. Uses `applyBillDeletionCleanup` utility.
- **Reduce Amount:** preserves first real values in `bills.original_subtotal`, `bills.original_grand_total`, `bills.original_discount`, `entries.original_rate`, `entries.original_value`, and `entries.original_discount`, then lowers visible `entries.rate`, `entries.value`, `bills.subtotal`, and `bills.grand_total` from the preview `reductionPlan`, recalculates visible `entries.tax` from category tax rules using the reduced per-unit value (`value / qty`), and sets visible bill/entry discounts to `0`. Uses `applyBillReductionCleanup` utility. Sales list exposes real totals/rates/values/entry discounts only when `session.cleanup === true`.

**Form fields:**
- Start/End date range
- Target total amount (keep bills totaling at least this value)
- Time preference: oldest/newest first
- Value preference: lowest/highest value first
- Payment method filter
- Delete mode only: Minimum bill amount (exclude small bills from deletion)
- Reduce mode only: repeatable reduction rules `{ fromAmount, toAmount, reducePercent }`; default is `0, 0, 100` where `toAmount = 0` means no upper limit. Each bill uses the first matching rule by bill total.

**Preview summary shows:**
- Delete mode: value to be removed, bills to be deleted, remaining total/count after deletion
- Reduce mode: value to reduce, bills to reduce, matching reduction rule / percentage cap, remaining total/count after amount reduction, and any amount still above target when the per-bill percentage cap prevents reaching the target

**Preview table:** Paginated (10/page). Delete mode columns: Action, Inv#, Payment Method, Original Total. Reduce mode columns: Inv#, Original Total, Rule, Reduce %, Reduce By, Reduced Total. Already-soft-deleted bills (`precedence = true`) are excluded from candidates.

**Note:** Uses `alert()` for success message after deletion (not toast) — native browser alert

---
## Current ecommerce fulfilment pages

### `pages/order/index.vue`

Authenticated redirect from `/order` to `/order/ecomorders`. It does not render an order list itself.

### `pages/order/create.vue`

Manual ecommerce-order creation. Staff search/select a customer, enter delivery address, search/add products, inspect eligible coupons, set payment/charges and review the total before submitting to `/api/ecommerce-cms/orders/create`. The page uses `/api/ecommerce-cms/orders/client-search`, `/product-search` and `/orders/coupons` for its selectors. After a successful create it navigates to the ecommerce-order list with the order number in the query. This is a seller-created order, not the storefront checkout UI.

### `pages/order/ndr.vue`

Failed-delivery (NDR) workspace. Loads recent shipments from `/api/ecommerce-cms/shipping/ndr-list?days`, shows failure reason, customer/shipment information and carrier status, and lets staff queue supported delivery actions through `/shipping/ndr`. It can poll action status through `/shipping/ndr-status?uplId`; a queued action is not proof that the carrier has completed it. The UI includes time-window guidance for some actions.

### `pages/order/returns.vue`

Customer return-request queue. Loads `/api/ecommerce-cms/returns`, filters/displays requests, approves or rejects via `/returns/status`, tracks reverse movement, and can create a reverse shipment via `/shipping/reverse`. NDR actions are available where the reverse carrier shipment requires them. This is separate from distributor purchase returns.

### `pages/order/exchange.vue`

Exchange-request queue. Uses the returns/request data with exchange filtering; staff can update request status and create an exchange shipment through `/api/ecommerce-cms/shipping/exchange`. The page also surfaces tracking and NDR actions when relevant. Approval and shipment creation are separate steps.

### `pages/order/pickup.vue`

Pickup operations and origin-address configuration. Staff create/edit/delete pickup locations, choose a default and sync/register a location with Delhivery. The page also loads parcels awaiting pickup, raises carrier pickups through `/api/ecommerce-cms/shipping/pickup/raise`, and reviews/updates pickup requests and status. A Storetools pickup location and a carrier-registered location can differ until synchronization succeeds.
