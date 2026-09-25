# Storetools Architecture — Master Index

Use this file to find the Storetools topic for any question. These files moved from the
repository-level `docs/` directory into `storetools/docs/`; repository-level marketplace,
delivery and Express-server documentation remains under `docs/`.

## Topic Files

| File | Content |
|---|---|
| `database/README.md` | Database documentation entry point and generation workflow |
| `database/DB-CATALOG.md` | Generated exhaustive model/field catalog |
| `database/dbMeta.json` | Machine-readable schema metadata for coding agents |
| `database/dbExplanations.json` | Editable table purpose and field explanations; new keys start blank |
| `ARCH-schema.md` | DB tables, field definitions, relations for all models |
| `ARCH-patterns.md` | Enums, layouts, storetools auth, DB access patterns, ZenStack hooks pattern |
| `ARCH-pages-erp.md` | ERP pages: billing/POS, sales list, bill edit, expenses, B2B credit accounts |
| `ARCH-pages-accounts.md` | Finance/Accounts: cash ledger, bank accounts, investments, transfers, transactions |
| `ARCH-pages-products.md` | Products list/add/edit, brands, categories, stocks |
| `ARCH-pages-distributor.md` | Distributor list, credit/payment ledger, purchase orders, form |
| `ARCH-pages-users.md` | Users/staff management, user report API, userStore |
| `ARCH-pages-client.md` | Client management, CRM pipeline, AddClient modal |
| `ARCH-pages-settings.md` | Settings (general/store/products/printer/numbering/requests), auth composable functions |
| `ARCH-pages-auth-settings.md` | Login, register, OTP verification, offline billing page |
| `ARCH-pages-coupon.md` | Coupon list/form/detail, coupon usage at billing |
| `ARCH-pages-orders.md` | Ecommerce orders, fulfilment, returns/exchanges/NDR/pickup, legacy Try N Buy/booking, receipts and cleanup |
| `ARCH-pages-reports.md` | Reports (sales/profit/accounts/online/users), Dashboard, Notifications |
| `ARCH-pages-store.md` | Public/marketing pages and current storefront architecture; removed Nuxt customer routes marked historical |
| `ARCH-pages-ecommerce-cms.md` | Seller ecommerce CMS: blogs, customers, content, marketing, payment and shipping settings |
| `ARCH-pages-ai-editor.md` | AI provider/usage pages, bank statement page and storefront editor |
| `ARCH-pages-navigation.md` | Dashboard parent routes, page shells and settings navigation |
| `ARCH-components.md` | All shared components: notifications, barcode/receipt, dashboard charts, store frontend, checkout, category form, finance, settings modals, template stubs |
| `ARCH-composables.md` | All custom composables and lib/api utilities: cloud storage, Firebase, printing (BLE/ESC/POS), notifications, Socket.io events, dashboard data, store products, coupons, utilities |
| `ARCH-storetools-internals.md` | Plugins, middleware, services, Pinia stores, types, and utils in storetools root |
| `ARCH-storetools-auth.md` | Auth layer: seller/client session types, all `/api/auth/*` + `/api/clientauth/*` routes, auth plugins, auth composables, nuxt.config.ts |
| `ARCH-storetools-api.md` | All ~80 Nuxt server API routes under `storetools/server/api/`: bill, accounts, products, coupons, reports, cart, notifications, WhatsApp, TikTok, Shopify, upload |
| `ARCH-ai-chat.md` | AI chat system: MCP server, Gemini agentic loop, voice/image/file support, chat persistence, R2 media storage |
| `ARCH-pages-users-crm.md` | *(Redirect — see `ARCH-pages-users.md` + `ARCH-pages-client.md`)* |

Marketplace, delivery and Express-server docs are owned by the repository-level [`docs/ARCH-INDEX.md`](../../docs/ARCH-INDEX.md); they are not files in this Storetools directory. Customer-facing API docs live under [`ecommerce-api/storefront_api_docs/API-INDEX.md`](../../ecommerce-api/storefront_api_docs/API-INDEX.md).

---

## Quick Lookup by Keyword

| Looking for... | Go to |
|---|---|
| DB table fields / schema | `ARCH-schema.md` |
| Prisma model names, enums | `ARCH-schema.md` + `ARCH-patterns.md` |
| ZenStack hooks pattern | `ARCH-patterns.md` |
| Session data structure | `ARCH-patterns.md` + `ARCH-storetools-auth.md` — `AuthSession` type |
| How layouts work (nav gating by plan) | `ARCH-patterns.md` |
| Seller login (H3 session) | `ARCH-storetools-auth.md` — login.post.ts, plugins/0.auth.ts |
| Forgot password / password reset | `ARCH-pages-auth-settings.md` + `ARCH-storetools-auth.md` — forgot-password.vue, resetPassword.post.ts |
| Client/customer session (store frontend) | `ARCH-storetools-auth.md` — clientauth/ routes, AuthClientSession |
| Auth route guard / plan restriction | `ARCH-storetools-auth.md` — plugins/0.auth.ts middleware |
| Nuxt config (modules, nitro, vite, runtimeConfig) | `ARCH-storetools-auth.md` — Storetools nuxt.config.ts section |
| Nuxt API routes (server/api/) | `ARCH-storetools-api.md` |
| Bill create/update server API | `ARCH-storetools-api.md` — bill/ routes |
| Cash/bank ledger server API | `ARCH-storetools-api.md` — accounts/ routes |
| Profit report API | `ARCH-storetools-api.md` — report/profit.get.ts |
| Accounts/dashboard report API | `ARCH-storetools-api.md` — report/dashboard.get.ts |
| Coupon generation server API | `ARCH-storetools-api.md` — coupons/generate |
| Cart sync API | `ARCH-storetools-api.md` — cart/ routes |
| WhatsApp template / webhook | `ARCH-storetools-api.md` — whatsapp/ routes |
| TikTok Shop OAuth + products | `ARCH-storetools-api.md` — tiktok/ routes |
| FCM push token save | `ARCH-storetools-api.md` — savefcmtoken.post.ts, savecaptoken.post.ts |
| AI image generation (Gemini + R2) | `ARCH-storetools-api.md` — upload.ts, aify.post.ts |
| AI chat (text/voice/image) | `ARCH-ai-chat.md` |
| Bank statement processing | `ARCH-ai-chat.md` — Bank Statement Processing section |
| Statement upload (Gemini extraction) | `ARCH-storetools-api.md` — statement/upload.post |
| Statement classify (AI assign) | `ARCH-storetools-api.md` — statement/find-operation.post |
| Statement execute (per-row / batch) | `ARCH-storetools-api.md` — statement/execute-row.post, statement/execute.post |
| Statement helpers (_helpers.ts) | `ARCH-ai-chat.md` — Shared Helpers table |
| Statement page (Assign→Execute UI) | `ARCH-ai-chat.md` — Statement Page States table |
| Statement auto-matching (30% keyword) | `ARCH-ai-chat.md` — Bank Statement Processing › Key behaviors |
| Statement mapping (remark→operation) | `ARCH-schema.md` — statement_mappings |
| MCP server (product/PO/catalog tools) | `ARCH-ai-chat.md` — MCP Server section |
| MCP statement tools (save rows, find mappings) | `ARCH-ai-chat.md` — MCP Server table |
| MCP expense/finance/accounts/distributor tools | `ARCH-ai-chat.md` — MCP Server table |
| MCP settings tools (get/update store settings) | `ARCH-ai-chat.md` — MCP Server table (settings.ts) |
| MCP report tools (generate_report) | `ARCH-ai-chat.md` — MCP Server table (reports.ts) |
| `@setting` / `@report` AI chat prefix system | `ARCH-ai-chat.md` — On-Demand Tool Prefixes section |
| AI chat persistence (AiChat/AiChatMessage) | `ARCH-ai-chat.md` — DB Models section |
| Voice chat (Gemini audio input) | `ARCH-ai-chat.md` — Media Handling section |
| AI chat media upload (R2) | `ARCH-ai-chat.md` — server/utils/r2.ts |
| R2 media deletion on replace/remove | `ARCH-ai-chat.md` — server/utils/mediaCleanup.ts; `ARCH-storetools-api.md` — r2/delete.post |
| Agentic loop (Gemini + MCP tools) | `ARCH-ai-chat.md` — Agentic Loop section |
| Discount bulk apply API | `ARCH-storetools-api.md` — discount/apply.post.ts |
| Bill creation (POS) | `ARCH-pages-erp.md` |
| Markit bill / marketplace settlement | `ARCH-schema.md` + `ARCH-server.md` — `markit_bills`, `checkout/trynbuy/complete` |
| Bill create raw SQL transaction | `ARCH-pages-erp.md` |
| Sales return entry lookup by invoice | `ARCH-pages-erp.md` — `/api/bill/findFirstEntry` |
| Product creation raw SQL | `ARCH-pages-products.md` |
| Product raw-SQL endpoints (read/create/update/by-ids/delete/category-tax/save-batch) | `ARCH-storetools-api.md` — products/; `ARCH-pages-products.md` |
| Purchase-order raw-SQL endpoints (save/update/[id]) | `ARCH-storetools-api.md` — purchaseorder/ |
| Deferred "stage then batch-save" add-products model (localStorage staged → one txn on Save) | `ARCH-pages-products.md` — add.vue |
| add.vue / edit/[id].vue / AddProduct/Table.vue off ZenStack (raw-SQL) | `ARCH-pages-products.md` |
| Barcode scanning (Quagga2, Capacitor) | `ARCH-pages-erp.md` (billing) |
| Discount apply bulk API | `ARCH-pages-erp.md` |
| Cash/bank ledger calculation | `ARCH-pages-accounts.md` |
| Distributor payment / credit | `ARCH-pages-distributor.md` |
| Distributor AMOUNT credit (creates linked MoneyTransaction → cash/bank ledger) | `ARCH-pages-distributor.md` — Add Credit modal, `ARCH-schema.md` — DistributorCredit.moneyTransactionId |
| Distributor transactions PDF/Excel (Date·No·Type·Remarks·Debit·Credit + opening/closing footer) | `ARCH-storetools-api.md` — `downloads/distributor-credits.{pdf,excel}` |
| GST returns (GSTR-1/3B/2B) page + ITC source | `ARCH-pages-reports.md` — `pages/reports/gst.vue` |
| GSTR-2B / GSTR-3B Table 4 ITC source = `distributor_credits WHERE money_transaction_id IS NULL` | `ARCH-storetools-api.md` — report/gstr2b/gstr3b; `ARCH-pages-reports.md` |
| MCP `create_distributor_credit` (PRODUCT vs AMOUNT) | `ARCH-ai-chat.md` — MCP Server table → distributors.ts |
| Sales search rules (numeric → invoice OR phone, closingDate-gated invoice arm) | `ARCH-storetools-api.md` — billSale/findManyBills |
| Coupon create/edit/list | `ARCH-pages-coupon.md` |
| User/staff management | `ARCH-pages-users.md` |
| User performance report API | `ARCH-pages-users.md` |
| Client/CRM pipeline | `ARCH-pages-client.md` |
| Settings (store/general/printer/numbering) | `ARCH-pages-settings.md` |
| General page preferences / reusable preference rules | Removed from active storetools source in the 2026-06-15 cleanup; schema remains documented in `ARCH-schema.md` |
| Number prefixes & financial year | `ARCH-pages-settings.md` — numbering.vue |
| Previous bill prefix (closing date aware) | `ARCH-pages-settings.md` — numbering.vue |
| Auth composable functions | `ARCH-pages-settings.md` |
| Try N Buy order creation | `ARCH-server.md` + `ARCH-pages-orders.md` |
| Try N Buy pack flow | `ARCH-pages-orders.md` + `ARCH-server.md` |
| Socket.io rooms / events | `ARCH-server.md` |
| Customer mobile app (marketplace) | `ARCH-marketplace.md` |
| Delivery partner mobile app | `ARCH-delivery.md` (hub) — Ionic React, 23 routes, order walkthrough, map navigation |
| Delivery app routes / pages | `ARCH-delivery-routes.md` |
| Delivery app API clients + endpoints | `ARCH-delivery-api.md` |
| Delivery app components (SlideToAction, IncomingOrderPopup, etc.) | `ARCH-delivery-components.md` |
| Delivery app dependency map | `ARCH-delivery-relations.md` |
| Delivery auth flow (OTP → signup → verification) | `ARCH-delivery-routes.md` → Login.tsx + `ARCH-delivery.md` → Auth Flow |
| Delivery order walkthrough (GoToPickup → Delivered) | `ARCH-delivery.md` → Order Walkthrough Flow |
| Delivery map (Leaflet + OSRM polyline) | `ARCH-delivery-routes.md` → GoToPickupPage / GoToDropPage |
| Customer login / OTP | `ARCH-server.md` |
| Seller login / session | `ARCH-patterns.md` + `ARCH-pages-auth-settings.md` |
| Store frontend (customer e-commerce) | `ARCH-pages-store.md` |
| Storefront AI editor / OpenCode Cloud Run sessions | `ARCH-pages-store.md` — Custom storefront editor runtime |
| Nearby shop discovery (OSRM + PostGIS) | `ARCH-server.md` — routes/shop.js |
| Shop search (fuzzy, pg_trgm) | `ARCH-server.md` — routes/shop.js |
| Dark store marketplace catalog | `ARCH-schema.md` — `companies.darkstore`; `ARCH-server.md` — `GET /api/products/darkstore`; `ARCH-marketplace-routes.md` — `Shops.vue` Dark-store tab |
| Marketplace composables (useClient, useDistance, useLocationStore) | `ARCH-marketplace-api.md` — Composables section |
| Marketplace hooks (useAddresses, useDebouncedSearch) | `ARCH-marketplace-api.md` — Hooks section |
| Marketplace socket client | `ARCH-marketplace-api.md` — Services section |
| Marketplace storage strategy (localforage vs Capacitor Preferences) | `ARCH-marketplace.md` — Storage Strategy |
| Marketplace App.vue lifecycle (splash, socket join) | `ARCH-marketplace.md` — App.vue Lifecycle |
| Marketplace store state/actions (useCartStore, usePackStore, etc.) | `ARCH-marketplace-stores.md` |
| Marketplace API functions (postOrder, fetchCoupons, etc.) | `ARCH-marketplace-api.md` — api.ts section |
| Marketplace CSS tokens (glass, colors, buttons) | `ARCH-marketplace-theme.md` |
| Marketplace router notes / auth guard bugs | `ARCH-marketplace-routes.md` — Router Notes & Bugs |
| Marketplace view-by-view logic (Shops, Cart, Login, etc.) | `ARCH-marketplace-routes.md` — Views section |
| Shops.vue subcategory streaming / collapsible header | `ARCH-marketplace-routes.md` — Views › Shops.vue |
| Login OTP flow (WhatsApp template via server) | `ARCH-marketplace-routes.md` — Views › Login.vue; `ARCH-server.md` — routes/auth.js + utils/sendWhatsappOtp.js |
| WhatsApp OTP send utility | `ARCH-server.md` — routes/auth.js → WhatsApp send |
| Persisted login state across refresh (marketplace + delivery) | `ARCH-marketplace-routes.md` — Login.vue; `ARCH-delivery-routes.md` — Login.tsx |
| AddAddress / EditAddress Google Maps flow | `ARCH-marketplace-routes.md` — Views › AddAddress / EditAddress |
| OrderTryPack checkout flow | `ARCH-marketplace-routes.md` — Views › OrderTryPack.vue |
| Cart grouping / addItem rules | `ARCH-marketplace-stores.md` — useCartStore |
| Pack/packing status flow | `ARCH-marketplace-stores.md` — usePackStore |
| Marketplace components (props, emits, templates) | `ARCH-marketplace-components.md` |
| Dependency map (views→stores, views→API, marketplace↔server) | `ARCH-marketplace-relations.md` |
| Navigation flow (Shops → Products → Cart → Pack) | `ARCH-marketplace-relations.md` — Navigation Flow Summary |
| Client address CRUD (mobile) | `ARCH-server.md` — routes/address.js |
| Client profile (mobile) | `ARCH-server.md` — routes/client.js |
| Coupon validate + apply (mobile) | `ARCH-server.md` — routes/coupon.js |
| Payment gateway route (removed from marketplace/server) | `ARCH-server.md` — routes/razorpay.js |
| Delivery partner CRUD + profile | `ARCH-server.md` — routes/delivery/deliveryPartner.js |
| Delivery partner orders | `ARCH-server.md` — routes/delivery/orders.js |
| Delivery partner earnings | `ARCH-server.md` — routes/delivery/earnings.js |
| Delivery partner wallet (COD cash-in-hand) | `ARCH-server.md` — routes/delivery/wallet.js |
| Delivery partner payouts | `ARCH-server.md` — routes/delivery/payouts.js |
| Order history (client mobile) | `ARCH-server.md` — routes/history.js |
| Firebase Admin (server-side FCM) | `ARCH-server.md` — firebase.js |
| Push token registration (mobile) | `ARCH-server.md` — routes/devices.js |
| OSRM distance matrix | `ARCH-server.md` — routes/distance.js |
| Google Maps distance proxy | `ARCH-server.md` — routes/map.js |
| Dispatch system (BullMQ, driver selection, Redis GEO) | `ARCH-server.md` — Dispatch System section |
| Driver state in Redis (isOnline, isLive, isDelivering) | `ARCH-server.md` — Dispatch System › Redis keys table |
| Dispatch accept / reject flow | `ARCH-server.md` — dispatch/response.js |
| Socket.io client-to-server events (joinClient, driver:location, dispatch:accept, etc.) | `ARCH-server.md` — Socket.io › Connection Handling |
| `deliveryStepUpdate` socket event | `ARCH-server.md` — Socket.io › Server → Client events |
| Known bugs / issues | Each topic file has a Bugs section; see below for consolidated list |
| Notification bell / slideover | `ARCH-components.md` — NotificationIcon, NotificationsSlideover |
| Thermal receipt rendering | `ARCH-components.md` — ThermalReceipt |
| Barcode label print | `ARCH-components.md` — BarcodeComponent, PrintBarcodeComponent |
| Company switcher | `ARCH-components.md` — TeamsDropdown |
| Dashboard charts (ECharts) | `ARCH-components.md` — RevenueEChart, CategoryRevenuePie, billsOverTimeChart, etc. |
| Store product card | `ARCH-components.md` — products/ProductCard.vue |
| Store login modal (Firebase OTP) | `ARCH-components.md` — Checkout/login.vue |
| Address selector at checkout | `ARCH-components.md` — Checkout/contact.vue |
| Cart item list at checkout | `ARCH-components.md` — Checkout/item.vue |
| Google Maps address picker | `ARCH-components.md` — MapLocationPicker.vue |
| Date picker (v-calendar) | `ARCH-components.md` — DatePicker.vue |
| Category create/edit form | `ARCH-components.md` — AddCategory/Create.vue |
| Cloudflare R2 upload / AI image generation | `ARCH-composables.md` — CloudflareService (aws.ts) |
| Firebase auth setup | `ARCH-composables.md` — firebase.ts |
| Web push notifications (FCM) | `ARCH-composables.md` — usePushNotifications, useMessaging |
| Native push notifications (Capacitor) | `ARCH-composables.md` — useCapPush |
| BLE thermal printer (native print) | `ARCH-composables.md` — useReceiptPrinter, usePrinter |
| Print bill/label/report (platform-aware) | `ARCH-composables.md` — usePrintBill |
| Socket.io bill/checkout sound + store update | `ARCH-composables.md` — useBillEvents, useCheckoutEvents |
| Dashboard data (revenue, expenses, charts) | `ARCH-composables.md` — useCompanyDashboard (lib/api/useDashboardData) |
| Keyboard shortcuts (global nav) | `ARCH-composables.md` — useDashboard |
| Notification WebSocket + REST | `ARCH-composables.md` — useNotifications |
| Store frontend product pagination + filters | `ARCH-composables.md` — useStoreProducts |
| Coupon generation for cart | `ARCH-composables.md` — useGenerateCoupons |
| Category tax config (global state) | `ARCH-composables.md` — initTaxData (lib/api/useCategoryTax) |
| SHA-512 hash utility | `ARCH-composables.md` — hash.ts |
| File to base64 conversion | `ARCH-composables.md` — prepareFileForApiUpload.ts |
| SSR-safe localStorage ref | `ARCH-composables.md` — useLocalStorageRef |
| Date/time formatting utilities | `ARCH-composables.md` — date.ts |
| Socket.io plugin setup ($socket) | `ARCH-storetools-internals.md` — plugins/socket.client.ts |
| Pinia persistence (persistedstate) | `ARCH-storetools-internals.md` — plugins/pinia.client.ts |
| Razorpay SDK lazy-load ($razorpay) | `ARCH-storetools-internals.md` — plugins/razorpay.client.ts |
| Offline/online network detection | `ARCH-storetools-internals.md` — plugins/network-watcher.client.ts |
| Service worker registration | `ARCH-storetools-internals.md` — plugins/register-sw.client.ts |
| Vue Tel Input plugin | `ARCH-storetools-internals.md` — plugins/vue-tel-input.client.ts |
| Vue Query (TanStack) plugin | `ARCH-storetools-internals.md` — plugins/vue-query.ts |
| Cleanup route guard (in-page access control, Ctrl+U unlock, sidebar/navbar gating) | `ARCH-pages-orders.md` — cleanup page; `ARCH-storetools-internals.md` — middleware/authority.global.ts (now empty) |
| Cleanup soft delete / amount reduction utilities | `ARCH-storetools-api.md` — server/utils/cleanUpSoftDel.ts, server/utils/cleanUpReduce.ts |
| Soft-deleted bill visibility / precedence flag | `ARCH-schema.md` — Bill.precedence, `ARCH-pages-orders.md` — cleanup page |
| Last route tracking (localStorage) | `ARCH-storetools-internals.md` — middleware/lastRoute.global.ts |
| Cart store (store frontend) | `ARCH-storetools-internals.md` — stores/cartStore.ts |
| Wishlist / likes store | `ARCH-storetools-internals.md` — stores/likeStore.ts |
| Category store + tax shortcut lookup | `ARCH-storetools-internals.md` — stores/category.ts |
| User/staff store (persisted) | `ARCH-storetools-internals.md` — stores/user.ts |
| Bill/checkout signal stores | `ARCH-storetools-internals.md` — stores/billStore.ts + checkoutStore.ts |
| Message context store (CRM reply/edit/delete) | `ARCH-storetools-internals.md` — stores/messageStore.ts |
| Shopify integration service | `ARCH-storetools-internals.md` — services/shopifyService.ts |
| Notification types + AppNotification interface | `ARCH-storetools-internals.md` — types/notification.ts |
| Dashboard interface types | `ARCH-storetools-internals.md` — types/dashboard.ts |
| Prisma extended types (ProductWithVariants etc.) | `ARCH-storetools-internals.md` — types/store.ts |
| CSV export (browser download) | `ARCH-storetools-internals.md` — utils/export-csv.ts |
| Generic PDF export (jsPDF table) | `ARCH-storetools-internals.md` — utils/export-pdf.client.ts |
| Sales report PDF (KPI + bills) | `ARCH-storetools-internals.md` — utils/generate-sales-report-pdf.client.ts |
| Thermal receipt PDF (127mm) | `ARCH-storetools-internals.md` — utils/thermal-receipt.client.ts |
| Relative time formatting | `ARCH-storetools-internals.md` — utils/dates.ts |
| Store route URL builder | `ARCH-storetools-internals.md` — utils/routeHelper.ts |

---

## Consolidated Bug Index

| Location | Bug |
|---|---|
| `storetools/server/api/applyPromoCode.post.ts` | Calls `prisma.promoCode` but model is `Coupon` — runtime error |
| `server/` `authMiddleware.js` | `console.log("JWT verification error:", err)` fires on every request including valid ones |
| `pages/erp/billing.vue` | `console.log` statements left in production |
| `pages/products/stocks/index.vue` | Debug `console.log` dumps full category breakdown on every load |
| `components/Distributor/Form.vue` | Edit distributor uses `address: { create: {} }` — creates new address instead of updating |
| `pages/distributor/index.vue` | ~~`console.log(distributors.value)` on every data change~~ **FIXED** (page rewritten; old `Dlist.vue` console.log removed). Transactions tab rebuilt: Date·No·Type·Remarks·Debit·Credit columns, PURCHASE/CREDIT/PAYMENT/PURCHASE-RETURN taxonomy, Add-Credit modal gained PRODUCT vs AMOUNT toggle (AMOUNT path creates a linked MoneyTransaction → flows through cash/bank ledgers). |
| `pages/distributor/purchaseOrder.vue` | `watch` logs all PO rows on every update |
| `server/api/report/gstr2b.get.ts` + `generate-gstr2b.excel.get.ts` + `gstr3b.get.ts` (Table 4) + `generate-gstr3b.excel.get.ts` | ~~ITC sourced from `purchase_return_items / purchase_returns` (semantically inverted — returns reduce ITC, they shouldn't be the source)~~ **FIXED** — switched to `distributor_credits WHERE money_transaction_id IS NULL`, joined to `purchase_orders → products → variants → items` for per-rate tax breakdown. |
| `pages/client/index.vue` | ~~`fromPipeline` param ignored in disconnect — clients not in `prospectClients` not removed from stage~~ **FIXED** — `changePipeline` now disconnects `${fromPipeline}Clients` and stores the flat stage on current-company `CompanyClient.pipelineStatus`. |
| `pages/coupon/index.vue` | ~~`console.log(coupon)` on every open/save~~ **FIXED**; ~~Details action opens delete modal~~ **FIXED** (Details action removed; detail view via `CouponDetail` panel) |
| `components/Coupon/CouponList.vue` | `useCountCoupon` unused; pagination broken for large datasets; GIFT missing from type filter; ~~GENERATE missing from audience filter~~ **FIXED** |
| `pages/order/trynbuy.vue` | Logs all order data on every load |
| `pages/order/pack.vue` + `ready.vue` | ~~`handleSave` dead code in pack.vue~~ **FIXED** (removed); unused `item` import from `@unovis/ts` (still in pack.vue); `handleSave` dead code still in ready.vue |
| `pages/order/bookings.vue` | `useUpdateManyCategory` dead import; `action()` delete not wired |
| `pages/login.vue` | Two `console.log` statements; `route.query.code` read but unused |
| `pages/settings/index.vue` | Success toast references `error.statusMessage` (out of scope variable) |
| `pages/settings/store.vue` | Same `error.statusMessage` bug in `onaccSubmit` success branch |
| `components/Expense/ExpenseList.vue` | ~~"Mark as" bulk status passed `selectedRows.id` (always `undefined`)~~ **FIXED** — now passes `selectedRows.map(r => r.id)` to `/api/accounts/expenses/status`. Whole expense feature migrated off ZenStack to raw-pg `/api/accounts/expense*` endpoints; add flow moved to inline `ExpenseQuickAdd` bar with Add-button spinner (modal now edit-only, also with Save spinner). |
| `pages/reports/online.vue` | Multiple `console.log(res)` after data fetch |
| `pages/reports/users.vue` | `console.log` on every date change and data update |
| `pages/store/[[company]]/index.vue` | `console.log(NEWflatVariants)` on every product load |
| `pages/store/[[company]]/products/[id].vue` | `console.log` on variant selection and in computed |
| `pages/marketplace.vue` | `console.log(companies)` at module scope |
| `pages/receipt/[id].vue` | `console.log('PRINT DATA:', res)` on every load |
| `pages/saleshistory/[billId].vue` | `console.log(newData?.data)` on every load |
| `storetools GET /api/getuser` | No auth check — accepts any `companyId` |
| `composables/aws.ts` | Worker URL and upload secret hardcoded in source |
| `composables/firebase.ts` | Firebase API key and appId hardcoded in source |
| `composables/usePushNotifications.ts` | VAPID key hardcoded in source |
| `composables/useNotifications.ts` | Production WebSocket host is placeholder `'your-fly-app.fly.dev'`; `console.log` on every WS message |
| `composables/useReceiptPrinter.ts` | `item.createdAty` typo in `printMobileReport` expense rows (should be `item.createdAt`) |
| `composables/getTax.ts` | `id` param accepted but ignored; always fetches `/api/gettax/` |
| `composables/date.ts` | `console.error` after `return ''` in catch block — unreachable code |
| `lib/api/useDashboardData.ts` | `console.log(newVal)` in company and expenses watchers |
| `server/routes/auth.js` | ~~OTP verification commented out — JWT issued on phone number alone~~ **FIXED** — `/auth/login` and `/auth/deliveryPartner/login` now verify `otp` + `otp_expiry` and clear the code on success. OTP delivered via WhatsApp `login_otp` template (`utils/sendWhatsappOtp.js`); TTL bumped to 10 min. |
| `server/routes/shop.js` | `console.log(nearby)` on every request |
| `server/routes/coupon.js` | `console.log(SQL + params)` on every coupon fetch request |
| `server/routes/map.js` | `console.log("here")` on every request |
| `server/routes/devices.js` | No auth check — any caller can register push tokens for any userId |
| `server/routes/delivery/deliveryPartner.js` | `DELETE /` reads `req.user?.partnerId` but JWT sets `deliveryPartnerId` — always 401 |
| `server/routes/delivery/deliveryPartner.js` | `GET /byid/:id` and `GET /all` skip delivery-partner JWT validation — any valid client JWT can enumerate all partners' PII and financial records (bank details, Aadhaar, PAN) |
| `server/routes/delivery/support.js` | Entirely dead code — router registered but no active handlers |
| `server/routes/pack.js` | Route path named `packing-status` but updates `order_status` DB column |
| `server/routes/razorpay.js` | **REMOVED** — route deleted; no longer mounted |
| `server/routes/deliveryMap.js` | OSRM-backed delivery route endpoint (legacy for the delivery app; not used by current walkthrough screens) |
| `server/routes/delivery/payouts.js` | No admin approval workflow — payout `status` starts as `PENDING` and has no update endpoint |
| `server/dispatch/worker.js` | ~~Uses deprecated Redis `GEORADIUS` command — should use `GEOSEARCH` (Redis 6.2+)~~ **FIXED** — worker uses `GEOSEARCH`; dispatch offers now keep `dispatch:driver:pending:{driverId}` for reconnect replay and print `[dispatch:debug]` availability/rejection/backlog snapshots. |
| `middleware/authority.global.ts` | ~~Guards `/cleanup`~~ **MOVED** — middleware now returns early for all routes; access control is fully in `pages/cleanup.vue` (in-page `hasAccess` computed + Ctrl+U unlock flow) |
| `auth/server/api/auth/session.put.ts` | ~~`undefined` fields in PUT body overwrote existing session fields — cleared `cleanup`/`cleanupCode` on company switch, causing redirect to login page~~ **FIXED** — body is filtered (`v !== undefined`) then merged with `{ ...session.data, ...updates }` |
| `server/utils/cleanUpDel.ts` | ~~`prisma.bill.update` inside transaction bypassed Prisma `tx` — not atomic~~ **FIXED** — changed to `tx.bill.update` |
| `server/utils/cleanUpGet.ts` | ~~`timePref` was not used in `orderBy` — sort preference had no effect~~ **FIXED** — now applies `{ createdAt: timePref === 'oldest' ? 'asc' : 'desc' }` |
| `marketplace/src/router/index.ts` | ~~Auth guard reads `localStorage.getItem('token')` but token is in Capacitor Preferences — guard always fails on native (Android/iOS); `guestOnly` on Login never redirects logged-in users~~ **FIXED** — guard reads Capacitor Preferences `token`; logged-out app loads redirect to `/login` unless the session-only login Skip flag is set |
| `marketplace/src/router/index.ts` | ~~All 22 routes have `meta: { requiresAuth: false }` — no route is actually protected; anyone can access any view without auth~~ **FIXED** — account/address/order detail routes now require auth; guest browsing is enabled only after Skip for the current session, with a narrow exception for `account-address-add` + `redirect=nearby` |
| `marketplace/src/views/OrderTryPack.vue` | ~~`RAZORPAY_KEY_ID = 'rzp_test_RYuGLP5Z8RaUqo'` hardcoded test key~~ **REMOVED** — Razorpay integration deleted from marketplace checkout |
| `marketplace/src/views/Products.vue` | `localStorage.setItem("product", ...)` before navigate is dead — ProductDetails always calls API |
| `marketplace/src/views/Wishlist.vue` | Same dead `localStorage.setItem('product')` pattern; dead `TabsPage` import |
| `marketplace/src/views/AddAddress.vue` | UUID generated at module scope via `uuidv4()` — same ID reused if user visits page twice without unmounting |
| `marketplace/src/views/OrderHistory.vue` | `fetchFromApi()` called twice when list is empty (unconditionally + inside empty-list guard) |
| `marketplace/src/views/Cart.vue` | `couponDiscount` hardcoded to `0`; `checkoutMethod` hardcoded to `'trynbuy'` |
| `marketplace/src/views/Shops.vue` | `debug = ref(true)` left in production; search is FE-only (comment acknowledges backend API exists but is not integrated) |
| `plugins/socket.client.ts` | `console.log(val)` fires on every companyId watch |
| `services/shopifyService.ts` | Shopify URL hardcoded to test store; `ACCESS_TOKEN` read at module init — always undefined |
| `stores/likeStore.ts` | `clearLikes` sets `sessionId.value = ''` before sync check — server sync never runs |
| `stores/messageStore.ts` | `console.log(this.$state)` in `addToEdit`/`addToDelete`; method typo `addToreply` |
| `delivery/src/App.tsx` | Auth guard missing on most routes — unprotected pages accessible without login (B-DEL-01) |
| `delivery/src/pages/SignUpDetailsPage.tsx` | `process.env.REACT_APP_API` (CRA syntax) always `undefined` in Vite build (B-DEL-02) |
| `delivery/src/pages/SignUpDetailsPage.tsx` | Token read as `localStorage.getItem("dpToken")` — wrong key; should be `CapacitorStorage.token` (B-DEL-03) |
| `delivery/src/pages/SignUpDetailsPage.tsx` | Form defaults hardcoded with test data (name: "pet1", address: "mangalore") (B-DEL-04) |
| `delivery/src/pages/Homepage.tsx` | ~~`ordersCompletedToday = 7` and `isActiveOrderAvailable = true` hardcoded~~ **FIXED** (B-DEL-05) |
| `delivery/src/pages/OrdersPage.tsx` | ~~Active order section in Homepage fixed; `OrdersPage.tsx` active section still hardcoded~~ **FIXED** — `OrdersPage.tsx` now reads `/orders/active-order` and `/orders/last-order` from the delivery API |
| `delivery/src/pages/OrderWalkthrough/GoToDropPage.tsx` | Uses native GPS for the 75m swipe gate on pickup/drop screens (B-DEL-07) |
| `delivery/src/pages/OrderWalkthrough/DeliverySuccessPage.tsx` | ~~Earnings hardcoded `₹120`~~ **FIXED** — real deliveryFee + waitingFee (B-DEL-08) |
| `delivery/src/pages/OrderWalkthrough/CollectOrderPage.tsx` + `DeliveredPage.tsx` | ~~Item tables hardcoded~~ **FIXED** — fetched from `GET /api/orders/:trynbuyId`; TrynbuyReturnCollect and TrynbuyReturned also fixed (B-DEL-09) |
| `server/routes/delivery/earnings.js` | **FIXED** — `INSERT INTO delivery_partner_earnings` was missing `id` column (`gen_random_uuid()`) causing null constraint violation |
| `delivery/src/pages/WalletPage/WalletPage.tsx` | Entirely static (₹2,450/₹1,200, 5 fake transactions) — no API (B-DEL-10) |
| `delivery/src/pages/IncentiveDetailsPage/IncentiveDetailsPage.tsx` | Milestones and stats hardcoded; no API (B-DEL-11) |
| `delivery/src/pages/ActiveOrderDetailsPage.tsx` | Entirely hardcoded static data, no API (B-DEL-12) |
| `delivery/src/components/Login/Login.tsx` | File is `AccountSection` component, not a login component — misleading name/location (B-DEL-13) |
| `delivery/src/api/client.ts` + `delivery/src/services/api.ts` | Two parallel HTTP clients (axios vs fetch) — inconsistent patterns (B-DEL-14) |
| `delivery/src/api/client.ts` + `delivery/src/services/config.ts` | Both hardcode `http://localhost:3005/api` — no env var; cannot point at production server (B-DEL-15) |
| `delivery/src/components/OrderPopupContext.tsx` | Older duplicate of IncomingOrderPopup.tsx — likely dead code (B-DEL-16) |
| `server/routes/checkout.js` + `pack.js` + `companyportal/orders.js` (cancel paths) | ~~When an order was cancelled before the driver accepted (no `delivery_partner_id` yet), no socket event was emitted to the pending-popup driver — popup hung until 45s auto-reject~~ **FIXED** — each cancel path now looks up `dispatch:pending:{trynbuyId}` in Redis, emits `trynbuyCancelled { pendingDispatchOnly: true }` to that driver, and deletes the pending Redis keys; `IncomingOrderPopup.tsx` short-circuits the handler on `pendingDispatchOnly` so the popup dismisses silently |
| `server/routes/pack.js` + `companyportal/orders.js` (`getArrivedStoreIds`) | ~~SQL cast `ANY($3::uuid[])` against `order_status_events.company_id` (a `text` column) — produced `operator does not exist: text = uuid` and broke admin/storetools cancel~~ **FIXED** — cast changed to `ANY($3::text[])` in both files |
| `server/dispatch/worker.js` (`handleDispatch`) | ~~Worker did not check `order_status`, so cancelled orders kept getting re-dispatched after the cancel cleared the Redis pending key — popups reappeared in a loop~~ **FIXED** — `getTrynbuyAssignment` now returns `order_status`; `handleDispatch` returns early when status is `'CANCELLED'` and also cleans up stale `dispatch:pending:{trynbuyId}` + `dispatch:driver:pending:{driverId}` keys |
| `delivery/src/components/IncomingOrderPopup.tsx` | ~~Driver could miss a cancellation entirely if the app was closed during the cancel, briefly disconnected, accepted in a race with cancel, or closed while the cancel modal was on screen — walkthrough would continue on a cancelled order with no UI feedback~~ **FIXED** — added `fetchCancellationInfo` (`GET /api/orders/:trynbuyId/cancellation-info`) + `seedCancellation` helper, plus verification on app start, socket reconnect, pending-popup restore, and `dispatch:accept` ack failure. If the active order has `cancellationOnly: true` and current page isn't `/DeliverySuccessPage`, the modal is re-shown on next app start. Picked-cancellation flows already mid-return-to-store are not re-seeded so progress isn't reset. |

---

## Project Overview

| Project | Path | Tech | Purpose |
|---|---|---|---|
| **storetools** | `/storetools` | Nuxt 3 + ZenStack (Prisma) | Store owner/staff dashboard |
| **server** | `/server` | Express.js + Socket.io + pg | Customer-facing backend API + real-time |
| **marketplace** | `/marketplace` | Ionic Vue + Capacitor | Customer-facing mobile app |
| **delivery** | `/delivery` | Ionic **React** + Capacitor | Delivery partner mobile app — 27 routes, order walkthrough (incl. 4 Trynbuy pages), Leaflet maps, OTP auth |

**Shared DB:** PostgreSQL. Schema source of truth: `storetools/schema.zmodel` (ZenStack).
