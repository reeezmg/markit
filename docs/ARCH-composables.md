# Storetools Composables

All custom composables and lib utilities in `storetools/composables/` and `storetools/lib/api/`.

**Note:** `storetools/lib/hooks/` contains ZenStack auto-generated hooks (e.g., `useFindManyProduct`, `useCreateBill`) — see `ARCH-patterns.md` for the hooks pattern.

---

## ElectricSQL / Local-First (PAUSED — do not touch)

Three composables are part of a paused local-first feature using ElectricSQL + PGlite:

| File | Role |
|---|---|
| `composables/db.client.ts` | Initializes PGlite (IndexedDB) with ElectricSQL sync extension; syncs `products`, `categories`, `variants`, `items` tables |
| `composables/client.client.ts` | Resilient HTTP client with exponential backoff targeting `localhost:3000/api` |
| `composables/sync.client.ts` | `ChangeLogSynchronizer` class — watches PGlite `changes` table, batches transactions, sends to backend, handles accept/reject/rollback |
| `composables/useDb.client.ts` | Fully commented out — dead code remnant |

Do **not** edit these files.

---

## Cloud Storage / AI Image

### `composables/aws.ts` — `CloudflareService` class

Class for Cloudflare R2 storage and AI image generation. Browser code never receives R2 credentials: raw uploads and signed-URL requests go through authenticated Nuxt server endpoints, while the existing image-generation methods continue to call their configured workers/server flows.

| Method | Description |
|---|---|
| `generateS3SignedUrl(key, fileName?)` | Calls authenticated `POST /api/r2/signed-url`; the server generates a signed GET URL that expires after 1 hour |
| `uploadBase64Object(base64, key)` | Calls authenticated `POST /api/r2/upload`; the server validates and uploads the image to R2 |
| `uploadBase64File(base64, key, view?, categoryName?, targetAudience?, isAiImage?)` | Full upload flow: resize to 1024×1024, send to Cloudflare Worker for AI image generation (fashion/e-commerce prompt). Worker URL hardcoded. |
| `aify(uuid, view?, categoryName?, targetAudience?, isAiImage?)` | Sends existing image UUID to AI worker for re-generation. Returns worker response. |

**Bugs:**
- Worker URL hardcoded: `https://wild-hill-b1b5.reezmohdmg16.workers.dev`
- Upload secret hardcoded: `upload_reez_2025_Xh39!poL` (in `uploadBase64File`)
- `console.log` statements for upload size and success left in

---

## Authentication / Firebase

### `composables/firebase.ts` — Firebase app + auth singleton

Initializes Firebase app (singleton guard via `getApps()`). Exports `app` and `auth`.

```ts
import { app, auth } from '~/composables/firebase'
```

Used by: `useMessaging.ts`, `Checkout/login.vue`

**Bug:** Firebase config (apiKey, appId, projectId, etc.) hardcoded in source.

### `composables/useMessaging.ts` — `useMessaging()`

Lazy-loads Firebase Messaging on client only (`process.client` guard). Returns the messaging instance or `null` on SSR.

### `composables/usePushNotifications.ts` — `usePushNotifications(userId)`

Web push notifications via Firebase Cloud Messaging:
1. Requests browser notification permission
2. Gets FCM token using hardcoded VAPID key
3. Saves token + `deviceId` (from `localStorage` or `crypto.randomUUID()`) to `/api/savefcmtoken`
4. Sets up `onMessage` handler for foreground notifications (displays native `Notification`)

**Bug:** VAPID key hardcoded in source.

### `composables/useCapPush.ts` — `registerPush(userId)`

Native Capacitor push notifications (iOS/Android):
1. Requests `PushNotifications.requestPermissions()`
2. Registers device, receives FCM token
3. Saves token + `deviceId` (UUID from localStorage) to `/api/savecaptoken`

Used on native platform at login — see `ARCH-pages-auth-settings.md`.

---

## Printing

### `composables/usePrintBill.ts` — `usePrint()`

Platform-aware print dispatcher. Checks `Capacitor.isNativePlatform()`:
- **Native:** delegates to `useReceiptPrinter()` (BLE)
- **Web:** prefers WebUSB direct printing, then falls back to the local print server at `localhost:3001`

| Method | Web behavior | Native handler |
|---|---|---|
| `printBill(printData)` | If `webUsbPrinterRoles.receipt` exists, tries WebUSB first, then falls back to `POST /api/print-bill` on `http://localhost:3001` with a short timeout. Earned coupon vouchers print their `code` as the barcode. | `printMobileBill(printData)` |
| `printReport(printData)` | `POST /api/print-report` on `http://localhost:3001` | `printMobileReport(printData)` |
| `printLabel(labelData, printerLabelSize)` | If `webUsbPrinterRoles.barcode` exists, tries WebUSB first, then falls back to `POST /api/print-label` on `http://localhost:3001` | `printMobileLabel(labelData, size)` |

### `composables/useWebUsbPrinter.ts` â€” `useWebUsbPrinter()`

Browser-only printer manager used by `usePrint()` and `pages/settings/printer.vue`.

- Enabled only on web when `navigator.usb` exists; disabled on native (`Capacitor.isNativePlatform()`)
- Stores saved printers in `localStorage['savedWebUsbPrinters']`
- Stores role assignments in `localStorage['webUsbPrinterRoles']`
- Supported roles:
  - `receipt`
  - `barcode`
- Same USB printer can be assigned to both roles
- `connectUsbPrinter()` opens `navigator.usb.requestDevice({ filters: [] })` and stores a lightweight printer record (`vendorId`, `productId`, `serialNumber`, `manufacturerName`, `productName`)
- Reconnect uses `navigator.usb.getDevices()` and matches by `serialNumber` when available, otherwise vendor/product/name
- Print flow opens the device, selects a configuration, claims the first interface exposing an `out` endpoint, writes bytes with `transferOut()`, then releases/closes the device

Key exports:
- `isWebUsbSupported()`
- `getSavedWebUsbPrinters()`
- `getWebUsbPrinterRoles()`
- `assignWebUsbPrinterRole(printerId, role)`
- `clearWebUsbPrinterRole(role)`
- `removeSavedWebUsbPrinter(printerId)`
- `printBillViaUsb(printData)`
- `printLabelViaUsb(labelData, printerLabelSize)`

### `composables/printCommands.ts`

Shared print-byte builders used by both native BLE printing and WebUSB printing.

- `buildBillReceiptBytes(bill)` â€” ESC/POS receipt bytes via `@point-of-sale/receipt-printer-encoder`
- `buildLabelPrintJobs(items, printerLabelSize)` â€” TSPL label command buffers for `50x25mm` and `50x38mm`

### `composables/useReceiptPrinter.ts` — `useReceiptPrinter()`

Full BLE thermal printer implementation using `@point-of-sale/receipt-printer-encoder` and `@capacitor-community/bluetooth-le`. Reads selected printer from `localStorage('selectedPrinter')` on native.

BLE services: `SERVICE = 000018f0-...`, `CHARACTERISTIC = 00002af1-...`
Sends data in 512-byte chunks with 50ms delay between chunks.
Uses `printCommands.ts` for shared receipt and label byte generation, so native BLE and WebUSB render the same bill/label format.

| Method | Description |
|---|---|
| `printMobileBill(bill)` | ESC/POS bill receipt: header, line items, totals, UPI QR code, footer |
| `printMobileLabel(items[], printerLabelSize)` | TSPL label printing; supports `50x38mm` and `50x25mm` label sizes with barcode (CODE128) |
| `printMobileReport(report)` | ESC/POS report print: revenue, expenses, expense detail rows |

**Bug:** `item.createdAty` typo in `printMobileReport` expense rows (should be `item.createdAt`).

### `composables/usePrinter.ts` — `usePrinter()`

Low-level BLE printer utility (connect/disconnect/test print). Sends raw ESC/POS via `BleClient.write`. Used for printer setup/testing, not for actual bill printing (use `useReceiptPrinter` for that).

---

## Notifications

### `composables/useNotifications.ts` — `useNotifications()`

Full in-app notification system with WebSocket real-time updates.

**Setup:** On mount: fetches notifications from REST, opens WebSocket connection.
**WebSocket host:** `localhost:3004` (dev) or `'your-fly-app.fly.dev'` (production placeholder — hardcoded, not yet configured).

Returns:
```ts
{ notifications, unreadCount, isLoading, error, isConnected,
  typeConfigs, getAction, fetchNotifications, markAsRead, markAllAsRead }
```

**Notification types:** `ORDER_RECEIVED`, `BILL_CREATED`, `PAYMENT_RECEIVED`, `EXPENSE_CREATED`, `INVENTORY_LOW`, `SHIPMENT_SENT`, `SYSTEM_ALERT`

Each type has an icon (`i-heroicons-*`), color, and label in `typeConfigs`.

Plays `/sounds/notification.mp3` on new unread messages.

**APIs used:**
- `GET /api/notifications?companyId=&userId=`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all?companyId=`

**Bug:** `console.log(notification)` on every WebSocket message. Production WebSocket host still set to placeholder string `'your-fly-app.fly.dev'`.

Used by: `components/NotificationsSlideover.vue`, `components/NotificationIcon.vue`

---

## Dashboard State

### `composables/useDashboard.ts` — `useDashboard()`

Shared composable (via `createSharedComposable` from `@vueuse/core`) — single instance across all consumers.

Manages:
- `isHelpSlideoverOpen: Ref<boolean>`
- `isNotificationsSlideoverOpen: Ref<boolean>`
- Keyboard shortcuts via `defineShortcuts`:

| Shortcut | Route |
|---|---|
| `d-d` | `/dashboard` |
| `e-b` | `/erp/billing` |
| `e-s` | `/erp/sales` |
| `e-e` | `/erp/expenses` |
| `e-r` | `/reports/daily` |
| `p-p` | `/products` |
| `p-c` | `/products/categories` |
| `o-o` | `/order/orders` |
| `o-b` | `/order/bookings` |
| `u-u` | `/users` |
| `c-c` | `/client` |
| `s-g` | `/settings` |
| `s-s` | `/settings/store` |
| `?` | Open HelpSlideover |
| `n` | Open NotificationsSlideover |

Closes both slidevers on route change.

---

## Socket.io Event Handlers

### `composables/useBillEvents.ts` — `useBillEvents()`

Listens to `bill:success` Socket.io event (from `useNuxtApp().$socket`).
On event: calls `BillStore.notifyUpdate()` and plays `/sounds/alert.mp3`.
Audio unlocked on first user click (browser autoplay policy workaround — module-level singleton).

Used in billing/ERP pages to update bill list in real time.

### `composables/useCheckoutEvents.ts` — `useCheckoutEvents()`

Identical pattern to `useBillEvents` but for `checkout:success` event.
Calls `checkoutStore.notifyUpdate()`.

Used in checkout/order pages for real-time order updates.

---

## Store Frontend Products

### `composables/useStoreProducts.ts` — `useStoreProducts({search, sortOrder, categoryFilter})`

Paginated product fetching for the customer store frontend. Accepts reactive refs for filters.

- Page size: 12
- Sort options: `'Price: Low to High'` → `price: asc`, `'Price: High to Low'` → `price: desc`, default → `createdAt: desc`
- Filter: active products (`status: true`), company matched by `route.params.company`, variants with images only
- Preloads trending products (8 newest) and categories with products on init

Returns:
```ts
{ products, isLoading, isReachingEnd, fetchMore, clearProducts, fetchInitial, trendingProducts, categories }
```

Uses ZenStack hooks: `useFindManyProduct`, `useFindManyCategory`

---

## Coupons

### `composables/useGenerateCoupons.ts` — `useGenerateCoupons()`

Calls `POST /api/coupons/generate` with `{ clientId, grandTotal }`.
Returns `{ generatableCoupons, loading, error, generateCoupons }`.

Legacy helper. Billing/edit save flows now rely on the transaction-safe generated-coupon helper inside `POST /api/bill/create` / `POST /api/bill/update`; `useBillingCoupons` still fetches and applies already available coupons.

---

## Utility Composables

### `composables/date.ts`

| Function | Input | Output |
|---|---|---|
| `formatDate(dateString)` | ISO date string | `DD/MM/YYYY` |
| `formatTime(dateString)` | ISO date string | `HH:MM` |

**Bug:** In `formatDate`, the `catch` block has `return ''` before `console.error(err)` — the console.error is unreachable dead code.

### `composables/hash.ts` — `hash(str)`

SHA-512 hash using `uncrypto` (Web Crypto compatible). Returns lowercase hex string.

### `composables/item.ts` — `getItem(variants)`

POST `/api/item` with variants array. Returns matching items (stock lookup).

### `composables/getTax.ts` — `useFindCategory(id)`

Calls `GET /api/gettax/`. Wraps result in `{ data, pending, error, refresh }` shape.
**Bug:** Function signature accepts `id` but ignores it entirely.

### `composables/prepareFileForApiUpload.ts` — `prepareFileForApi(file: File)`

Converts a `File` object to base64 data URL using `FileReader`. Returns `Promise<string>`.

### `composables/useLocalStorageRef.ts` — `useLocalStorageRef<T>(key, defaultValue, prefix)`

SSR-safe reactive ref backed by localStorage:
- Uses `useState(lsKey)` for SSR hydration safety
- On mount: reads stored JSON, then sets up deep `watch` to persist changes
- Key format: `{prefix}_{key}`

### `composables/useEChartsSetup.ts` — `useEChartsSetup()`

One-time ECharts component registration (guarded by `initialized` flag + `process.client` check).
Registers: `BarChart`, `LineChart`, `PieChart`, `GridComponent`, `TooltipComponent`, `TitleComponent`, `LegendComponent`, `CanvasRenderer`.
Call once before rendering any ECharts chart component.

### `composables/companyReports.ts` — `useCompanyEntries(startDate?, endDate?)`

Fetches `GET /api/user/report` with optional date range. Returns raw report data for the reports pages.

---

## lib/api

### `lib/api/useDashboardData.ts` — `useCompanyDashboard(startDate?, endDate?)`

Central data composable for the dashboard. Fetches all data using ZenStack hooks and exposes computed properties.

**Data fetched (all scoped to `session.companyId`):**
- Company (with address)
- Products, Items, Variants
- Bills (with client, address, entries `rate+qty`; excludes `deleted: true`)
- Expenses (with expensecategory)
- Entries (with variant→product, category, bill)

**Computed values returned:**

| Key | Description |
|---|---|
| `productsCount` | Total products |
| `itemsCount` | Total items (SKUs) |
| `totalRevenue` | Sum of `grandTotal` for `PAID` bills |
| `totalExpenses` | Sum of all expense `totalAmount` |
| `revenueGraph` | `[{month, total}]` — 12-month revenue array (PAID bills only) |
| `billsOverTime` | `[{month, total}]` — 12-month all-bills total |
| `topProducts` | Top 5 products by qty sold |
| `categorySales` | Sales by category (filterable by `startDate`/`endDate`) |
| `revenueByCategory` | Revenue sum per category (all time) |
| `lowStockEntries` | Variants with `qty < 5`, sorted ascending, max 6 |
| `recentTransactions` | 6 most recent bills |
| `recentUnpaidBills` | 5 most recent unpaid bills |
| `totalUnpaid` | Sum of unpaid bill totals |
| `totalTaxCollected` | `qty × rate × (tax/100)` across all entries |
| `taxByMonth` | 12-month tax collected array |
| `outstandingCustomers` | Clients with PENDING bills, sorted by total owed |
| `refreshAll()` | Refetches all queries |

Also returns raw: `company`, `products`, `bills`, `expenses`, `entries`

**Bugs:**
- `console.log(newVal)` in company watcher
- `console.log(newVal)` in expenses watcher

Used by: all dashboard chart components (see `ARCH-components.md` — Dashboard section)

### `lib/api/useCategoryTax.ts` — `initTaxData()`

Loads tax configuration for all company categories into `useState('taxdata')`.
Selects: `fixedTax`, `taxBelowThreshold`, `taxAboveThreshold`, `thresholdAmount`, `taxType`.
Call once at app init; read global state with `useState('taxdata')` anywhere.

---

## Bugs Summary

| File | Bug |
|---|---|
| `composables/aws.ts` | Worker URL and upload secret hardcoded in source |
| `composables/firebase.ts` | Firebase API key and appId hardcoded in source |
| `composables/usePushNotifications.ts` | VAPID key hardcoded in source |
| `composables/useNotifications.ts` | Production WebSocket host is placeholder `'your-fly-app.fly.dev'`; `console.log` on every WS message |
| `composables/useReceiptPrinter.ts` | `item.createdAty` typo (should be `item.createdAt`) in `printMobileReport` |
| `composables/getTax.ts` | `id` param accepted but ignored; fetches `/api/gettax/` regardless |
| `composables/date.ts` | `console.error` after `return ''` in catch — unreachable code |
| `lib/api/useDashboardData.ts` | `console.log(newVal)` in company and expenses watchers |
