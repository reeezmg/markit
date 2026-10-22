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

### `composables/usePushNotifications.ts` — `usePushNotifications()`

Web push notifications via Firebase Cloud Messaging:
1. Requests browser notification permission
2. Gets FCM token using hardcoded VAPID key
3. Saves token + `deviceId` (from `localStorage` or `crypto.randomUUID()`) to `/api/savefcmtoken` with credentials. The endpoint gets userId from the signed auth session, so registration does not depend on the client session snapshot's id. Login catches registration failures separately.
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

Platform dispatcher: the native mobile app uses the selected Bluetooth printer; web uses assigned WebUSB devices from Settings > Printer. There is no localhost service, automatic device chooser or browser print-dialog path. `printBill` preserves explicit design overrides; otherwise `useWebUsbPrinter` loads the company default. Product label calls use the same shared default loader.

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

### `composables/useReceiptPrinter.ts`

Native Bluetooth receipt, label and report output uses the previous BLE service `000018f0-0000-1000-8000-00805f9b34fb` and characteristic `00002af1-0000-1000-8000-00805f9b34fb`. It reads `selectedPrinter` at print time, shares `prepareReceiptPrint`/`prepareLabelPrint` with WebUSB, writes 512-byte chunks with 50 ms spacing and disconnects in finally. A failed label aborts the job and surfaces the error; no partial-success result or transport retry. A module-level busy guard rejects overlapping native jobs. TSPL/CPCL and default designs apply on Bluetooth too.

### `composables/printCommands.ts`

Company designs use `utils/load-print-template.client.ts` (company-scoped persistent cache first, fetching only when missing/invalid; Printer Settings load and successful saves refresh the cache). `utils/print-template-renderer.client.ts` renders one monochrome canvas for preview, PDF and raster commands. `usePrint` and WebUSB methods accept optional unsaved design overrides for test prints. Receipts use ESC/POS; labels use TSPL BITMAP or CPCL CG according to device-local `markit-label-printer-language` (default TSPL). CPCL uses raw binary graphic data followed by FORM/PRINT, as documented in Zebra's CPCL programming guide.

The fixed builders remain internal failsafes when no default exists or rendering a saved design fails. Explicit editor tests expose rendering errors. Missing label barcode errors also propagate without falling back to a blank native label. CPCL requires a selected design and has no fallback. Default-loading and label-enrichment errors are surfaced. All jobs are prepared before USB transmission; failed or incomplete transfers never retry using another format. USB writes use 4096-byte chunks and check status and bytes written.

Custom receipt table columns use `utils/receipt-table.ts` for variable resolution and `utils/load-receipt-table.client.ts` for related catalogue lookup. The renderer loads required product/variant/item relations through the existing company-scoped label-variable API; billed row values remain separate from current catalogue values. Shared receipt data is pre-resolved server-side into only the configured `receiptTableValues`, so public viewers need no private catalogue request. Manual entries without linked products leave related fields blank. New tables wrap headings and cells with shared column geometry; legacy items without column configuration keep the old layout.

The Classic Tax Receipt preset uses `utils/receipt-summary.ts` for discount/savings and rate-grouped tax amounts, following existing thermal tax-inclusive/exclusive behavior. `tableColumnLines` partitions table columns by layout line and `tableColumnTotal` sums configured billed values; both header and item cells use the same per-line geometry. `fontFamily: thermal` uses condensed Consolas/Liberation Mono fallback. Built-in and editable copies use the normal raster/PDF renderer, including earned coupons. `renderedTemplatePDF` embeds an already rendered canvas in a PDF, `createTemplatePDF` renders then returns a reusable PDF document, and `downloadTemplatePDF` saves that document. `createThermalReceiptPDF` uses this same path for selected designs; the legacy Original format retains its fixed generator. `utils/share-receipt.client.ts` uploads the PDF data URI through the company-authorized share endpoint before returning a PDF link. No Tax Receipt is the built-in `taxlessReceiptTemplate` variant of Tax Receipt: thermal font, matching non-table sections, a six-column table and no tax summary. It renders through the ordinary template element loop; the former separate Courier drawing branch has been removed. Its in-app preview uses the same canvas image as PDF and thermal output. Receipt download actions offer PDF; the internal standalone HTML export utility remains available.

The internal `printCommands.ts` builders retain fixed ESC/POS bills/reports and TSPL labels. Direct receipts, coupons and reports read `utils/receipt-finishing.ts`: device-local `markit-receipt-finishing` stores bottomLines (0-30, default 7) and autoCut (default true). Labels and PDF downloads do not include receipt finishing. The localhost print transport remains removed. Native Bluetooth uses the same prepared receipt/label bytes and finishing settings as WebUSB.

---

## Notifications

### `composables/useNotifications.ts` — `useNotifications()`

In-app notifications refreshed through the authenticated REST API.

**Setup:** Fetches on mount, every 30 seconds while visible, and on window focus or visibility restoration. Company/user changes abort the old request, clear prior-company results, and fetch the new scope. Late responses cannot replace the current company's notifications. Unmount cancels requests, timers and listeners. The client no longer connects to the placeholder WebSocket service; `isConnected` reflects successful API refresh.

`markAllAsRead()` captures the selected company and sender before its PATCH. It returns false on failure or a scope change, and only updates the local list when both still match after the response. Opening the notification page does not invoke this mutation automatically.

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

Refresh errors set `error` and `isConnected` without discarding previously fetched notifications. Successful refresh clears the error; sound plays only for newly received unread notifications after the initial load.

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

### `composables/useCompanyScope.ts` - Query SSR readiness

Each authenticated scope also loads current company settings, including for the active login company. Its local auth view therefore picks up another administrator's saved configuration on a new page load without rewriting the cookie. Late active-company context responses cannot replace a newer selected-company snapshot. `refreshSettings()` reloads only the local context. `useSelectedAccounts()` awaits scope readiness and reads these company-owned defaults; explicit refresh updates the login snapshot only for its own company, then refreshes the matching local context.

Company query SSR readiness: `useCompanyScope.ready` waits for accessible companies and any selected record/company context. `withCompanyRead` awaits that readiness during `onServerPrefetch`, then awaits the final SDK query key even if an earlier fetch already settled. Disabled queries are skipped so prefetch does not force an intentionally disabled read. Client query setup also needs the final company key: supplier and expense tables await scope.ready at component setup before creating observers, avoiding a narrow pending key while the payload contains only the aggregate error key. This keeps serialized Vue Query rows aligned with server-rendered rows. `app.vue` uses the relative `/api/model` endpoint; the SSR transport resolves it against the current request origin and forwards its cookie only to that app model API.

## Bugs Summary

| File | Bug |
|---|---|
| `composables/aws.ts` | Worker URL and upload secret hardcoded in source |
| `composables/firebase.ts` | Firebase API key and appId hardcoded in source |
| `composables/usePushNotifications.ts` | VAPID key hardcoded in source |
| `composables/getTax.ts` | `id` param accepted but ignored; fetches `/api/gettax/` regardless |
| `composables/date.ts` | `console.error` after `return ''` in catch — unreachable code |

SSR query waits use refetch with cancelRefetch:false rather than Vue Query suspense. The suspense options watcher can survive its settled promise and restart a failed read when nested scope references refresh, leaving the query pending at payload capture. The scoped adapter compares initial/final query hashes, preserves fresh completed reads, and awaits pending or changed-key reads without canceling their in-flight request. The raw expense list also awaits its pending read through refetch.
