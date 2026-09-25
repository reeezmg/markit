# storetools — Shared Components Reference

All components are in `storetools/components/`. This file covers components not documented inline in the pages topic files.

---

## Global / Layout Components

### `UserDropdown.vue`
Seller-side account dropdown rendered in the sidebar footer.
- **Auth:** `useNuxtApp().$auth` (seller session)
- **Logout:** deletes FCM token (browser only via `firebase/messaging`), then calls `authLogout()`
- **Menu items:** Settings (`/settings`), Help & Support (opens `isHelpSlideoverOpen`), Sign out
- **Avatar:** `https://images.markit.co.in/{session.image}`
- Used in: `default.vue` layout

### `ClientDropdown.vue`
Customer-side account dropdown for the store frontend (`store` layout).
- **Auth:** `useNuxtApp().$authClient` (customer session)
- **Avatar:** DiceBear generated — random style from 9 options, seeded by client name, regenerated each render (no persistence)
- **Menu items:** View Profile (opens avatar modal inline), Help & Support, Sign out
- **Logout:** calls `authClientLogout()` + `cartStore.clearCart()`
- **Avatar modal:** shows client name/phone, `UAvatar` large version
- Used in: `store` layout

### `TeamsDropdown.vue`
Company switcher in the sidebar — lets a user with multiple companies switch between them.
- **Data:** `useFindUniqueUser` — fetches all `CompanyUser` records with their companies (including `productinput`, `variantinput`)
- **Switch company:** calls `updateCompanySession(...)` with full company config using **object syntax**, then `window.location.reload()` (50ms delay). On native (Capacitor): shows `SplashScreen` before reload
- **Company fields sent:** logo, description, thankYouNote, refundPolicy, returnPolicy, companyPhone, commissionRate, printerLabelSize, code, storeUniqueName, isTaxIncluded, isAiImage, all delivery config fields, isCostIncluded, isUserTrackIncluded, companyId, companyType, companyName, pipelineId, role, pointsValue, currency, type, address, openTime, closeTime, gstin, accHolderName, ifsc, accountNo, bankName, upiId, plan, productInputs, variantInputs
- **User fields NOT sent (preserved via session merge):** `id`, `name`, `image`, `cleanup`, `cleanupCode`, `email`
- **Admin only:** "Create company" action appears only for `session.role === 'admin'` — opens `CreateCompany.vue` modal
- Used in: `default.vue` layout

### `CreateCompany.vue`
Modal to create a new company for the logged-in user.
- **Hook:** `useCreateCompany` — creates `Company` + links current user as `CompanyUser`
- **Fields:** company name, type (buyer/seller)
- **After create:** calls `updateCompanySession({ id: res?.id, companyType: res?.type, companyName: res?.name })` (object syntax) → `router.push('/}')` (**Bug:** typo in route — `/}` instead of `/`)
- Used in: `TeamsDropdown.vue`

### `NotificationIcon.vue`
Bell icon with unread badge in the navbar. Opens a popover with notifications inline.
- **Data:** `useNotifications()` composable — `notifications`, `unreadCount`, `markAsRead`, `markAllAsRead`, `typeConfigs`, `getAction`, `isLoading`, `isConnected`
- **Role filter:** non-admin users cannot see `BILL_CREATED` notifications
- **Filter bar:** shown only if `availableFilters.length > 2`; filters by type or `all`/`unread`
- **Notification row:** icon (from `typeConfigs`), title, message (expands on hover), relative time, action button
- **Connection indicator:** red pulsing dot when `!isConnected`
- **"View all":** closes popover, opens `NotificationsSlideover`
- **Bug:** `console.log(session?.role)` fires on component mount
- Used in: `default.vue` layout, `landing.vue` (wrapped in `<ClientOnly>`)

### `NotificationsSlideover.vue`
Full notification list in a `UDashboardSlideover`.
- **Data:** same `useNotifications()` composable
- **Click:** marks as read + navigates to `notification.actionPath` if present
- **Re-render key:** `notificationsVersion` increments when `notifications.length` changes — forces full re-render of list
- Used in: `NotificationIcon.vue` (triggered via `isNotificationsSlideoverOpen`)

### `HelpSlideover.vue`
Not read — assumed to be a Nuxt UI starter template stub (triggered by `isHelpSlideoverOpen` from `useDashboard()`).

---

## Print / Barcode Components

### `ThermalReceipt.vue`
Renders a thermal receipt for printing. Used by `pages/receipt/[id].vue` and the `usePrint` composable.
- **Props:** `data: any` — receipt payload from `GET /api/billSale/receipt`
- **Layout:** 90mm wide, monospace font, dashed borders — matches typical 80mm thermal paper
- **Sections:** store name + address + GSTIN, invoice info + client, line items table (SL/Description/QTY/MRP/DISC/VALUE) with an optional UNIT column when the selected billing units include more than one value, totals row, round-off, GRAND TOTAL, savings box, footer (thankYouNote, returnPolicy, refundPolicy, phone). HSN and tax render as compact metadata below the description.
- Product descriptions stay on one line and use CSS ellipsis when they exceed the description column. The item rows and totals use the same six-column grid (seven with UNIT), right-aligned tabular numeric cells, and totals map directly beneath QTY/MRP/DISC/VALUE.
- **Print CSS:** removes border + scale transform during `@media print`
- **Bug:** `console.log('Receipt data:', props.data)` fires on every render

### `BarcodeComponent.vue`
Displays a grid of barcode labels with product info. Used for barcode preview/display (not print).
- **Props:** `barcodes: BarcodeItem[]` — `{ barcode, productName, variantName, sprice, color?, size? }`
- **Library:** `jsbarcode` — CODE128 format, SVG output, width=2, height=50
- **Each label:** barcode SVG + product name + variant name + color/size + price (displayed as `$` — **Bug:** should be `₹`)
- Barcodes regenerated on `watch(barcodes, ..., { deep: true })`

### `PrintBarcodeComponent.vue`
Print-ready barcode label sheet. Triggers `window.print()` automatically on `onMounted`.
- **Props:** `barcodes: BarcodeItem[]` — `{ barcode, productName, variantName?, price, color?, size? }`
- **Print layout:** each label is 2in × 2in, `page-break-after: always`, `@page { size: 2in 2in; margin: 0 }`
- **Library:** `jsbarcode` — CODE128, width=1.5, height=40
- **Auto-print:** `printLabels()` called in `onMounted` with 500ms delay (waits for barcode generation)
- Used in: `pages/products/edit/[id].vue` barcode print modal

---

## Dashboard Components

All dashboard components use the `useCompanyDashboard()` composable from `lib/api/useDashboardData` for their data. None make direct ZenStack hook or API calls.

### `DashboardCards.vue`
Top-level dashboard card grid — renders KPI cards + supplementary panels.
- **KPI cards (via `KpiCard`):** Items count, Revenue, Expenses, Profit (computed: Revenue − Expenses)
- **Low Stock panel:** lists `lowStockEntries` (items with qty below threshold) — name + qty remaining
- **Tax Collected KPI card:** `totalTaxCollected`
- **Customer Outstanding panel:** top 5 clients with unpaid bill total + count
- **Currency format:** `Intl.NumberFormat('en-IN', currency: 'INR')`

### `KpiCard.vue`
Simple metric card wrapper with icon slot, title, and value.
- Used by `DashboardCards.vue`

### `RevenueEChart.vue`
Monthly revenue bar chart using Apache ECharts (via `vue-echarts`, async-loaded, SSR disabled).
- **Data:** `useCompanyDashboard().revenueGraph` — `{ month, total }[]`
- **Chart:** vertical bar, indigo bars, `₹{value}` y-axis labels, labels on top of bars
- **Note:** first implementation is commented out (entire `<script setup>` block); active version is below the comment. Both implementations are identical — the comment was a fix for a "document not found" SSR issue.
- **Setup:** `useEChartsSetup()` called in `onMounted`

### `CategoryRevenuePie.vue`
Pie chart of revenue by category. Reusable — accepts data as prop.
- **Props:** `revenueByCategory: { name, value }[]`, optional `title`
- **Chart:** ECharts pie, 80% radius, tooltip shows `{b}: ₹{c} ({d}%)`
- **Reactive update:** `watch(revenueByCategory)` calls `chartRef.setOption({ series: [{ data: newData }] })` directly
- **Bug:** `console.log(props.revenueByCategory)` fires on every render
- Used in: `pages/reports/profit.vue`, `pages/reports/online.vue`, `pages/dashboard/index.vue`

### `billsOverTimeChart.vue`
Line chart of bill value over time (monthly).
- **Data:** `useCompanyDashboard().billsOverTime` — `{ month, total }[]`
- **Chart:** ECharts smooth line, green color, `₹{value}` y-axis

### `taxCollectedChart.vue`
Line chart of tax collected per month.
- **Data:** `useCompanyDashboard().taxByMonth` — `{ month, total }[]`
- **Chart:** ECharts smooth line, green

### `RecentBill.vue`
List of recent bills (last N transactions).
- **Data:** `useCompanyDashboard().recentTransactions` — `Bill[]`
- **Displays:** Bill ID (first 6 chars), date, grandTotal in indigo

### `TopProducts.vue`
Horizontal bar chart of top-selling products/variants.
- **Props:** `topProducts: { name, total }[]`, optional `title`
- **Chart:** ECharts horizontal bar, green bars, `name: units sold` tooltip
- Used in: `pages/dashboard/index.vue` (passed data from parent)

### `UNpaidBillSummary.vue`
Summary of unpaid bills — total amount + list of recent unpaid bills.
- **Data:** `useCompanyDashboard().totalUnpaid`, `.recentUnpaidBills`
- **Displays:** total in red, list of bill ID + grandTotal

### `Card.vue` / `RevenueChart.vue`
Not read in detail — assumed to be legacy/unused chart components superseded by the EChart versions.

---

## Store Frontend Components

### `components/products/ProductCard.vue`
Product card used in the store frontend grid (`store/[[company]]/index.vue`).
- **Props:** `index: number`, `variant: VariantWithProduct`
- **Emits:** `quick-view(variant, selectedSize)`
- **Badges:** "New" (if created within 14 days), discount % badge
- **Image carousel:** cycles through all variants of the same product via prev/next buttons
- **Size selection:** inline `UBadge` buttons; out-of-stock sizes shown struck-through + 50% opacity
- **Add to cart:** requires size selection if sizes exist — shows toast with size action buttons if size not chosen. Calls `cartStore.addToCart()`
- **Like toggle:** `likeStore.toggleLike()` — shows liked state via heart icon fill
- **Quick view:** emits `quick-view` event to parent (handled in `store/index.vue`)
- **Navigation:** clicking card navigates to `/store/{company}/products/{productId}?variant={variantId}`
- **Out of stock overlay:** semi-transparent overlay + "Out of Stock" badge

### `components/products/CartButton.vue` / `WishlistButton.vue` / `VariantCard.vue`
Not read in detail — smaller helper components for the store frontend. Likely wrapper buttons around `cartStore` and `likeStore` actions.

### `StoreBanner.vue`
Auto-rotating hero banner for the store frontend.
- **Data:** hardcoded 2 banners (Summer Collection, New Arrivals) — Unsplash images, not dynamic
- **Rotation:** `setInterval` every 5s, no cleanup on `onUnmounted` (**memory leak**)
- **Indicators:** dot buttons at bottom to jump to a specific banner
- Used in: `store/[[company]]/index.vue` (if referenced)

### `StoreCategoryCard.vue`
Category card linking to `/store/{company}/categories/{id}`.
- **Props:** `category` (with `products[]`), `company` (route param string)
- **Displays:** category image or placeholder icon, category name overlay, product count
- Used in: store frontend category grid

### `StoreSection.vue`
Simple section wrapper with a heading slot.
- **Props:** `title: string`
- **Renders:** `<h2>` + `<slot />`
- Used in: store frontend to group product grids with headings

### `EmptyCart.vue`
Empty cart state UI — shown when cart has no items.
- Static card with "Your Cart is Empty" message and "Return to Home" button (`to="./"`)
- Used in: store checkout or cart page

---

## Checkout Components (Store Frontend)

### `components/Checkout/login.vue`
Customer login/register form for the store frontend checkout.
- **Auth:** Firebase phone OTP (`signInWithPhoneNumber` + `RecaptchaVerifier`)
- **Flow:**
  1. Enter phone → "Send OTP" → Firebase sends SMS → shows OTP input
  2. If new client: also shows name + email fields
  3. On OTP verify → `confirmationResult.confirm(otp)` → then `login()`
- **`login()` flow:**
  1. Create `Client` if not found (with name + optional email)
  2. Link to company via `UpdateClient` if not already linked
  3. `authClientLogin(phone)` — sets client session
  4. Ensure `Cart` + `Like` records exist (creates them if missing)
  5. `likeStore._mergeWithServerLikes()` + `cartStore._mergeWithServerCart()` — merges local state with server
  6. Emits `close`
- **Geolocation:** auto-detects country code via `ipapi.co` on mount, prefills dial code
- **Resend timer:** 30-second cooldown between OTP requests
- Used in: `store/[[company]]/index.vue` (shown as modal when not authenticated)

### `components/Checkout/contact.vue`
Delivery address selector for the store checkout.
- **Data:** `useFindManyAddress({ where: { clientId } })` — client's saved addresses
- **Select existing:** `USelect` dropdown; switching updates `active` flag on both old + new address via `useUpdateAddress`
- **Add new:** inline form fields (name, street, locality, city, state, pincode) → `useCreateAddress` with `active: true`
- **Emits:** `update(addressId)` to parent whenever active address changes
- **Bug:** `console.log(formData)` on save
- Used in: `store/[[company]]/checkout/index.vue`

### `components/Checkout/item.vue`
Cart item list + order summary for the store checkout.
- **Data:** `useFindManyVariant` fetching only variantIds currently in cart (select: id, name, sprice, dprice, images, discount, items, product+category, company)
- **Cart operations:** increment/decrement qty via `cartStore.addToCart()` with `qty: ±1`, remove via `cartStore.removeFromCart()`
- **Checkout options:** Standard Purchase, Product Booking, Try-at-home
- **Payment methods:** COD, UPI, CARD (BOOKING type → COD only)
- **Promo code:** calls `POST /api/applyPromoCode` — applies `discountPercent` to `discount.value` (**Note:** this calls the broken route that uses `prisma.promoCode` — see known bugs)
- **Subtotal calc:** `qty × sprice`; zero for TRY_AT_HOME/BOOKING
- **Discount calc:** `(sprice × discount%) × qty` per variant
- **Emits:** `update({ total, subtotal, discount, deliveryFees, paymentMethod, checkoutOption, bookingDate, items })` reactively via `watchEffect`
- **Bug:** `console.log(variants.value, orderItems.value)` in `watchEffect`
- Used in: `store/[[company]]/checkout/index.vue`

---

## Category Components

### `components/AddCategory/Create.vue`
Category fields form — used by `pages/products/categories/add.vue` and `pages/products/categories/edit/[id].vue`.
- **Emits:** `update(fields)` reactively on every field change (parent handles actual save)
- **Fields:** name (required, min 2), HSN code, taxType (FIXED/VARIABLE), fixedTax / threshold+below+above taxes, shortCut, margin %, targetAudience, image
- **HSN auto-fill:** watches `hsn` field → looks up `/hsncode.json` static file → auto-fills taxType + tax values when an HSN match is found
- **Target audience:** populated from `session.category[]`; falls back to `['Men', 'Women', 'Girl', 'Boy']`
- **Image:** file input → FileReader preview; existing image shown from S3 URL
- **Validation:** vee-validate + Zod schema
- **Bug:** `console.log('Available Audiences:', ...)` at module scope — fires on every component mount

### `components/AddCategory/Live.vue` / `components/AddCategory/Subcategory.vue`
Not read — assumed similar to `AddProduct/Live.vue` (status toggle) and subcategory list editor based on component names.

---

## Finance Components

### `components/Cash/Form.vue`
Simple create/edit form for a `CashAccount`.
- **Props:** `cash?: any`
- **Fields:** name (defaults to `"Cash"`)
- **Emits:** `save(form)`, `cancel`
- Used in: `pages/accounts/` (cash account management — rarely needed since only one cash account per company)

### `components/Investment/List.vue`
Investment list with filters, sorting, pagination, and bulk status update.
- **Hooks:** `useFindManyInvestment`, `useUpdateManyInvestment`, `useFindManyCompanyUser`
- **Filters:** status, direction (IN/OUT), user (CompanyUser), date range
- **Emits:** `edit(row)`, `delete(row)`, `open` (create), `values({ total, count })`
- Used in: `pages/accounts/investment.vue`

---

## Settings Components

### `components/settings/DeleteAccountModal.vue`
Modal to delete the current account.
- **State:** `v-model` boolean prop
- **Delete action:** `onDelete()` — **stub only**: runs a 2-second `setTimeout` then shows a toast saying "Your account has been deleted" but **does NOT actually delete anything** (no API call, no hook). The button closes the modal after the timeout.
- **Status:** Unimplemented — UI stub only

### `components/settings/MembersForm.vue` / `MembersList.vue`
Part of the `pages/settings/members.vue` stub (Nuxt UI starter template). Not implemented — no real API backing.

---

## Nuxt UI Template Stubs (Unused)

These components are from the Nuxt UI Pro dashboard starter template and are **not connected to real data**:

| Component | Content |
|---|---|
| `home/HomeSales.vue` | Hardcoded list of 4 fake sales (Jordan Brown, etc.) — static mock data, USD prices |
| `home/HomeChart.client.vue` | Client-side chart stub |
| `home/HomeChart.server.vue` | Server-side chart stub |
| `home/HomeCountries.vue` | Template countries list stub |
| `home/HomeDateRangePicker.vue` | Date range picker wrapper |
| `home/HomePeriodSelect.vue` | Period selector stub |
| `inbox/InboxList.vue` | Messaging inbox list — uses `$client` (ElectricSQL), `Mail` type from `~/types` |
| `inbox/InboxMail.vue` | Mail detail view stub |
| `inbox/Conversation.vue` | Conversation thread stub |
| `inbox/Message.vue` | Single message bubble stub |
| `BlogCTA/CustomerCTA.vue` | Static CTA component for blog pages |
| `BlogCTA/StoreCTA.vue` | Static CTA for blog — used in `blogs/what_is_try_n_buy.vue` |
| `company/CompanyCard.vue` | Company card used in `pages/marketplace.vue` |
| `color-Picker/ColorPicker.vue` | Color picker component |
| `color-Picker/ColorPickerPill.vue` | Color swatch pill |
| `Steps.vue` | Multi-step progress indicator stub |

> **Note:** `inbox/` components reference `$client` which is ElectricSQL — do not touch (paused feature).

---

## Shared Utility Components

### `DatePicker.vue`
v-calendar date picker wrapper with Nuxt UI theming.
- **Library:** `v-calendar` (`DatePicker as VCalendarDatePicker`)
- **Modes:** if `modelValue` has `start` + `end` → range mode (`v-model.range`), else single date
- **Responsive:** 2-column layout on desktop, 1-column on mobile (`window.innerWidth < 640`)
- **Config:** transparent, borderless, primary color, first day of week = Monday (2)
- **Emits:** `update:model-value`, `close` (on day click)
- Used throughout: sales filters, accounts ledger, reports, order filters

### `MapLocationPicker.vue`
Google Maps location picker with text search and GPS.
- **Map:** Google Maps JS API (`mapId: 85423aee1b59e235e896d3e7`), draggable marker, click-to-place
- **Search:** `USlideover` with text input → Google Places `textSearch` (biased to India bounding box) → `getDetails` on selection
- **GPS:** `navigator.geolocation.getCurrentPosition` → centers map + reverse geocode via `Geocoder`
- **Pre-fill:** on init, uses `session.address.lat/lng` if available (session company address); falls back to GPS
- **Emits:** `locationSelected({ lat, lng, name, formattedAddress, street, locality, city, state, pincode, placeId })`
- **API key:** hardcoded in source — `AIzaSyCfmQAcnCd3rUdLXxC9Hg9NiowG0ovHbfQ`
- Used in: `pages/settings/store.vue` (address section)
