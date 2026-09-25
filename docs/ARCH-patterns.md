## Known Issues / Bugs

- `prisma.promoCode` is called in `storetools/server/api/applyPromoCode.post.ts` but there is NO `PromoCode` model in the schema. This will throw a runtime error. The correct model may be `Coupon` — needs investigation.

---

## Key Enums

| Enum | Values |
|---|---|
| `UserRole` | admin, user, manager, biller, accountant |
| `CompanyType` | seller, buyer |
| `OrderType` | STANDARD, BOOKING, TRY_AT_HOME, BILL |
| `OrderStatus` | PENDING, CONFIRMED, PACKED, DELIVERED, CANCELED, OUTOFSTOCK, BOOKED |
| `PaymentStatus` | PENDING, APPROVED, PAID, REJECTED, COMPLETED, FAILED |
| `PayableStatus` | PENDING, PARTIALLY_PAID, PAID, CANCELLED |
| `paymentType` | CREDIT, CASH, CARD, UPI, BANK, CHEQUE |
| `PaymentMode` | CASH, CARD, BANK, UPI, CHEQUE |
| `TaxType` | FIXED, VARIABLE |
| `CouponType` | PERCENTAGE, FLAT, GIFT |
| `CouponTarget` | ALL, CATEGORY, PRODUCT |
| `CouponAudience` | ALL, GENERATE, SPECIFIC |
| `PartyType` | CUSTOMER, SUPPLIER, EMPLOYEE, OWNER, OTHER |
| `TransactionDirection` | GIVEN, RECEIVED |
| `InvestmentDirection` | IN, OUT |
| `AccountType` | CASH, BANK, INVESTMENT |
| `NotificationType` | ORDER_RECEIVED, BILL_CREATED, PAYMENT_RECEIVED, EXPENSE_CREATED, INVENTORY_LOW, SHIPMENT_SENT, SYSTEM_ALERT |

---

## Layouts (storetools)

Three layouts in `storetools/layouts/`:

### `default.vue` — Main storetools dashboard
Used by all store owner/staff pages. Built on Nuxt UI Pro `UDashboardLayout`.

**Cleanup sidebar gating:** Uses `const cleanupUnlocked = useState('cleanup-unlocked', () => false)` shared with `pages/cleanup.vue`. Computed `showSidebar` is `route.path !== '/cleanup' || cleanupUnlocked.value`. The `UDashboardPanel` (sidebar) has `v-if="showSidebar"` — hidden on `/cleanup` until the user unlocks it in-page.

**Navigation is plan-gated:**
- `free` / `lite` plan → `simplifiedLinks` (flat list: Offline, Sales, Reports, Products, Categories, Brands, Stocks, Try N Buy, Bookings, Users, Client, Settings)
- `pro` plan → `baseLinks` (grouped sidebar with children)

The sidebar has ERP and Storefront tabs in both expanded and collapsed modes. The collapsed switcher is a vertical two-icon toggle in the non-scrolling sidebar header, with reduced body padding so the icon list fits the 64px panel. Both versions use the primary theme color for the active tab. ERP shows the plan-appropriate links except Ecom and AI. Storefront shows Storefront Editor directly, then Content (FAQ, Blogs, Gallery, Policies), Customer (Messages, Feedback), Commerce (Payment, Shipping), AI, and Settings. These storefront groups reuse the plan-appropriate Ecom children, preserving their routes and labels. Settings appears in both tabs. Routes under `/storefront/`, `/ecommerce-cms/`, and `/ai/` select Storefront automatically; other non-Settings routes select ERP. The sidebar search button and dashboard search overlay have been removed.

**`baseLinks` structure (pro plan):**
| Section | Sub-pages |
|---|---|
| ERP | Billing, Sales, Expenses, Accounts |
| Reports | Sales *(admin+manager)*, Profit *(admin only)*, Accounts Report *(admin only)*, Online, Users *(only if `isUserTrackIncluded`)* |
| Products | All Products, Categories, Brands, Stocks |
| Distributor | All Distributors, Purchase Order *(Credit link commented out — merged into distributor index)* |
| Orders | Try N Buy, Bookings *(only if companyType = seller or buyer)* |
| Accounts | Banks, Cash, Investments, Transfers, Transactions |
| Users | — |
| Client | — |
| Coupons | — |
| Settings | General, Store, Printer |

**Live badge:** Try N Buy nav item shows a badge count of pending orders (`trynbuys` where `orderStatus = ORDER_RECEIVED`, filtered by `companyId`). Refreshes when `checkoutStore.lastUpdate` changes.

**Global components in layout:** `TeamsDropdown`, `UserDropdown`, `HelpSlideover`, `NotificationsSlideover`, `AiChatChatBox`

### `marketing.vue` — Marketing/landing pages
Minimal layout — just a `<slot />` and footer.
- Company: **Flobit Technologies Private Limited**
- Background: `#F8FDF3`
- Used by: landing page, terms, etc.

### `store.vue` — Dedicated store e-commerce page (PAUSED)
Layout for the per-store customer-facing shopping experience (accessible via `/store/[company]/...`).
- Uses `$authClient` (client auth — paused feature, separate from main storetools auth)
- Desktop: sidebar navigation | Mobile: fixed bottom navigation bar
- Nav links: Store, Orders, Wishlist, Cart, You
- Routes built with `formatStoreRoute(route.params.company, path)`
- Footer shows `ClientDropdown` when client is logged in

---

## Authentication (storetools)

### Overview
- **Type:** Cookie-based session (Nuxt `useSession` from h3)
- **Password hashing:** SHA-512 via Web Crypto API (`crypto.subtle.digest`)
- **Session cookie:** maxAge 1 year, `secure + sameSite=none` in prod, `lax` in dev
- **Session config:** name/password from `runtimeConfig.auth`
- **Global access:** `$auth.session`, `$auth.loggedIn`, `$auth.updateSession` — provided via `auth/plugins/0.auth.ts`
- **Session contains:** user id, email, image + full company snapshot (to avoid repeated DB queries on every request)

### Auth Location
- Server routes: `storetools/auth/server/api/auth/`
- Utilities: `storetools/auth/server/utils/session.ts` (`useAuthSession`, `requireAuthSession`, `hash`)
- DB helpers: `storetools/auth/server/utils/db.ts`
- Client composable: `storetools/auth/composables/auth.ts`
- Plugin: `storetools/auth/plugins/0.auth.ts`

> Note: Files/folders prefixed with `client` in the auth folder (e.g. `clientAuth.ts`, `clientSession.ts`, `clientdb.ts`, `clientauth/` API folder) are for a **paused** dedicated store e-commerce page feature — NOT the marketplace and NOT the main storetools login.

### Auth API Routes (`/api/auth/`)

| Route | Method | Purpose |
|---|---|---|
| `login` | POST | Verify email+password, write full session |
| `register` | POST | Create company + user + defaults, then auto-login |
| `logout` | POST | Clear session |
| `existinguser` | POST | Check if email already registered |
| `forgetPassword` | POST | Change password (requires current password — misnamed, not a forgot-password flow) |
| `session` | GET | Return current session data |
| `session` | PUT | Overwrite session fields |
| `change*.put.ts` | PUT | Individual company setting updates (logo, tax, delivery config, notes, timing, address, etc.) — each calls `useAuth().updateSession()` after DB update |

### Session Data (AuthSession type)
The session stores a full snapshot of user + company config at login time:
- User: `id`, `email`, `image`, `cleanup`, `cleanupCode`, `role`, `code`, `type`
- Company: `companyId`, `companyName`, `companyType`, `storeUniqueName`, `plan`, `currency`, `gstin`, `logo`
- Config flags: `isTaxIncluded`, `isCostIncluded`, `isUserTrackIncluded`, `isAiImage`
- Delivery: `deliveryType[]`, `deliveryMode[]`, `deliveryRadius`, `deliveryFeesPerKm`, `waitingTime`, `waitingChargesPerMin`, `minDeliveryCharges`, `fundDeliveryFees`
- Finance: `accHolderName`, `ifsc`, `accountNo`, `bankName`, `upiId`, `openTime`, `closeTime`
- CRM: `pipelineId`
- UI config: `productInputs` (field visibility flags), `variantInputs` (field visibility flags)
- Internal: `purchaseExpenseCategoryId` (stored to link distributor payments to "Purchase" expense category without an extra query), `authSessionVersion`

### Plans & Routing
| Plan | Default Route |
|---|---|
| `free` | `/offline` |
| `lite` | `/offline` |
| `pro` | `/erp/billing` |

Route guard in `0.auth.ts` plugin enforces plan-based access. Last route is persisted in `localStorage` and restored on next login.

### On Registration — Auto-created Records
When a new company registers, these records are automatically created:
1. `Company` with `variantinput: { create: {} }` and `productinput: { create: {} }`
2. `CompanyUser` with `role: admin`, `code: 1`
3. `ExpenseCategory` named `"Purchase"` (default category for distributor purchase expenses)
4. `Pipeline` (empty CRM pipeline)

If the email already exists (user joining a second company), only a new `CompanyUser` record is created linking them to the new company — no new `User` is created.

### Session Update Pattern
After any company setting is changed via a `change*.put.ts` route, the session is refreshed client-side via `useAuth().updateSession()` which re-fetches `GET /api/auth/session`. This keeps the in-memory session in sync with DB without a full re-login.

---

## DB Access Patterns in storetools

1. **Prisma ORM** — used for most CRUD operations in `server/api/` routes
2. **Raw SQL via `pg` pool** (`~/server/db`) — used for complex financial ledger queries in `server/api/accounts/`. Tables accessed this way: `companies`, `bills`, `expenses`, `expense_categories`, `money_transactions`, `account_transfers`, `distributor_payments`, `distributors`, `distributor_companies`, `purchase_orders`, `bank_accounts`, `cash_accounts`
3. **ZenStack** — `schema.zmodel` is the master schema. Run ZenStack CLI to regenerate `prisma/schema.prisma`. Never edit the prisma file directly.

---

---

## ZenStack Hooks Pattern

ZenStack auto-generates reactive hooks from `schema.zmodel` into `~/lib/hooks`. These are used **instead of writing custom API routes** for standard CRUD operations.

```ts
// Example — instead of a custom API, use hook directly in the page:
import { useFindManyCompanyUser, useUpdateCompanyUser, useCreateUser } from '~/lib/hooks'

const { data: users } = useFindManyCompanyUser(queryArgs)
UpdateCompanyUser.mutate({ where: {...}, data: {...} })
```

- Hooks support `optimisticUpdate: true` for instant UI feedback
- Available for every model: `useFindMany*`, `useFindUnique*`, `useCreate*`, `useUpdate*`, `useUpdateMany*`, `useDelete*`, `useCount*`
- Custom API routes (`server/api/`) are only written when logic is too complex for hooks (aggregations, reports, raw SQL, multi-step operations)

**Access policy convention:** `@@allow` rules use `userId == auth().id` (not `user == auth()`) to check ownership via the `CompanyUser` junction. Models with company-scoped write access (Company, Category, Subcategory, Brand, Product, Variant) all use `company.users?[userId == auth().id]`.

---
