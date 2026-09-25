# Storetools — Plugins, Middleware, Services, Stores, Types, Utils

All internal modules at the root of `storetools/` (excluding `composables/`, `components/`, `pages/`, `lib/`).

---

## Middleware

Nuxt route middleware. Both are `.global.ts` — run on every navigation.

### `middleware/authority.global.ts`

**Effectively empty.** Returns immediately for all routes — no navigation guard logic. The `/cleanup` access control was moved entirely into `pages/cleanup.vue`. See that page for current access control implementation.

**Bug (still present):** ~~`console.log('Session:', session)`~~ — no longer fires (guard body removed), but check the page-level implementation for any remaining console.log usage.

### `middleware/lastRoute.global.ts`

Saves `to.fullPath` to `localStorage('lastRoute')` on every client-side navigation. Used to restore the last visited page (e.g. after login redirect).

---

## Plugins

### `plugins/socket.client.ts` — `$socket`

Creates a Socket.io client connection to `config.public.serverUrl` (`withCredentials: true`).

Watches `session.companyId` (immediate) and emits `joinCompany` to enter the seller's room when companyId becomes available.
Also re-emits `joinCompany` on socket `connect` so reconnects do not fall out of the room.

Provides: `nuxtApp.$socket` — used in `useBillEvents`, `useCheckoutEvents` composables.


### `plugins/pinia.client.ts` — Pinia persistence

Adds `pinia-plugin-persistedstate` to the Pinia instance. Enables `persist:` option in store definitions. Required for `useCartStore`, `useLikeStore`, `useUserStore` to persist across page reloads.

### `plugins/razorpay.client.ts` — `$razorpay`

Provides `nuxtApp.$razorpay.load()` — lazy-loads the Razorpay checkout JS from CDN (`https://checkout.razorpay.com/v1/checkout.js`). Idempotent — skips if already loaded. Used in store frontend checkout flow.

### `plugins/register-sw.client.ts` — Service Worker

Registers `/sw.js` as the app's Service Worker (enables PWA features, background push, offline caching).

### `plugins/vue-query.ts` — TanStack Vue Query

Installs `VueQueryPlugin` globally with a shared `QueryClient`. Default `staleTime`: 5 minutes (`1000 * 60 * 5`).

### `plugins/vue-tel-input.client.ts` — Phone input component

Globally registers the `vue-tel-input` component (international phone number input with flag + dial code). Imports its CSS from `node_modules`.

### `plugins/network-watcher.client.ts` — Offline detection

Detects network connectivity changes and redirects:
- **Offline:** saves current path to `localStorage('prevRoute')`, navigates to `/nonetwork`
- **Online:** restores `prevRoute` from localStorage, navigates back

Platform-aware:
- **Native (Capacitor):** uses `@capacitor/network` `Network.addListener('networkStatusChange')`
- **Web:** uses `window.addEventListener('offline'/'online')`

Also checks initial state on mount.

**Bug:** `console.log` on plugin init (debug messages left in).

### PGlite plugin — removed

The former `plugins/pglite.client.ts` file was moved out of active source in the 2026-06-15 cleanup. The protected local-first composables remain untouched, but no PGlite plugin is registered in active storetools code.

---

## Services

### `services/companyService.ts`

Fully commented out — dead code. Was: Prisma-based `getUserCompanies(userId)` fetching companies with users, products, and categories. No active code.

### `services/shopifyService.ts`

Shopify Admin API integration. Exports `{ createProduct }`.

`createProduct(productData)` — `POST` to `https://bazaartests.myshopify.com/admin/api/2024-01/products.json` with Shopify Admin access token.

**Bugs:**
- Shopify store URL hardcoded: `bazaartests.myshopify.com` (test store)
- `ACCESS_TOKEN` read at module import time (`useAuth().session.value?.shopifyAccessToken`) — will be `undefined` before session is loaded

---

## Stores (Pinia)

### `stores/billStore.ts` — `useBillStore`

Minimal reactive signal store. State: `{ lastUpdate: Date.now() }`. Action: `notifyUpdate()` sets `lastUpdate` to current timestamp.

Used by `useBillEvents` composable to trigger bill list re-fetch after a `bill:success` Socket.io event.

Not persisted.

### `stores/checkoutStore.ts` — `useCheckoutStore`

Identical pattern to `billStore`. State: `{ lastUpdate: Date.now() }`. Action: `notifyUpdate()`.

Used by `useCheckoutEvents` composable to trigger order list update after a `checkout:success` Socket.io event.

Not persisted.

### `stores/cartStore.ts` — `useCartStore`

Full shopping cart for the store frontend (customer-facing e-commerce). Composition API store.

**Persisted fields:** `items`, `companyId`, `sessionId`, `lastSynced`

**State:**
- `items: CartItem[]` — current cart items
- `companyId: string` — active company (cart is single-company; switching company clears items)
- `sessionId: string` — client ID (set after login; used for server sync)
- `lastSynced: number` — timestamp of last successful server sync
- `isLoading: boolean`

**Computed:**
- `cartItemCount` — sum of all `item.qty`
- `cartItems` — alias for `items`
- `cartCompanyId` — alias for `companyId`
- `isSynced` — true if synced within last 5 minutes

**Actions:**

| Action | Description |
|---|---|
| `addToCart(item, companyId, sessionId?)` | Adds item or increments qty if same `variantId+size`. Clears cart if different company. Syncs to server if `sessionId` set. |
| `removeFromCart(item)` | Removes by `variantId+size`. Syncs to server. |
| `clearCart()` | Resets all state. |
| `fetchCart(companyId, sessionId)` | Fetches `GET /api/cart/get?companyId=&clientId=&includeVariant=true`. |
| `_mergeWithServerCart(sessionId, companyId)` | `POST /api/cart/merge` — merges guest (local) items with server cart after login. |

Server sync: `POST /api/cart/update` with `{ companyId, clientId, items }`.

### `stores/likeStore.ts` — `useLikeStore`

Wishlist for the store frontend. Same pattern as `cartStore`.

**Persisted fields:** `liked`, `companyId`, `sessionId`, `lastSynced`

**State:** `liked: LikedProduct[]`, `companyId`, `sessionId`, `lastSynced`, `isLoading`

**Computed:** `likedCount`, `likedItems`, `isSynced`, `isLiked(product)` (returns boolean)

**Actions:**

| Action | Description |
|---|---|
| `toggleLike(product, companyId, sessionId?)` | Adds or removes from `liked`. Returns `true` if newly liked. |
| `removeLike(product)` | Removes by `variantId`. |
| `clearLikes()` | Resets all state. |
| `fetchLikes(companyId, sessionId)` | `GET /api/like/get?companyId=&clientId=&includeVariant=true` |
| `_mergeWithServerLikes(sessionId, companyId)` | `POST /api/like/merge` — merges guest likes after login |

Server sync: `POST /api/like/update` with `{ companyId, clientId, items }`.

**Bug:** In `clearLikes()`, `sessionId.value = ''` is set before `if (sessionId.value)` check — sync is never called on clear.

### `stores/category.ts` — `useCategoryStore`

Fetches and caches company categories. Not persisted.

- `fetchCategories()` / `refreshCategories()` — `GET /api/gettax`
- `getCategoryById(id)` — find by `id`
- `getCategoryByShortCut(shortCut)` — find by `shortCut`

State: `categories`, `loading`, `error`

### `stores/user.ts` — `useUserStore`

Fetches and caches company users/staff. **Persisted** (`users` key).

- `fetchUsers(companyId)` / `refreshUsers(companyId)` — `GET {prismaUrl}/api/getuser?companyId=`
- `getuserById(id)` — find by `id`
- `getuserByCode(code)` — find by `code`

State: `users: ProcessedUser[]` (`{ id, email, code?, name?, image? }`), `loading`, `error`

**Bug:** Calls `GET /api/getuser` which has no auth check (see consolidated bug index).

### `stores/messageStore.ts` — `useMessageStore`

CRM/messaging context store. Holds the currently selected message for reply/edit/delete UI operations. Options API store.

State shape mirrors the `Message` type: `id`, `createdAt`, `updatedAt`, `conversationId`, `senderId`, `text`, `seen[]`, plus optional `reply`, `edit`, `delete` flags.

Actions:
- `addToreply(message)` — patches state with message + `reply: true`
- `addToEdit(message)` — patches state + `edit: true`
- `addToDelete(message)` — patches state + `delete: true`
- `clear()` — resets to empty state

Supports HMR via `acceptHMRUpdate`.

**Bugs:**
- `console.log(this.$state)` in `addToEdit` and `addToDelete`
- Method name typo: `addToreply` (lowercase 'r' — should be `addToReply`)

---

## Types

### `types/index.d.ts` — Main shared types

Core app-wide types. Imported as `from '~/types'`.

| Type | Shape |
|---|---|
| `UserStatus` | `'subscribed' \| 'unsubscribed' \| 'bounced'` |
| `User` | `{ id, name, email, avatar?, status, location }` — Nuxt UI template stub |
| `Mail` | `{ id, unread?, from: User, subject, body, date }` — Nuxt UI template stub |
| `Member` | `{ name, username, role: 'member'\|'owner', avatar }` |
| `Notification` | `{ id, unread?, sender: User, body, date }` — Nuxt UI stub (not app notifications) |
| `Period` | `'daily' \| 'weekly' \| 'monthly'` |
| `Range` | `{ start: Date, end: Date }` |
| `CartState` | `{ items, companyId, isLoading, sessionId, lastSynced, isHydrated }` |
| `CartItem` | `{ variantId, size: string\|null, qty }` |
| `LikedProduct` | `{ variantId: string }` |
| `LikeState` | `{ liked, companyId, isLoading, sessionId, lastSynced, isHydrated }` |
| `Message` | `{ id, createdAt, updatedAt, conversationId, senderId, text, seen[], reply?, edit?, delete? }` |

Note: `CartItem` here differs from `types/cart.ts` CartItem (this one omits `name` and `price`).

### `types/cart.ts` — Cart-specific types

| Type | Shape |
|---|---|
| `CartItem` | `{ variantId, size: string\|null, qty, name, price }` — extended version (includes name + price) |
| `CartState` | `{ items: CartItem[], companyId }` |
| `CartFetchResponse` | `{ items: CartItem[] }` — response from `/api/cart/get` |

### `types/notification.ts` — Notification system types

| Export | Description |
|---|---|
| `NOTIFICATION_TYPES` | `const` array of 7 type strings |
| `NotificationType` | Union of `NOTIFICATION_TYPES` members |
| `NotificationFilter` | `NotificationType \| 'all' \| 'unread'` |
| `AppNotification` | `{ id, companyId, userId?, clientId?, type, title, message, read, actionPath?, metadata?, createdAt }` |
| `NotificationConfig` | `{ icon: string, color: string, label: string }` |
| `NotificationConfigs` | `Record<NotificationType, NotificationConfig>` |

Notification types: `ORDER_RECEIVED`, `BILL_CREATED`, `PAYMENT_RECEIVED`, `EXPENSE_CREATED`, `INVENTORY_LOW`, `SHIPMENT_SENT`, `SYSTEM_ALERT`

### `types/dashboard.ts` — Dashboard types

| Type | Description |
|---|---|
| `BillWithRelations` | `Bill` + `client?`, `address?`, `entries?: EntryWithRelations[]` |
| `EntryWithRelations` | `Entry` + `variant?`, `category?`, `bill?` |
| `DashboardComposable` | Full interface for `useCompanyDashboard()` return value |
| `KpiItem` | `{ KPI: string, Value: string \| number }` — used in PDF generation |
| `PdfReportMeta` | `{ companyName, logoUrl?, dateRange, reportTitle?, generatedAt? }` |

### `types/store.ts` — Prisma extended types

| Type | Description |
|---|---|
| `ProductWithVariants` | `Product & { variants, company, category? }` |
| `CategoryWithProducts` | `Category & { products: ProductWithVariants[] }` |
| `VariantWithProduct` | `Variant & { product: ProductWithVariants, items: Item[] }` |
| `WishlistVariant` | `Variant & { sprice, dprice, discount, images, product, availableQty, isOutOfStock, mainImage }` |

### NuxtApp PGlite augmentation — removed

The former `types/nuxt.d.ts` ElectricSQL augmentation was moved out of active source in the 2026-06-15 cleanup. Active Nuxt app types no longer declare `$db` or `$sync`.

---

## Utils

### `utils/dates.ts` — `formatRelativeTime(dateString)`

Human-readable relative timestamp:
- `< 60s` → `'Just now'`
- `< 1h` → `'Xm ago'`
- `< 24h` → `'Xh ago'`
- `< 7d` → `'Xd ago'`
- `older` → locale short date (e.g. `'Jun 5'`, adds year if different)

### `utils/export-csv.ts` — `exportToCSV(data, filename?)`

Converts an array of objects to CSV and triggers browser download.
- Auto-generates headers from `Object.keys(data[0])`
- Escapes double quotes in values
- Default filename: `'report.csv'`

### `utils/export-pdf.client.ts` — `exportToPDF(data, filename?, title?)`

Generic table PDF export. Client-only (SSR guard).
- Lazy-imports `jspdf` + `jspdf-autotable`
- Single table: keys as headers, values as rows
- Default filename: `'report.pdf'`

### `utils/generate-sales-report-pdf.client.ts` — `generateSalesReportPDF(kpis, bills, meta, filename?)`

Formatted sales report PDF. Client-only. Uses `KpiItem`, `BillWithRelations`, `PdfReportMeta` from `types/dashboard.ts`.

**Layout:**
1. Header: title, company name, date range, generated date
2. KPI table (`theme: 'grid'`, indigo header)
3. Bills table: Invoice, Date, Client, Subtotal, Tax, Discount, Total (slate header)
4. Per-page footer: company name + page number

Uses `Rs ` as currency symbol (not ₹).

### `utils/thermal-receipt.client.ts` — `generateThermalReceiptPDF(data, filename?)`

127mm-wide thermal-style receipt PDF. Client-only. Uses `jspdf` (sync import, not lazy).

**Dynamic height:** calculates exact page height based on item count + wrapped description text before creating the document.

**Layout sections:**
- Header: company name (bold 14pt), address lines, GSTIN
- Bill info: invoice number, date, payment method, client name/phone (if present)
- Item table: SL / DESCRIPTION / QTY / MRP / TAX / DISC / HSN / T.VALUE
- Totals row + DISC/ROUND OFF line
- Grand total (bold 16pt)
- Savings box (bordered rectangle)
- Footer: thank you note, return policy, refund policy, customer care phone

Used by: `components/ThermalReceipt.vue` (web print) and `usePrintBill` (web fallback path via print server).

### `utils/routeHelper.ts` — `formatStoreRoute(company, path?)`

Builds store frontend URLs: `/store/{company}/{path}`. Strips leading/trailing slashes from both parts. Handles array `company` param (takes `[0]`).

```ts
formatStoreRoute('my-shop', 'products/123')
// → '/store/my-shop/products/123'
```

---

## Bugs

| File | Bug |
|---|---|
| `middleware/authority.global.ts` | ~~Guard logic~~ **MOVED** — middleware now returns early for all routes; `/cleanup` access control is in-page |
| `plugins/socket.client.ts` | Re-joins `company:{companyId}` on socket reconnect |
| `services/shopifyService.ts` | Shopify store URL hardcoded to test store `bazaartests.myshopify.com` |
| `services/shopifyService.ts` | `ACCESS_TOKEN` read at module init — always `undefined` before session loads |
| `stores/likeStore.ts` | `clearLikes` sets `sessionId.value = ''` before checking `if (sessionId.value)` — server sync never called on clear |
| `stores/messageStore.ts` | `console.log(this.$state)` in `addToEdit` and `addToDelete` |
| `stores/messageStore.ts` | Method name typo: `addToreply` should be `addToReply` |
