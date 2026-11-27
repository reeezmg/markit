# Storetools Composables

## Company sidebar preferences

`useSidebarPreferences` owns shared company-keyed navigation choices for layout and Settings → Sidebar. Request generations and save revisions protect against stale GET responses; branch saves never replace login-company values. It uses the request fetcher during SSR and calls the authenticated sidebar-navigation settings API. See `ARCH-sidebar-navigation.md`.


All custom composables and lib utilities in `storetools/composables/` and `storetools/lib/api/`.

**Note:** `storetools/lib/hooks/` contains ZenStack auto-generated hooks (e.g., `useFindManyProduct`, `useCreateBill`) — see `ARCH-patterns.md` for the hooks pattern.

`useAfterSalesSearch(query, load)` debounces configuration, customer-product and service-item
server searches by 300 ms while tables filter their current rows immediately. It cancels
the pending timer on unmount; owning pages reject stale responses and retain company scope.
See `ARCH-after-sales.md` for the table and side-panel workflow.

`useBillingSerialNumbers(items, clientId, enabled, companyId, fetcher)` owns billing and bill edit's
row unit-details modal. Serials, delivery/installation dates and stable line keys live on existing draft
rows, while `serviceUnits` maps covered lines/units to the existing save payload.
Coverage/return reads reject stale company/client responses; saves wait for the
current read. Quantity reductions and product replacement prune obsolete serials.
Disabled after-sales performs no service reads and excludes serial metadata from
registration payloads, retaining draft values. `Billing/SerialNumbers.vue` renders
the icon next to Delete and stages modal edits separately until Confirm. It captures
details per covered unit or the row's exact-return-unit selector.

`useAfterSalesFeature(companyIds, fetcher?)` reads company-scoped workflow preferences
and shares the company-keyed state/revisions with `useSalesWorkflow`. `enabled` applies
to one owning company; `isEnabled(id)` handles rows in mixed-company tables. Missing
settings or failed reads hide optional inputs. SSR awaits its initial read. Scope
changes, saves and component disposal reject stale responses. It controls product,
invoice, client/order, numbering, ecommerce-return and dedicated workspace UI; hiding
an editor preserves its stored service fields.

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

Platform dispatcher: the native mobile app uses the selected Bluetooth printer; web uses assigned WebUSB devices from Settings > Printer. Sheet receipt templates (A4/A5/Letter) are resolved before printer assignment checks and use the system print dialog via `printSheetReceipt`; thermal jobs keep the device transports. There is no localhost service or automatic device chooser. `printBill` preserves explicit design overrides; otherwise `useWebUsbPrinter` loads the company default. Product label calls use the same shared default loader.

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
- Print flow opens the device, selects a configuration, chooses a bulk `out` endpoint (printer-class interfaces first, then vendor-class, then other bulk interfaces), claims its interface and explicitly selects its alternate setting, including zero. Interrupt/status endpoints are excluded. It writes bytes with `transferOut()`, then releases/closes the device; alternate-selection failures also release the claim.
- Transfer failures report the device name, interface/endpoint, confirmed byte count and original USB error, with paper/cover/error-light, competing-app and reconnect checks. A failed chunk may have reached the printer even if no bytes were confirmed; jobs are never automatically replayed. `tests/print-label-routing.test.ts` covers endpoint selection, vendor-class support, short/stalled/rejected writes and cleanup. These mocked checks do not establish the cause of a physical printer failure.

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

Company designs use `utils/load-print-template.client.ts` (company-scoped persistent cache first, fetching only when missing/invalid; Printer Settings load and successful saves refresh the cache). `utils/print-template-renderer.client.ts` defaults to monochrome print rendering for thermal PDF and raster commands. The editing workspace always requests `{ mode: 'design' }` to retain colour, without a Thermal preview toggle. Both editing and printing draw the configured font family/weight/style into the canvas; printer commands send raster pixels and do not substitute device fonts. Page fonts accept the six named designer families as well as legacy `sans`/`thermal` values. An explicit text or table font uses its natural proportions and normal line-height default, overriding legacy thermal compression. Layers using Page font retain the selected page typography. Receipt preview, downloads, shared WhatsApp PDFs and USB/Bluetooth preparation consume the same receipt canvas; a supplied receipt `printTemplate` takes precedence over cached defaults. Both modes use identical measured geometry, and packing the colour render produces the same thermal bytes. Sheet receipts retain colour in either mode. `usePrint` and WebUSB methods accept optional unsaved design overrides for test prints. Receipts use ESC/POS; labels use TSPL BITMAP or CPCL CG according to device-local `markit-label-printer-language` (default TSPL). CPCL uses raw binary graphic data followed by FORM/PRINT, as documented in Zebra's CPCL programming guide.

Fixed receipt builders are used only when no receipt design is selected. Selected receipt and label designs never fall back to another layout or device font: rendering, barcode and enrichment errors abort preparation before transmission, preserving layout consistency. Editor tests surface the same failures. The native TSPL label builder is used only when no label design is selected. CPCL requires a selected design. Default-loading and label-enrichment errors are surfaced. All jobs are prepared before USB transmission; failed or incomplete transfers never retry using another format. USB writes use 4096-byte chunks and check status and bytes written.

TSPL raster jobs explicitly emit `DIRECTION 1,0`, `REFERENCE 0,0` and `SHIFT 0,0` before `CLS`/`BITMAP 0,0`. The full canvas, including white left/right margins, is packed without trimming or extra padding. Resetting job placement prevents remembered TSPL reference/shift settings from moving a correctly rendered label to an edge. These are standard commands described in the [TSC TSPL/TSPL2 manual](https://fs.tscprinters.com/system/files/31-0000001-00_tspl_tspl2_programming_3_0.pdf), REFERENCE and SHIFT sections. Unit checks cover an earlier negative printer shift and 2 mm blank margins at 203/300 DPI; browser checks verify the actual starter bitmap margin and exact payload parity. They do not establish a physical printer's media alignment or calibration. CPCL continues to use the complete canvas in `CG` at 0,0.

`utils/print-codes.ts` defines the supported barcode format values and matching editor labels/hints. Optional element `barcodeFormat` selects Code 128, Code 39, EAN-13, EAN-8, UPC-A or ITF-14; `barcodeDisplayValue` controls readable barcode text. The raster renderer passes both to the installed JsBarcode encoder and converts invalid values into format-specific errors. Old elements omit these fields and retain Code 128 with readable text. QR elements continue through the existing QR renderer; manual values and linked `receiptUpiPayment` resolve through `printElementValue`, including existing payment/balance rules. Editor code-type changes do not change the data source or geometry. Preview/PDF/ESC-POS/TSPL/CPCL share the same generated code pixels.

Printer designs also accept nested frame/shape elements and optional presentation properties in their version-1 JSON. Linked text/barcode/QR elements optionally store `suffix` after the existing `text` prefix; `printElementValue` applies both to the resolved field for inspector preview, static snapshots and raster output. Missing field data omits both affixes, while numeric zero remains printable. Conditional `whenField` visibility ignores empty/whitespace-only values and omitted flowing receipt layers consume no spacing. The shared raster loop resolves parent-relative positions, inherited visibility, rotation, font/appearance and image fitting before PDF/ESC-POS/TSPL/CPCL conversion. `designer-presentation.ts` shares optional font weight, letter-spacing units, vertical text alignment, auto width/height versus fixed boxes, aspect-lock and fill visibility/opacity with the DOM editor. Text measurement uses resolved live values; measured auto bounds replace stale fallback dimensions for label/frame/page overflow checks. Optional per-corner `cornerRadii` overrides scalar `radius`; unified `padding` or per-side `paddingSides` insets text, image/code and table content. Explicit side/corner zero remains valid. Text wrapping and automatic dimensions include padding; flowing receipt heights and subsequent sections include top/bottom padding once. Padding that leaves no content width or no height in a fixed box is rejected; rounded image clipping uses the outer box. Manually positioned frame children retain their parent-relative coordinates. Up to eight solid fills compose in display order in both renderers. Text `backgroundOpacity` and `backgroundVisible` independently control the existing background colour. Backgrounds cover the full wrapped text height. Empty receipt text with an enabled explicit background or stroke renders that box and advances flow; empty unpainted text still collapses. `whenField`/layer visibility can hide the whole box. Empty text does not measure or draw a blank glyph line, so configured dimensions are retained even with large fonts. Optional `emptyBounds` metadata supplies accurate selection geometry for collapsed text without affecting print layout or consuming receipt space. Legacy inverse text rendering is retained until a paint edit converts the layer to explicit white Fill/black Background (or the user's chosen colours); opening the editor alone does not change saved output. Text Fill opacity affects glyph ink independently of Background, layer opacity and Stroke. Non-text Fill paints the layer interior; table fills cover the full measured growing table without recolouring/hiding its text, and line fills paint the rule itself rather than its bounding box. Explicit transparent shape fills do not restore the legacy grey fallback. Stroke is inset inside the layer bounds and follows ellipse geometry for ellipse shapes. Monochrome conversion applies in print mode, while design mode preserves the configured colours and alpha for editing. Receipt root sections flow by default; explicitly fixed layers stay outside that flow. Optional version-1 `margin`/`marginSides` store outside spacing in CSS top/right/bottom/left order (-300 to 300 mm). `printElementMargins` falls back to `gapBefore`/`gapAfter` (0/1 mm) only for old root receipt flow; fixed and nested layers default to zero margins. Explicit margins override legacy gaps once, without doubling spacing. Numeric Y and dragging adjust the top margin while following growing tables. Left/top margins offset the border box, right/bottom margins reserve outside space, and box dimensions exclude those margins. Validation and automatic text bounds include outside spacing. Label canvases keep their physical height; receipt canvases extend white space to include bottom margins. Raster positions clamp at the paper top. Receipt cropping includes the transformed corners of every visible layer, including nested rotated layers; appended notes retain the furthest transformed flowing section bottom when layers overlap. The routed editor uses the same renderer's bitmap and measured bounds for shared canvas hit boxes, preserving output parity. `printLayerLocalBox` derives exact parent-relative grouping geometry from raster bounds, accounting for ancestor transforms and the printer frame border-box origin instead of DOM pixel rounding. Group moves retain stored dimensions and children; `printFrameMoveSize` can repair at most 0.5 mm of legacy frame undersizing without weakening schema containment checks.

Shared designer conditions use `utils/designer-rules.ts` for typed, bounded declarative rules; `effectivePrintElement` adapts legacy printer conditions and evaluates current print data before raster measurement, flow and drawing. Conditions never mutate the saved layer. Matching paint/font actions affect measured output; hidden frames hide descendants and hidden receipt sections consume no flow space. `loadLabelVariables` also discovers related fields used only in rule comparisons. Quotes/sales orders share this evaluator through `Quotes/Document.vue` and `QuoteLayer.vue`, using original numeric totals/row quantities from `quoteDocumentRuleValues`/`quoteItemRuleValues` independently of display formatting.

Custom receipt table columns use `utils/receipt-table.ts` for row-variable resolution and `utils/load-receipt-table.client.ts` for related catalogue lookup. Items (`columns`) and Tax summary (`taxColumns`) use one configured-table renderer, including headings, relative widths, layout lines, wrapping, typography, minimum heights, padding, borders, rules and totals. Tax rows come from `receiptSummary(data).tax` and expose rate/SGST/CGST/total; tax amount cells and numeric totals use two decimals. Item-related product/variant/item relations still load through the company-scoped label-variable API; billed row values stay separate from catalogue values. Shared receipt data pre-resolves only configured `receiptTableValues`, so public viewers need no private catalogue request. Manual entries without linked products leave related fields blank. Legacy items/tax summaries without explicit source columns retain their old renderer for saved-design compatibility.

The tool-based Classic Tax Receipt preset uses `utils/receipt-summary.ts` for discount/savings and rate-grouped tax amounts, following existing thermal tax-inclusive/exclusive behavior. `tableColumnLines` partitions table columns by layout line and `tableColumnTotal` sums configured billed values; both header and item cells use the same per-line geometry. The default uses ordinary linked/manual text, lines, Items/Tax tables, margins, colours and QR layers; its tax title is a separate editable Text layer. `receiptTaxGroups` supplies the normal available-data condition for the heading/table/rule. `upgradeReceiptToolTemplate` converts recognized old starter copies only in the editable local draft, with one Undo step and explicit Save. `fontFamily: thermal` uses condensed Consolas/Liberation Mono fallback. Built-in and editable copies use the normal raster/PDF renderer, including earned coupons. `renderedTemplatePDF` embeds an already rendered canvas in a PDF (sheet receipts are sliced at row/section boundaries into physical A4/A5/Letter pages without dropping pixels), `createTemplatePDF` renders then returns a reusable PDF document, and `downloadTemplatePDF` saves that document. `createThermalReceiptPDF` uses this same path for selected designs; the legacy Original format retains its fixed generator. `utils/share-receipt.client.ts` uploads the PDF data URI through the company-authorized share endpoint before returning a PDF link. No Tax Receipt is the built-in `taxlessReceiptTemplate` variant of Tax Receipt: thermal font, matching non-table sections, a six-column table and no tax summary. It renders through the ordinary template element loop; the former separate Courier drawing branch has been removed. Its in-app preview uses the same canvas image as PDF and thermal output. Receipt download actions offer PDF; the internal standalone HTML export utility remains available.

The internal `printCommands.ts` builders retain fixed ESC/POS bills/reports and TSPL labels. Direct receipts, coupons and reports read `utils/receipt-finishing.ts`: device-local `markit-receipt-finishing` stores bottomLines (0-30, default 7) and autoCut (default true). Labels and PDF downloads do not include receipt finishing. The localhost print transport remains removed. Native Bluetooth uses the same prepared receipt/label bytes and finishing settings as WebUSB.

`test:print-templates` includes mocked saved-receipt data parity checks for returns,
discounts/adjustments, sizes, units, redemption and invoice footers.
`test:print-template-browser` also renders Pay now and Invoice fixtures with tax/no-tax
designs, checks footer placement and long-note growth, prepares printer bytes and
checks PDF dimensions. Transport tests mock USB/Bluetooth; these checks do not send
a physical printer job or modify database records.

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

The default layout explicitly imports this composable. Development Vite warmup is disabled in `nuxt.config.ts`: precompiling the layout and shared UI components during startup can cache modules before Nuxt's auto-import registry is populated, leaving references such as `useDashboard` or UI's `useUI` unresolved. Affected pages can render their shell but fail client initialization, preventing sidebar interaction. Restart the development server after changing this configuration; existing cached modules must be rebuilt. `tests/composable-tree-shake-config.test.ts` guards the empty warmup list alongside the composable tree-shaking configuration.

Manages:
- `isHelpSlideoverOpen: Ref<boolean>`
- `isNotificationsSlideoverOpen: Ref<boolean>`
- `isChatSlideoverOpen: Ref<boolean>`
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
| `c-b` | Toggle ChatSlideover |

Closes help, notifications and chat slideovers on route change.

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

The eager readiness promise has an immediate rejection observer so callers that only use scoped requests do not produce an unhandled rejection when context loading fails. `ready` still rejects for awaiting callers; authorization failures are not converted into successful readiness.

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
