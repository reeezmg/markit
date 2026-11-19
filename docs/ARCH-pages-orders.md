## Coupon Pages

> **Moved to dedicated file:** See `ARCH-pages-coupon.md` for full coupon documentation.

---

## Order Pages

Order details link to company-scoped after-sales history. Seller-created and public
ecommerce orders register covered units inside their creation transaction. Manual
delivery and carrier tracking/webhooks activate delivery-based agreements once.
Cancellation ends remaining obligations; return approval alone does not. Physically
received covered returns in Accountant require exact registered unit selection.
See `ARCH-after-sales.md`.

Company-owned WhatsApp automation separately observes committed order status and paid
state, including public storefront/carrier changes. It can notify confirmation,
dispatch, delivery, failed delivery, cancellation and received returns. It does not
call carriers or alter order/stock/accounting state. Configuration, client permissions
and the separately prepared notification migration are in `WHATSAPP-NOTIFICATIONS.md`.

The `order/` pages handle order operations. The full Storefront sidebar exposes Orders (`/order/ecomorders`), Pickup, Failed deliveries, Requests, Returns and Exchange. `layouts/default.vue` excludes the Orders group from the ERP sidebar. Older Try N Buy and Bookings pages remain in source but are hidden from the sidebar for now.

### Navigation (`pages/order.vue` layout)
- Sidebar links are owned by `layouts/default.vue`; `pages/order.vue` renders the authenticated Order shell and `<NuxtPage />` without a local navigation list.
- `/order` redirects to `/order/ecomorders`
- Packing pages (`/order/pack`, `/order/ready`) are navigated to directly from the list rows

---

### `pages/order/ecomorders.vue` - Ecommerce Orders
Cancellation restores available quantity and reduces sold quantity by the same amount. Sold quantity is not independently clamped at zero, preserving the stock formula for legacy net returns.

**Accountant connection:** New orders can post through company-enabled Ecommerce accounting. `/accountant/ecommerce` records actual received returns, completed refunds, courier/gateway settlements, costs and extra financial charges. Request approval and shipment status alone do not prove those financial activities. See `ARCH-pages-accounts.md`; the existing order/bill creation timing is preserved.
**Data model:** `EcommOrder` rows from `ecomm_orders`, created by the Revomotive custom storefront checkout flow.

**Query:** `useFindManyEcommOrder`
- `where.companyId = current company`
- includes `client` name/phone/email and linked `bill` invoice/status
- ordered by `createdAt desc`; server-side `skip`/`take` pagination and a separate count query replace the old client-side latest-100 limit

**UI:** Server-side search by order/customer/phone/email/invoice, status/payment filters, and a table with order, date, customer, item summary, payment, status, total and detail view. It bulk-checks live carrier tracking and displays that status ahead of a stale stored status. Staff can mark an eligible order packed, inspect/override status with a note, cancel through the dedicated rollback endpoint, and create shipments in bulk. A manual status change does not override a newer live carrier status in the table.

**Detail popover:** Shows shipping address, item snapshot from the `items` JSON (including variant, size, and shade when present), subtotal, discount, delivery fee, and grand total.

**Shipping:** `components/ShipOrderModal.vue` loads `/api/ecommerce-cms/shipping/order-preview`. All seller shipping handlers now execute TypeScript in the same Nuxt deployment through `server/utils/shipping/index.ts` and `service.ts`; no shipping URL or separate Python process is needed. Seller scope comes from `useCompanyRequestSession`. Order previews only read the database; creation, tracking, labels, cancellations, pickups, NDR, reverse/exchange flows and warehouse registration call carrier APIs directly. Item dimensions precede product dimensions; cartonization checks orientation and caps boxes at 200. Shipment creation serializes each company/order, refuses existing shipments and terminal orders, retains e-waybill metadata, and persists carrier AWBs without changing order status. Carrier tracking preserves forward/retry transitions, terminal statuses, status history, COD settlement and first delivery activation. AWBs used in seller operations must belong to the authorized company. Label downloads regenerate expired links and return bytes through the existing same-origin endpoint. Markit's custom label keeps Delhivery's routing/address fields but resolves each AWB back to its company-owned forward, reverse or exchange order snapshot; its product table renders one row per item with product, variant/shade, quantity, unit price and line total instead of printing Delhivery's aggregated `prd`/`qty` values as one row. See `server/utils/shipping/README.md` for deployment and validation.

**Status dates:** Database triggers now retain first observed `paidAt` and a separate `document_status_history` audit for bill/order/checkout status and payment-status changes. The tenant-scoped `/api/bill/status-history?type=order&id=...` reader exposes these records; this does not add a timeline panel to the page. Existing carrier/manual order history is retained. See `ARCH-schema.md` for migration and legacy-date semantics.

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

Requires a nonempty string `?id=`. Opening the bare route redirects to `/order/trynbuy`; the record query stays disabled until the ID and authenticated company are available. The browser audit selects an existing company-owned Trynbuy for record-detail checks and marks missing records untested.
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

Requires a nonempty string `?id=`. Opening the bare route redirects to `/erp/online`; bill loading requires both ID and authenticated company. Barcode lookup waits for input, and optional category/variant display fields tolerate missing relations.
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

**Purpose:** Renders a printable thermal receipt for a given bill ID, with PDF download and Copy PDF link. Authenticated staff create a cloud-stored PDF from the same rendered receipt image before copying its signed link; recipients need no staff login. Receipt download actions no longer offer HTML. Sales offers View / share receipt.

**Data:** Authenticated `GET /api/billSale/receipt?id={id}` (optional authorized companyFilter). Links with a share token use `GET /api/receipt-share?token=...`; HMAC binds bill/company and expires after 30 days. `POST /api/billSale/share-receipt` verifies access before issuing the token. Ordinary viewer reads call `server/utils/receiptData.ts` and use the current company receipt default. PDF links include `pdf=1` and a signed `documentKey`: the receipt page opens `/api/receipt-share?token=...&pdf=1`, which checks token expiry and bill existence before redirecting to a one-hour signed R2 PDF download. The stored PDF retains the appearance at sharing time even when the company design later changes. Deleted bills remain unavailable. Receipt pages suppress referrers and indexing, and are excluded from last-route persistence/restoration. Signing uses RECEIPT_SHARE_SECRET or NUXT_SESSION_SECRET/SESSION_SECRET (minimum 32 characters); missing configuration fails closed. `GET /api/billSale/receipt?id={id}` — fetches bill data for receipt

**Rendering:** Passes response data to `<ThermalReceipt :data="printData" />` component. For custom receipt table columns, `server/utils/receiptData.ts` resolves related item/product/variant data inside the bill company and returns only the configured formatted cell values. Receipt data includes the bill company's isTaxIncluded setting for the tax summary. Billed quantity/rate/amount fields remain the bill values; product relations are current catalogue values. Unmatched or ambiguous product links produce blank related cells.

`definePageMeta({ layout: false })` — no app shell

**Validation:** Shared links expose one signed bill/document only, with no-store API responses; PDF generation and ordinary downloads run in the browser. PDF uploads validate MIME, header/EOF and an 8 MiB data-URI limit; server-generated unique keys prevent overwriting older documents. Storage credentials remain server-side. No database changes are involved.

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

The tool has a local page-form Company / branch selector for authorized head-office admins. Selecting a target remounts its form/previews and scopes every cleanup request. This does not bypass the existing cleanup entitlement/code gate or authorize cleanup execution during a read-only page audit.
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

Pickup operations and origin-address configuration. Staff create/edit/delete pickup locations, choose a default and sync/register a location with Delhivery. The page also loads parcels awaiting pickup, raises carrier pickups through `/api/ecommerce-cms/pickup/raise`, and reviews pickup requests. A Storetools pickup location and a carrier-registered location can differ until synchronization succeeds. The in-process shipping provider list returns an empty list when no configuration exists; actual carrier operations still require configuration. The pickup page shows setup guidance for an empty list and a retry alert for request failures, while location management remains available. `tests/shipping.test.ts` checks this distinction.

Pickup request history uses one compact table row per request. Selecting a row opens a wide right-side slideover with request metadata and every attached parcel, following the distributor-style summary/detail interaction. Parcel details are grouped by order and shipment kind (forward or exchange) and show the AWB, customer, and product snapshot with image, product/variant, barcode, size, quantity, rate, and amount. `GET /api/ecommerce-cms/pickup/requests` resolves the stored `<orderId>:<kind>` references against company-owned ecommerce orders; exchange parcels use the linked exchange-request item snapshot when available. Each row has a three-dot menu for printing all attached AWB labels, downloading one combined label PDF, and cancellation. Legacy rows without `carrierPickupId` are visibly marked as not created in Delhivery and can be cancelled locally to release their parcels. Carrier-backed rows open Delhivery One for cancellation because the public pickup API has no cancellation operation; the status endpoint rejects a local-only cancellation for those rows.

Pickup creation is successful only when the carrier response contains a non-empty `pickup_id`. Both the Delhivery adapter and `/api/ecommerce-cms/pickup/raise` enforce that contract before any local pickup row or shipment tag is persisted. This fixes the prior false-success path where an HTTP 200 response without `pickup_id` created a Markit-only request even though Delhivery had not scheduled a pickup.

**Requested versus allocated schedule:** `EcommPickupRequest.requestedPickupDate` and
`requestedPickupTime` preserve the submitted date/time; `pickupDate`/`pickupTime`
remain the legacy requested values. `carrierResponse` retains the carrier creation
response. Nullable `carrierSchedule` records `{date,startTime,endTime,source,recordedAt}`.
The public B2C API documents creation, not allocated-slot readback or attaching AWBs
to an existing pickup. Never infer the carrier slot from the submitted time. The
table and detail panel show the requested time separately and show an unknown
carrier slot until recorded. `PickupCarrierScheduleModal.vue` copies the allocated
date and start/end times from Delhivery One (IST); this records information locally
and does not reschedule the carrier booking. No live synchronization is claimed.

**Adding parcels:** Order row actions expose **Add to existing pickup** for unassigned
forward shipments awaiting pickup; pickup row actions expose **Add orders**.
`PickupAddOrdersModal.vue` loads open carrier-backed pickups and eligible parcels,
including independent forward/exchange legs. `POST /api/ecommerce-cms/pickup/add`
locks the pickup and company-owned orders, checks carrier/location and eligibility
again, updates per-leg tags and the local parcel/package count, and treats retries
as no-ops. A stale selection fails before writes. This changes Markit's planned
handover list only; the creation API does not populate Delhivery One's per-pickup
order list. Explicitly selecting a held-back parcel includes it for this pickup.

**Local migration pending:** `20261115160000_pickup_requested_schedule` adds the four
new nullable fields and backfills only requested dates/times. Database application
requires separate authorization. Pickup history remains readable before migration;
creation and carrier-slot recording fail with a clear 503 before booking a carrier
pickup when the new columns are missing. `tests/pickup-management.test.ts` covers
assignment isolation, retries, validation, schedule separation and that guard.


### Pickup location read snapshot

The pickup page captures seller auth during setup and awaits its current-company location read during SSR. Carrier registration and provider operations remain separate user actions.
