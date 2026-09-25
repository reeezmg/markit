# Storetools — Nuxt Server API Routes + Server Utilities

---

## Server Utilities (`storetools/server/`)

### Prisma clients

| File | Export | Notes |
|---|---|---|
| `server/prisma.ts` | `prisma` — bare `PrismaClient` | Imports `distributorPaymentMiddleware` but **never registers it** via `$use` — middleware is dead code |
| `server/utils/prisma.ts` | `prisma` — `PrismaClient` with `$use` middleware | Auto-creates `Notification` rows on `Bill.create` (`ORDER_RECEIVED`) and `Expense.create` (`EXPENSE_CREATED`). Use this import when notifications should fire. |
| `server/db.ts` | `pool` — `pg.Pool` | Shared raw SQL pool, `DATABASE_URL` env var. Used by most routes needing raw queries. |

**Critical:** Routes importing from `~/server/prisma` do **not** get auto-notifications. Routes importing from `~/server/utils/prisma` do.

### Middleware (global Nitro middleware)

| File | Behavior |
|---|---|
| `server/middleware/cors.ts` | Adds CORS headers for Capacitor origins (`capacitor://localhost`, `http://localhost`, `http://localhost:3000`). Handles OPTIONS preflight (204). |
| `server/middleware/force-logout.ts` | On every request (except `/api/clientauth/*`): checks `session.authSessionVersion` against `AUTH_SESSION_VERSION` env var. Mismatch → deletes `nuxt-session` cookie + redirects to `/login`. Used to force re-login after breaking session schema changes. |

### Utils

| File | Export | Description |
|---|---|---|
| `server/utils/otp.ts` | `generateOtp()` | Returns 6-digit random number string (`Math.floor(100000 + Math.random() * 900000)`) |
| `server/utils/mailer.ts` | `sendEmailWithOtp(to, otp)` | Sends OTP email via nodemailer using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`. Port 465 uses implicit TLS; the sender is `SMTP_USER`. |
| `server/utils/generateSign.ts` | `generateSign(requestOption, app_secret)` | TikTok Shop HMAC-SHA256 request signing: sort params alphabetically → `{path}{params}{body}` → wrap with `app_secret` → HMAC-SHA256 hex. |
| `server/utils/tiktokDB.ts` | `updateCompanyForTiktok(...)` | Updates `Company` row with TikTok OAuth tokens (`tiktokAccessToken`, `tiktokRefreshToken`, `tiktokCipher`, `tiktokStoreName`, expiry fields). Uses `server/prisma` (bare). |
| `server/utils/distributorPayment.middleware.ts` | `distributorPaymentMiddleware` | Prisma middleware: after any `DistributorPayment` create/update/delete, recalculates `totalPaid` for the related `PurchaseOrder` and updates `paidAmount`. **Never registered** (see `server/prisma.ts` bug). Has `console.log(params)` on every call. |
| `server/utils/cleanUpDel.ts` | `applyBillDeletionCleanup(opts)` | Hard-deletes bills and re-sequences invoice numbers. Renumbering is set-based raw SQL (`UPDATE ... FROM` with `ROW_NUMBER()`) so cleanup does not issue one update round-trip per remaining bill. Bug fixed: inner `prisma.bill.update` changed to `tx.bill.update` to correctly participate in the Prisma transaction. |
| `server/utils/cleanUpGet.ts` | `previewBillsForReduction(opts)` | Dry-run: finds bills matching cleanup criteria. Returns the existing deletion plan plus `reductionPlan` / `reductionAmount` for exact amount-reduction cleanup. Reduce preview accepts repeatable `reductionRules[]` (`fromAmount`, `toAmount`, `reducePercent`); `toAmount = 0` means no upper limit, and each bill uses the first matching rule by bill total. Bug fixed: `timePref` was not used in `orderBy` — now applies `{ createdAt: timePref === 'oldest' ? 'asc' : 'desc' }`. Also adds `precedence: { not: true }` to exclude already-soft-deleted bills from candidates. |
| `server/utils/cleanUpReduce.ts` | `applyBillReductionCleanup(opts)` | Cleanup amount-reduction utility. Ensures `original_*` columns exist, stores first real bill/entry amounts (`bills.original_subtotal`, `bills.original_grand_total`, `bills.original_discount`, `entries.original_rate`, `entries.original_value`, `entries.original_discount`), then lowers `entries.rate`, `entries.value`, `bills.subtotal`, and `bills.grand_total` from the preview `reductionPlan`, recalculates `entries.tax` from the linked category tax config using the reduced per-unit value (`value / qty`), and sets visible bill/entry discounts to `0`. Treats `0` snapshot values as missing so accidental zero originals are backfilled from the current real value before reduction. |
| `server/utils/cleanUpSoftDel.ts` | `applySoftBillDeletionCleanup(opts)` | New utility. Sets `precedence = true` on matched `bills` and their `billHistories`, then re-sequences invoice numbers for remaining non-soft-deleted bills with one set-based raw SQL update. |
| `server/utils/db.ts` | — | Additional DB helpers for server routes |

### WebSocket server

**`server/ws/server.ts`** — standalone `ws` WebSocket server on **port 3003**.

- `clients: Map<companyId, Set<WebSocket>>` — tracks connected clients per company
- Connection: client must pass `?companyId=` query param, else closed with code 4001
- `broadcastToCompany(companyId, notification)` — sends `Notification` JSON to all open sockets for a company. Called by notification API routes after creating a notification.
- Cleans up empty company sets on disconnect

Used by: `useNotifications` composable (connects to `localhost:3003` in dev).

---

## Nuxt API Routes (`storetools/server/api/`)

All files under `storetools/server/api/`. These are Nuxt H3 route handlers, **distinct from the Express `server/` folder**.

Auth: most routes call `useAuthSession(event)` and read `session.data.companyId`.
DB: routes use either `pool` from `~/server/db` (raw SQL) or `prisma` from `~/server/prisma` / `~/server/utils/prisma`.

---

## Infrastructure (shared)

| File | Purpose |
|---|---|
| `~/server/db.ts` | `pool` — `pg.Pool` for raw SQL (accounts/ledger/bill routes) |
| `~/server/prisma.ts` | `prisma` — bare `PrismaClient`; `distributorPaymentMiddleware` is imported but **never registered** (bug) |
| `~/server/utils/prisma.ts` | `prisma` (separate instance) with `$use` auto-notification middleware: creates `Notification` on Bill.create (ORDER_RECEIVED) and Expense.create (EXPENSE_CREATED) |
| `~/server/ws/server.ts` | Raw `ws` WebSocket on port 3003; `broadcastToCompany(companyId, notification)` used by notify.post.ts |
| `~/server/middleware/cors.ts` | CORS: allows Capacitor + localhost origins; OPTIONS preflight |
| `~/server/middleware/force-logout.ts` | Compares `session.authSessionVersion` vs `AUTH_SESSION_VERSION` env; deletes cookie + redirects on mismatch |

---

## accounts/

Cash and bank ledger calculations. Auth via `useAuthSession`. Uses `pool` (raw SQL).

| Route | Method | Description |
|---|---|---|
| `accounts/cashledger` | GET | Cash ledger: `?from=&to=`. Reads persisted `account_ledger_entries` for `accountType=CASH`, computes opening from rows before `from`, and returns `{ cash, from, to, ledger[], closingBalance }` with stored `balanceAfter`. |
| `accounts/primaryledger` | GET | Primary bank ledger: `?from=&to=`. Reads persisted `account_ledger_entries` for `accountType=PRIMARY_BANK` and returns company bank metadata plus ledger rows. |
| `accounts/secondaryledger` | GET | Secondary bank ledger: `?from=&bankId=&to=`. Reads persisted `account_ledger_entries` for `accountType=BANK` + `accountId=bankId`. |
| `accounts/transactions*`, `accounts/transfers*`, `accounts/investments*`, `accounts/banks*`, `accounts/expenses*` | POST/PUT/DELETE | Ledger-aware account write APIs. Each source write rebuilds `account_ledger_entries` for that `sourceType/sourceId` and recalculates affected account balances from the changed date forward. |
| `accounts/primary-bank` | PUT | Updates primary bank details/opening balance and rebuilds the primary-bank opening ledger row. |
| `accounts/opening-balances` | PUT | Updates company cash + primary-bank opening balances/dates from settings and rebuilds both opening ledger rows. |
| `accounts/cash-ledger.pdf` | GET | PDF export of cash ledger. Fetches `/api/accounts/cashledger` via `$fetch` then generates jsPDF A4 with autoTable. Returns `application/pdf` |
| `accounts/bank-ledger.pdf` | GET | PDF export of primary bank ledger. Fetches `/api/accounts/primaryledger` then generates jsPDF A4. Returns `application/pdf` |

---

## bill/

Billing (POS) operations. Core transaction routes.

| Route | Method | Auth | Description |
|---|---|---|---|
| `bill/create` | POST | — | **Main bill creation transaction** now runs through lazily installed PL/pgSQL function `create_bill_plpgsql(jsonb)` via one steady-state route query (`SELECT create_bill_plpgsql($1::jsonb)`). Body: `{ payload, items, returnedItems, billPoints, clientId, companyId, couponId, uuid }`. The function inserts the bill row (including optional `account_id` for B2B credit or `credit_user_id` for staff credit), inserts entries set-wise from JSONB, updates stock with set-based JSONB deltas (`items.qty`, `items.sold_qty`), applies loyalty point mutations on save (`+billPoints`, `-redeemedPoints` when present), records coupon usage + increments `timesUsed`, creates earned GENERATE coupon vouchers in `coupon_clients` (single-use, `usage_limit = 1`), writes/recalculates staff credit `user_ledger_entries`, and writes/recalculates `account_ledger_entries` for the bill. **`invoice_number` is assigned by the DB trigger `trigger_generate_invoice_number` (BEFORE INSERT on `bills`), not by app code** — the insert passes `null` and reads the trigger value back via `RETURNING invoice_number`. Returns `{ success, billId, invoiceNumber, generatedCoupons }`. Retry on transient PG errors (up to 3×, exponential backoff). Logs failures to `save_error_requests` table. |
| `bill/offline` | POST | session | Stock-only update for offline billing: `{ items, returnedItems, companyId }`. Decrements/increments `items.qty` and `sold_qty` in transaction. Uses `pool` from `~/server/db` |
| `bill/update` | POST | session | Full bill edit in a raw SQL / pg transaction. **Batched (O(1) round-trips):** one batched SELECT of old entries, one bulk entry `UPDATE … FROM unnest(...)`, one bulk stock `UPDATE`, one batched DELETE — instead of per-row queries. Creates new entries, updates existing, prunes removed, adjusts stock, updates bill header (including separate `account_id` and `credit_user_id` credit-party columns), syncs the linked `user_credit_transactions` BILL/CREDIT row when staff credit is present or removes it when staff credit is cleared, reconciles loyalty points, and creates earned GENERATE coupon vouchers (`coupon_clients`, single-use). Returns `{ success, generatedCoupons }`. |
| `bill/createAccount` | POST | — | Creates B2B `accounts` record + optional `addresses` row in transaction. Body: `{ name, phone, address?, companyId }` |
| `bill/findBillCounter` | POST | session | Atomically increments `companies.bill_counter`, stores in session, returns value. **DEPRECATED / no longer called** by `billing.vue` — invoice numbers now come from the `bills` BEFORE INSERT trigger (`trigger_generate_invoice_number`). Endpoint left in place but unused. |
| `bill/by-barcode` | GET | session | Barcode lookup for billing page: `?barcode=`. Returns `{ id, size, qty, variant: { id, name, sprice, product: { name, categoryId } } }` or null. Uses raw SQL |
| `bill/findFirstItem` | GET | session | Full barcode scan for POS: `?barcode=`. Returns item with variant + category tax config (taxType, fixedTax, thresholds). More detailed than `by-barcode` |
| `bill/searchItems` | GET | session | Quote item typeahead: `?q=&limit=3`. Raw SQL search over in-stock item barcode, product name, variant name, and subcategory name for the current session company. Returns Prisma-like item rows with variant, product, category, barcode, size, qty, and prices |
| `bill/redeemClientPoints` | POST | — | Redeem or revert client loyalty points. Body: `{ companyId, clientId, points, mode: 'redeem'\|'revert' }`. `redeem` uses `AND points >= $3` guard. Returns updated `points` |
| `bill/findManyAccount` | GET | — | Lists accounts for company: `?companyId=` returns `[{ id, name, phone }]`. With `includeUsers=true`, returns grouped selector rows with account ids prefixed as `account:<id>` and staff ids as `user:<userId>`; user labels include `Name (code)` so code search works in POS/edit account selector. |
| `bill/findManyCategory` | GET | — | Lists active categories: `?companyId=`. Returns `[{ id, name, hsn }]` |
| `bill/findManyCoupon` | GET | — | Active coupons for company (within valid dates, `isActive=true`): `?companyId=`. Returns full coupon including `giftBarcode`, with `clients[]` from `coupon_clients` (each row includes `usageLimit` for generated-voucher remaining balance) and `used_clients[]` from `coupon_usages` |
| `bill/findUniqueClient` | GET | session | Client lookup by phone: `?phone=`. Returns `{ id, name, email, phone, companies: [{ points }] }` or null |
| `bill/findManyClient` | GET | session | Client lookup suggestions for billing/edit: `?q=`. Raw SQL over `clients` + `company_clients`, matches company-linked clients by `name ILIKE` or normalized phone digits, returns up to 5 rows ordered with exact name/phone matches first. Response shape: `[{ id, name, phone, email, points }]` |

---

## billEdit/

Bill edit page data helpers.

| Route | Method | Description |
|---|---|---|
| `billEdit/findUniqueBill` | GET | Full bill data for edit page: `?billId=&companyId=`. Returns bill + address + client + entries + coupon usage via raw SQL. Entries include item/variant shape |
| `billEdit/findEntriesToDelete` | POST | Entries to delete for a bill: `{ billId, companyId, excludeEntryIds? }`. Returns entries not in `excludeEntryIds`. Used to find stock to restore on edit |
| `billEdit/deleteBill` | POST | Soft-delete bill: sets `deleted=true`. Body: `{ billId, companyId }`. Returns 404 if already deleted |

---

## billSale/

Sales list page operations.

| Route | Method | Description |
|---|---|---|
| `billSale/findManyBills` | POST | Paginated, filtered, sorted bills list. Search rules (server-side): non-numeric → `clients.name ILIKE`; numeric AND fits int (≤ 2147483647) → `(b.invoice_number = N AND b.created_at > closingDate) OR c.phone ILIKE %N%` — invoice matches sorted to top via `invoice_match DESC`; numeric AND too large → `c.phone ILIKE` only. `closingDate` is read from the auth session and applies only to the invoice arm of the OR. Other filters: status, paymentMethods, min/maxGrandTotal, dateRange (date range is dropped when a search is active). Sort: invoiceNumber/createdAt/grandTotal/paymentStatus. Cleanup sessions use saved original bill/entry values where available for row values, min/max total filter, grand-total sort, and summary totals. Returns `{ rows[], total, totals }` |
| `billSale/deleteBill` | POST | Soft-delete bill: `{ billId, companyId }`. Returns `invoiceNumber` |
| `billSale/receipt` | GET | Print data for a bill receipt: `?id=`. Returns formatted print payload with entries, company info, totals, UPI ID, GSTIN, tqty/tvalue/ttvalue/tdiscount. **Bug:** `console.log('SALE ENTRIES:', sale.entries)` |
| `billSale/updateBillNotes` | POST | Update bill notes: `{ billId, companyId, notes }` |
| `billSale/updatePaymentStatus` | POST | Update bill payment status + method: `{ billId, companyId, status, paymentMethod }`. If status becomes PAID, also sets `created_at = now()` |

---

## cart/

Store frontend cart persistence (customer-facing e-commerce).

| Route | Method | Description |
|---|---|---|
| `cart/get` | GET | Get cart items: `?companyId=&clientId=`. Returns `{ items }` from `CartCompanyClient.cart.items`. Uses `utils/prisma` |
| `cart/update` | POST | Upsert cart: `{ companyId, clientId, items }`. Creates `CartCompanyClient` + `Cart` if not exists. **Bug:** `console.log('Cart updated:', cart)` |
| `cart/merge` | POST | Merge guest (local) cart with server cart after login: `{ guestItems, companyId, clientId }`. Adds quantities for matching variantId+size. **Bug:** `clientId` defaults to hardcoded UUID `'1db12f74-...'` as fallback |
| `cart/index.ts` | — | Index file (re-export or placeholder) |

---

## category/

| Route | Method | Description |
|---|---|---|
| `category/stock-by-category.pdf` | GET | PDF report: stock quantity grouped by category + subcategory. Auth required. Generates jsPDF A4 with alternating row shading. Returns `application/pdf` |

---

## cleanup/

| Route | Method | Description |
|---|---|---|
| `cleanup/getCleanupBill` | POST | Preview bill cleanup (dry-run). Delegates to `previewBillsForReduction(body)` from `utils/cleanUpGet`. Already-soft-deleted bills (`precedence = true`) are excluded from candidates. Returns both deletion fields (`deleteBillIds`, `leastInvoice`) and amount-reduction fields (`reductionPlan`, `reductionRules`, `reductionAmount`, `reductionRemainingAmount`, `reducedBillsCount`). `reductionRules[]` caps how much each eligible bill can be reduced by amount range; legacy/default behavior is one `0, 0, 100` rule. |
| `cleanup/deleteCleanupBill` | POST | Execute bill cleanup. Accepts `deleteType: 'soft' \| 'permanent' \| 'reduce'` in request body. Routes to `applyBillReductionCleanup` when `deleteType === 'reduce'`, `applySoftBillDeletionCleanup` when `deleteType === 'soft'`, else `applyBillDeletionCleanup` (hard delete + renumber). Delete paths batch invoice resequencing into a single SQL update instead of per-bill Prisma updates. |
| `cleanup/bulkPaymentMethod` | POST | Cleanup-only bulk payment method shift. Accepts date range, `sourceMethods[]`, `targetMethod`, `amount`, sort preferences, and `dryRun`. Preview returns affected bill plan. Apply updates affected bills in one set-based `UPDATE ... FROM jsonb_to_recordset`, converting partial simple-method bills to `Split` and editing existing `split_payments` while keeping split totals equal to `grand_total`. |

---

## coupons/

| Route | Method | Description |
|---|---|---|
| `coupons/generate` | POST | Legacy standalone GENERATE coupon endpoint. Body: `{ clientId, grandTotal }`. Checks minBillAmount, isBillCombine (aggregates past bills), perClientLimit, usageLimit. Creates `CouponClient` rows. Current billing/edit save flows instead generate earned coupons transactionally inside `bill/create` and `bill/update`. |

---

## Removed document APIs

The 2026-06-15 cleanup moved the former `general-preferences/`, `quotes/`, `sales-orders/next-number`, `invoices/next-number`, and `payments/next-number` route files out of active `storetools/server/api/`. Storetools no longer exposes active Nuxt API routes for the removed settings preferences, quotes, sales orders, service invoices, or received-payment document pages.

---

## discount/

| Route | Method | Description |
|---|---|---|
| `discount/apply` | POST | Bulk discount apply: `{ companyId, discountPercentage, filters }`. Filters: categoryId, subcategoryId, status, dateRange, brand, minRating, maxSprice, minMargin. Updates `variants.discount` + `variants.d_price` (= sprice - sprice×discount/100). Returns `updatedCount`. Creates own `Pool` (inline). |

---

## ecommerce-cms/

Custom storefront CMS APIs. Auth via `requireAuthSession(event)`, company-scoped by `session.data.companyId`, using `pool` raw SQL and table creation helpers in `server/utils/ecommFaqs.ts`.

| Route | Method | Description |
|---|---|---|
| `ecommerce-cms/storefront-source` | GET | Returns only the authenticated company's setup/readiness state, stable preview branch alias, and preview/production build statuses. While provisioning, it refreshes both initial deployments and their Vercel aliases, and marks the source ready only when both builds plus stable preview/production aliases are available; immutable deployment URLs, provider identifiers, and errors remain private. |
| `ecommerce-cms/storefront-source` | POST | Idempotently provisions the authenticated company's private GitHub repository and Vercel project. The server reads `companies.store_unique_name`, serializes concurrent attempts with a PostgreSQL advisory lock, connects the repository as a Vite project, disables Vercel SSO protection, upserts the shared custom-API base URL and server-derived company ID into Preview/Production Vite environments, sets the editor-origin allowlist only for Preview while keeping its Production value blank, then triggers `main` production plus `preview` preview deployments. The request accepts no seller-controlled provider, repository, company ID, branch, or build options. |
| `ecommerce-cms/storefront-agent/chat` | POST | Starts a stored background Antigravity interaction for the authenticated company's ready storefront. Accepts a browser-generated conversation ID, bounded prompt, and up to four bounded image inputs; repository identity, GitHub credentials, branch policy, agent instructions, and environment setup are server-derived. |
| `ecommerce-cms/storefront-agent/status` | GET | Polls only the authenticated company's stored interaction for the supplied conversation ID. Returns sanitized status/final model output while interaction and environment IDs remain server-side. On completion it compares the current `preview` commit with the request's starting SHA and, when changed, explicitly starts and records a Vercel preview deployment. |
| `ecommerce-cms/storefront-agent/sessions` | GET | Lists up to 30 recent company-scoped storefront agent sessions with title, lifecycle status/stage, timestamps and message count; private Gemini and repository identifiers are omitted. |
| `ecommerce-cms/storefront-agent/session` | GET | Loads one authenticated company's persisted storefront conversation messages and lifecycle state by conversation ID so the editor can reopen the same Antigravity interaction/environment chain. |
| `ecommerce-cms/faq` | GET/POST | Lists and creates company FAQ rows in `ecomm_faqs`; fields are `question`, `answer`, `sortOrder`, `status`. |
| `ecommerce-cms/faq/[id]` | PUT/DELETE | Updates or deletes a company FAQ row. |
| `ecommerce-cms/feedback` | GET/POST | Lists and creates custom storefront testimonials in `ecomm_feedback`, optionally linked to an existing company client via `company_clients`; fields include `customerName`, `title`, `message`, `rating`, `sortOrder`, `status`. |
| `ecommerce-cms/feedback/clients` | GET | Returns up to 200 clients linked to the current company for the feedback client selector. |
| `ecommerce-cms/feedback/[id]` | PUT/DELETE | Updates or deletes a company feedback row. PUT can clear or set `clientId` when the field is explicitly submitted. |
| `ecommerce-cms/blogs` | GET/POST | Lists and creates company blog rows in `ecomm_blogs`; fields include `title`, `slug`, `excerpt`, rich HTML `content`, optional image key, `tag`, `readMinutes`, `sortOrder`, `status`. |
| `ecommerce-cms/blogs/[id]` | PUT/DELETE | Updates or deletes a company blog row. |
| `ecommerce-cms/gallery` | GET/POST | Lists and creates storefront media rows in `ecomm_gallery`. Fields: `name`, `type` (`PHOTO`\|`VIDEO`), `mediaKey` (uploaded R2 object), `url` (YouTube link for VIDEO, image URL for PHOTO), `sortOrder`, `status`. At least one of `mediaKey`/`url` is required; both may be set. GET adds a computed `mediaUrl` and normalises legacy `YOUTUBE` rows to `VIDEO`. |
| `ecommerce-cms/gallery/[id]` | PUT/DELETE | Updates or deletes a gallery row. PUT merges against the stored row before validating, so a `{ status }`-only toggle does not trip the "needs an upload or a link" rule; `type` can be changed, `mediaKey`/`url` can be cleared by sending them as `null`. Deleting a row does **not** delete the R2 object. |

---

## like/

Store frontend wishlist (mirrors cart/ pattern).

| Route | Method | Description |
|---|---|---|
| `like/get` | GET | Get liked items: `?companyId=&clientId=`. Returns `{ items: variantIds[] }` from `LikeCompanyClient.like.variantIds` |
| `like/update` | POST | Upsert liked items (similar to cart/update) |
| `like/merge` | POST | Merge guest likes after login (similar to cart/merge) |

---

## notifications/

In-app notification system. Uses `utils/prisma` + WebSocket broadcast.

| Route | Method | Description |
|---|---|---|
| `notifications/index` | GET | List notifications: `?companyId=&userId=`. Returns last 50 notifications for company **excluding** the requesting user's own notifications. **Bug:** `console.log(userId)` |
| `notifications/notify` | POST | Manually create a notification. Body: `{ type: 'BILL'\|'EXPENSE'\|'ORDER'\|'LOW_STOCK', companyId, userId?, ... }`. Creates `Notification` record then POSTs to `http://localhost:3004/broadcast`. **Note:** uses `broadcastToCompany` import but calls HTTP instead |
| `notifications/[id]/read` | PATCH | Mark single notification read: route param `id` |
| `notifications/read-all` | PATCH | Mark all company notifications read: `?companyId=` |

---

## options/

Dropdown option loaders for filter UIs. All require `useAuthSession`.

| Route | Description |
|---|---|
| `options/brands` | Distinct brand names for company (active products). Returns `[{ label, value }]` |
| `options/categories` | Category options for company |
| `options/distributors` | Distributor options for company |
| `options/ratings` | Rating options for company products |

---

## products/

| Route | Method | Description |
|---|---|---|
| `products/create` | POST | **Product creation transaction** (raw SQL, own `Pool`). Body: `{ payload{name,brandId,description,status}, variants, companyId, poId?, category?, subcategory?, categoryTax?, deliveryType, productId? }`. One transaction, **batched** multi-row variant + item inserts (items seed `initial_qty = qty`). Writes `brand_id` (earlier `brand` non-existent-column bug fixed). Accepts optional caller `productId`. Retry on transient PG errors. Logs failures to `save_error_requests` |
| `products/[id]` | GET | session | Raw SQL product read (product + brand/category/subcategory + variants + items), camelCase shape. Replaces `useFindUniqueProduct` (edit page) |
| `products/update` | POST | session | Raw SQL product update (one txn): COALESCE product fields, prune removed variants/items, **batched** multi-row variant + item upserts (`ON CONFLICT`), server-side tax recalc. `initial_qty` seeded on item INSERT only (preserved on existing items). Replaces nested `useUpdateProduct` |
| `products/by-ids` | POST | session | Raw SQL product list by `{ ids }` (brand/category/subcategory + variants + items incl. `initialQty`). Replaces `useFindManyProduct` (draft table) |
| `products/delete` | POST | session | Raw SQL product delete `{ id }` (company-scoped; variants/items cascade). Replaces `useDeleteProduct` |
| `products/category-tax` | GET | session | Category tax fields `?id=` for variant tax recalc. Replaces `useFindUniqueCategory` |
| `products/save-batch` | POST | session | **Deferred batch save** (one txn): all staged products + variants + items (batched multi-row), optional new PO (`po`) or link to existing (`poId`), PO-linked credit/payment. Returns created products with trigger barcodes. **O(1) round-trips regardless of product count.** Used by the staged add-products flow |

---

## purchaseorder/

| Route | Method | Description |
|---|---|---|
| `purchaseorder/create` | POST | Creates empty `PurchaseOrder` for session company. Returns `{ id }`. Used by distributor/PO flows that route to `/products/purchase?poId=...`; `/products/add` no longer calls it up front. **Bug:** `console.log('res', res)` |
| `purchaseorder/save` | POST (session) | Raw SQL atomic PO create: increment `companies.purchase_counter` (number = counter-1; the `assign_purchase_order_number` trigger no-ops since the number is preset), link `productIds`, create PO-linked `DistributorCredit` (CREDIT) or `DistributorPayment`. No money_transaction (no cash/bank ledger cascade). Replaces add.vue's `handleSaveWithPO` ZenStack chain |
| `purchaseorder/update` | POST (session) | Raw SQL atomic PO edit: the 6-branch credit/payment transition matrix (create/delete/update keyed by `purchase_order_id`) + PO row update. Replaces `syncEditedPurchasePayment` |
| `purchaseorder/[id]` | GET (session) | Raw SQL PO read (PO + products + variants + items incl. `initialQty`). Replaces `useFindUniquePurchaseOrder` |

---

## report/

Analytics and reporting endpoints. All auth via `useAuthSession`.

| Route | Method | Description |
|---|---|---|
| `report/report` | GET | Basic KPI summary: totalItems, totalActiveItems, totalItemsWithImages, totalExpenses, totalSales, totalDiscounts, totalTax, salesByPaymentMethod. Uses `pool`. Cleanup sessions use preserved original bill totals and entry values where available for sales/payment/category/brand totals |
| `report/dashboard` | GET | **Main accounts report**: `?startDate=&endDate=`. 10 parallel SQL queries for pre-period opening balances (cash+bank each: sales, expenses, distributor, money, transfers). Then period queries for: sales breakdown (cash/UPI/card/credit + split), brand sales, credit sales, expenses, distributor payments, category sales, transfers, money transactions. Returns full balances + cashBalance/bankBalance + revenueByCategory + categorySales + brandSales |
| `report/profit` | GET | Profit report: `?startDate=&endDate=`. Entry-level COGS calculation using `v.p_price` or category margin fallback. Returns `{ summary, bills[], categoryProfit[], categoryProfitChart[] }` |
| `report/expenses` | GET | Expenses list: `?startDate=&endDate=`. Returns entries with `expensecategory.name`, formatted for reports page |
| `report/account` | GET | **Accounts report** (Finance page): `?from=&to=`. Calculates cash+bank opening balances, then period: sales/expenses/distributor/money/transfers/investments/account_transfers. Returns `{ balances, breakdown, pnl, charts }` with cash/bank flow chart data |
| `report/online` | GET | Markit (online) sales report: `?startDate=&endDate=`. Same as report/report but filtered to `is_markit=true`. Returns `totalSales, salesByPaymentMethod, revenueByCategory, categorySales, billCount` |
| `report/onlinebills` | GET | Online bills list |
| `report/generate-sales.pdf` | GET | **Full store summary PDF**: A4 with tables for Opening/Closing Balance, Sales, Expenses, Distributor Purchases, Transfers, Transactions, Bills list, Expense details, Expense by Category. Cleanup sessions use original bill grand total/subtotal where available. Returns `application/pdf` |
| `report/generate-sales.excel` | GET | Excel export of sales data. Cleanup sessions use original bill grand total/subtotal where available |
| `report/generate-profit.pdf` | GET | Profit summary PDF: Sales, COGS, Profit, Total Expense, Net Profit. Simple 5-row table. Returns `application/pdf` |
| `report/gstr1` | GET | GSTR-1 (outward supplies). Sources from `bills + entries` filtered to `b.deleted=false`, `b.payment_status IN (PAID,PENDING)`, `b.is_markit=false`. Returns kpi + rate-wise + HSN summary. |
| `report/gstr3b` | GET | GSTR-3B (summary return). Outward from `bills/entries` (split into `taxable` vs `nil` by tax > 0). **Table 4 (ITC)** sources from `distributor_credits` where `money_transaction_id IS NULL`, joined to `purchase_orders → products → variants → items` for taxable+tax breakdown (only `v.tax > 0`). AMOUNT-type credits are excluded (cash inflows, not goods inward). |
| `report/gstr2b` | GET | GSTR-2B (inward supplies / ITC). Source: `distributor_credits` where `money_transaction_id IS NULL`. PO-linked credits join to `products → variants → items` for per-tax-rate breakdown (taxable = `initial_qty * p_price`, tax = same × `v.tax/100`). Manual credits (no PO) are included as flat 0%-tax taxable rows. Aggregation done in JS into `{ kpi, rateSummary, distributorSummary }`. |
| `report/generate-gstr1.excel` | GET | Excel export of GSTR-1. |
| `report/generate-gstr3b.excel` | GET | Excel export of GSTR-3B. Same Table 4 ITC source change as `gstr3b.get.ts`. |
| `report/generate-gstr2b.excel` | GET | Excel export of GSTR-2B. Same `distributor_credits` + items source as `gstr2b.get.ts`; writes Summary / Rate-wise ITC / Distributor-wise sheets. |

---

## downloads/

Per-distributor and per-PO PDF/Excel export endpoints. All auth via `useAuthSession`.

| Route | Method | Description |
|---|---|---|
| `downloads/distributor-po.pdf` | GET | Distributor PO list PDF: `?distributorId=&startDate=&endDate=&search=&paymentType=&dueOnly=`. |
| `downloads/distributor-po.excel` | GET | Excel version of the above. |
| `downloads/distributor-credits.pdf` | GET | **Distributor transactions PDF.** `?distributorId=&startDate=&endDate=&type=ALL\|PURCHASE\|CREDIT\|PAYMENT\|PURCHASE RETURN`. When `startDate`/`endDate` are omitted (called by the main-table "Download Transactions" action), the endpoint returns the all-time ledger. Sources: `distributor_credits` (split into PURCHASE if `purchase_order_id` is set else CREDIT) + `distributor_payments` (PAYMENT or PURCHASE RETURN if `payment_type='RETURN'`, with `return_no` joined from `purchase_returns`). Layout: TRANSACTIONS centered title → company name + address (street/locality/city/state/pincode/phone/GSTIN from `companies` LEFT JOIN `addresses`) → distributor name (14pt) + address (9pt grey) → single-line meta `PERIOD: From – To    GENERATED: ...` → table (Date · No · Type · Remarks · Debit · Credit) with green/red row backgrounds via `didParseCell` → footer with **Opening Balance · Total Debit · Total Credit · Closing Balance (Due)**. Opening balance = `distributor_companies.opening_due` + (credits − payments before `startDate`) when a window is set; closing = opening + total credit − total debit. |
| `downloads/distributor-credits.excel` | GET | Excel version with the same shape: title row, period row, header (Date/No/Type/Remarks/Debit/Credit), data rows with green/red fills, then a footer block with Opening Balance / Total Debit / Total Credit / Closing Balance. |
| `downloads/purchase-return.pdf` | GET | Single purchase-return PDF: `?purchaseReturnId=`. Bill-receipt style header (company + RETURN TO distributor) and items table. |
| `downloads/user-sales.{pdf,excel}` | GET | Per-user sales export. |
| `downloads/user-expenses.{pdf,excel}` | GET | Per-user expenses export. |

---

## user/

| Route | Method | Description |
|---|---|---|
| `user/report` | GET | User sales report: `?startDate=&endDate=`. Groups entries by `companyUser.name`, distributes bill-level discount proportionally per entry via shared `server/utils/user-sales.ts` net-sales helper (also used by payroll commission). Returns `{ labels[], countData[], salesData[], entryGroups{} }` |
| `users/ledger` | GET | Authenticated complete per-user ledger. Groups `user_ledger_entries` by `company_users` and returns total credit, total debit, latest balance, and expanded ledger entries with `balanceAfter`. Includes payroll accrual, salary payment, user credit bill, credit bill payment/reduction, opening, and adjustment rows. |
| `users/credit-ledger` | GET/POST | Authenticated credit-only filtered ledger. GET groups only `USER_CREDIT_BILL` + `CREDIT_BILL_PAYMENT` rows from `user_ledger_entries` by `company_users`; the same rows also appear in `users/ledger`. POST creates a manual credit or payment/reduction row for a staff user. |
| `users/credit-bills` | GET | Authenticated source/detail list for staff credit bills (`bills.credit_user_id`). Groups bills by staff user and calculates bill credit amount from the Credit split amount for Split bills or `grand_total` otherwise. |
| `salary/pay-with-credit` | POST | Authenticated payroll payout endpoint. In one pg transaction, optionally inserts a `salary_payments` + `money_transactions` salary payout and creates/updates a `user_credit_transactions` PAYROLL/PAYMENT row for credit cut by cycle line. Allows zero cash salary when the whole line is reduced by credit. |

---

## Root-level routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `aify.post` | POST | — | AI product image: `{ url, key, view?, categoryName?, targetAudience? }`. Fetches image from URL, sends to Gemini 2.5 Flash (up to 3 attempts), resizes to 1024×1024 WebP, uploads to Cloudflare R2. Falls back to original on AI failure. Returns `{ success, url, usedAiImage, aiAttempts }` |
| `r2/upload.post` | POST | seller session | Validates an image data URI and object key, then uploads it through the server-only R2 client; browser code never receives R2 credentials |
| `r2/signed-url.post` | POST | seller session | Validates an object key and returns a server-generated signed R2 GET URL with a one-hour expiry |
| `r2/upload-url.post` | POST | seller session | `{ key, contentType }` → presigned R2 **PUT** URL (15 min) for a direct browser→R2 upload, plus the public `https://images.markit.co.in/{key}`. Content type must be `image/*` or `video/*`. Used by the gallery CMS for files too large to base64 through a serverless route (Vercel caps request bodies at ~4.5MB). Requires PUT + the storetools origin in the R2 bucket's CORS policy. |
| `r2/delete.post` | POST | seller session | `{ keys: string[] }` → deletes uploaded media from R2 after the row referencing it was removed or its image replaced. Any key a row still points at is **skipped** (see `server/utils/mediaCleanup.ts`), which is what makes the endpoint safe to call from the browser — a caller can only ever delete an already-detached key. Returns `{ deleted, count }`. Never throws on cleanup failure. |
| `applyPromoCode.post` | POST | — | Apply promo code: `{ code }`. **Bug:** calls `prisma.promoCode` but model is `Coupon` — runtime error |
| `create-order.post` | POST | — | Razorpay order creation: `{ amount }`. Returns Razorpay order object. Uses `RAZORPAY_KEY_ID`/`RAZORPAY_SECRET` env vars |
| `dashboard.get` | GET | session | **Legacy dashboard** — fetches all data via Prisma (products, items, variants, bills+entries+expenses) and computes everything in JS. Returns 20+ computed fields. Deprecated in favor of `lib/api/useDashboardData.ts` ZenStack hooks. **Bugs:** `console.log("here")`, date filter uses `new Date(undefined)` if no query params |
| `gemini.js` | POST | — | **Cloudflare Worker** source file (not a Nuxt route). HMAC-signed upload secret auth, calls Gemini 2.5 Flash, stores AI image to R2 |
| `gettax.get` | GET | session | Returns company categories with tax config: `{ id, shortCut, fixedTax, taxBelowThreshold, taxAboveThreshold, thresholdAmount, taxType }` |
| `getuser.get` | GET | — | Returns company users: `?companyId=`. Maps `CompanyUser` + `user.email/image`. **Bug: no auth check** — any caller can enumerate company users |
| `item.post` | POST | session | Regenerate items for variants: `{ variants }`. Deletes existing items for variantIds, creates fresh items (with sizes). Returns created items with variant+product. **Bug:** `console.log(res)` |
| `items/findFirst` | GET | session | Find item by `?sPrice=&categoryId=`. Used for manual price entry in billing. Returns item + variant + category tax |
| `mails.ts` | GET | — | Returns hardcoded mock mail data (Nuxt UI template stub, not in use) |
| `model/[...].ts` | — | — | ZenStack model proxy (forwards requests to ZenStack runtime) |
| `notifyfcm.post` | POST | — | Send FCM push to all admin users of a company. Body: `{ companyId, excludeDeviceId?, title, body }`. Uses raw SQL `pool` to fetch `company_users` + `push_token` rows, then sends via FCM v1 API using GoogleAuth service account (`GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` env vars). Route now soft-fails and returns `{ success: false }` on notification-side errors so billing save is not blocked |
| `savefcmtoken.post` | POST | — | Register/update web FCM push token: `{ fcmToken, userId, companyId, deviceId, deviceInfo? }`. Upserts `PushToken` by `userId_deviceId` |
| `savecaptoken.post` | POST | — | Register/update Capacitor native push token: `{ token, userId, companyId, deviceId, deviceInfo? }`. Upserts `CapPushToken` |
| `secret.ts` | GET | session (requireAuth) | Auth test endpoint. Returns email from session. Not used in production |
| `send-otp.ts` | POST | — | Send OTP to email: `{ email }`. Generates 6-digit OTP, stores in `EmailOtp` with 10min expiry, sends via Gmail SMTP (`utils/mailer`) |
| `verify-otp.ts` | POST | — | Verify email OTP: `{ email, otp }`. Checks expiry, validates match, deletes record on success |
| `shopifyRegister.post` | POST | — | Shopify login: `{ email, password }`. Looks up user by email, compares hashed password. Returns `{ companies }`. **Bug:** references undefined `shopifyLogin` function (should be `import { shopifyLogin }`) |
| `shopify/shopifyProduct` | POST | session | Create product on Shopify: `{ productData }`. Uses `session.shopifyAccessToken`. Hardcoded to `bazaartests.myshopify.com` |
| `shopify/shopifyImage` | POST | session | Shopify image operations |
| `stock-aggregate.post` | POST | — | Stock aggregation: `{ companyId, filters, groupBy }`. Groups variants by category/brand/rating/date/distributor. Returns `[{ [groupBy], stock, purchaseStock, qty }]`. **Bug:** `console.log` dumps full category breakdown on every category-grouped request |
| `tiktok/getToken` | POST | — | TikTok OAuth token exchange: `{ code, companyId }`. Calls TikTok auth API, fetches shop list, stores tokens + cipher + shop name via `updateCompanyForTiktok`. **Bugs:** `app_key`/`app_secret` hardcoded in source; hardcoded `x-tts-access-token` header |
| `tiktok/getShopName` | GET | — | Get TikTok shop name. **Bugs:** `app_key`/`app_secret` hardcoded; hardcoded `x-tts-access-token`; calls `generateSign(requestOption, app_secret)` but signature function expects `(path, timestamp)` — wrong call signature |
| `updateCompany.put` | PUT | — | Update company with Shopify store name + access token: `{ shopifyStoreName, shopifyAccessToken, companyId }`. Delegates to `utils/db.updateCompany` |
| `upload.ts` | POST | — | **Main image upload handler** (fire-and-forget). Accepts `{ base64, key, isAiImage?, view?, categoryName?, targetAudience? }`. Responds immediately with `{ received: true }`, then processes in background via `setTimeout`. Background: if `isAiImage=true`, sends to Gemini (3 retries), resizes to 1024×1024 WebP, uploads to R2. If `isAiImage=false`, uploads original directly |
| `whatsapp/send-payment-template` | POST | — | Send WhatsApp invoice notification. Body: `{ phone, name, billName, amount, paymentDate, receiptId }`. Uses `invoice_1` template via Facebook Graph API v25.0. Env: `WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN` |
| `whatsapp/send-coupon-message` | POST | — | Sends a free-form WhatsApp text message for earned generated coupons after receipt send. Body: `{ phone, name, companyName, coupons[] }`. Includes coupon numbers/details; barcode image sending requires a hosted media/template flow and is not implemented here. |
| `whatsapp/send-pending-template` | POST | — | Send WhatsApp pending invoice reminder. Body: `{ phone, name, billName, amount, dueDate, receiptUrl, paymentUrl }`. Uses `pending_invoice_1` template via Facebook Graph API v25.0. Two URL buttons: receipt link + UPI payment link. Phone auto-prefixed with `91`. Env: `WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN` |
| `whatsapp/webhook` | GET/POST | — | WhatsApp webhook. GET: verification (hardcoded `VERIFY_TOKEN = 'markit123'`). POST: handles incoming text, voice note, image, and PDF messages, resolves sender phone to `CompanyUser`, routes the session through Gemini + MCP, and sends the AI reply back to WhatsApp. **Bug:** verify token hardcoded |
| `statement/_helpers.ts` | — | — | Shared module: `fetchCompanyContext`, `classifyRow` (Gemini AI with DB context), `executeOperation` (INSERT using meta UUIDs), `deleteExecutedRecord`, `upsertMapping`, `parseMeta` |
| `statement/upload.post` | POST | session | Upload bank statement (base64 PDF/image). Extracts rows via Gemini `gemini-3-flash-preview`, saves batch + rows, auto-matches mappings (30% keyword overlap). Body: `{file, mimeType, fileName?, bankAccountId?}`. Returns `{batchId, rowCount, matched, unmatched}` |
| `statement/find-operation.post` | POST | session | AI-classify a statement row. Uses `classifyRow` with full DB context (categories, users, distributors, bank accounts with IDs). Saves operation+meta+userInput to row + upserts mapping. Resets `executed=false` on re-assign. Body: `{rowId, userInput, bankAccountId}` |
| `statement/execute-row.post` | POST | session | Execute a single assigned row — creates actual DB record using meta UUIDs. Handles re-execution (deletes old record first). Returns `{success, operationId, operation, meta, insertedData}`. Body: `{rowId, bankAccountId}` |
| `statement/execute.post` | POST | session | Batch execute all assigned rows in a batch. Marks batch EXECUTED. Posts summary to AI chat if chatId. Body: `{batchId, bankAccountId}` |
| `statement/row/[id].put` | PUT | session | Manual update of a row's operation/meta/label/userInput. Upserts mapping. |

---

## Bugs

| File | Bug |
|---|---|
| `bill/findBillCounter.post.ts` | `console.log('res', res?.billCounter)`; also now-unused (invoice numbering moved to DB trigger) |
| `billSale/receipt.get.ts` | `console.log('SALE ENTRIES:', sale.entries)` on every receipt load |
| `cart/update.post.ts` | `console.log('Cart updated:', cart)` on every update |
| `cart/merge.post.ts` | Fallback `clientId` hardcoded to a real UUID (`1db12f74-8805-42be-95a6-26d807151000`) |
| `applyPromoCode.post.ts` | Calls `prisma.promoCode` but model is `Coupon` — runtime crash |
| `notifications/index.get.ts` | `console.log(userId)` on every request |
| `notifications/notify.post.ts` | Imports `broadcastToCompany` but calls `http://localhost:3004/broadcast` HTTP instead — duplicate/inconsistent |
| `purchaseorder/create.post.ts` | `console.log('res', res)` |
| `getuser.get.ts` | No auth check — any caller can enumerate company users by `companyId` |
| `item.post.ts` | `console.log(res)` after createMany |
| `items/findFirst.get.ts` | `console.log('Query:', query)` on every barcode lookup |
| `stock-aggregate.post.ts` | Full category breakdown `console.log` on every request |
| `dashboard.get.ts` | `console.log("here")` on every request; `new Date(undefined)` if dates missing |
| `tiktok/getToken.post.ts` | `app_key`/`app_secret` hardcoded in source; hardcoded `x-tts-access-token` header (expired token) |
| `tiktok/getShopName.get.ts` | Same hardcoded credentials; `generateSign` called with wrong args (object instead of path string) |
| `whatsapp/webhook.ts` | `VERIFY_TOKEN = 'markit123'` hardcoded (should be env var); inbound WhatsApp AI reply flow still depends on this token being configured in Meta webhook settings |
| `~/server/prisma.ts` | Imports `distributorPaymentMiddleware` but never calls `prisma.$use()` — middleware never activates |
| `accounts/primaryledger.get.ts` | `console.log({...openingBalance breakdown})` on every request |
| `shopifyRegister.post.ts` | References `shopifyLogin` which is not imported |
