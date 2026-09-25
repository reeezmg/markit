# Storetools — Auth Module + Nuxt Config

Covers: `storetools/auth/` (Nuxt layer for session management) and `storetools/nuxt.config.ts`.

---

## Auth Module Overview

`storetools/auth/` is a **Nuxt layer** extended by the main app (`extends: ['@nuxt/ui-pro', './auth']` in `nuxt.config.ts`). It provides:

- Server-side session management for **seller/staff** (`AuthSession`) and **client/customer** (`AuthClientSession`)
- H3 `useSession` cookie-based sessions (encrypted with `NUXT_AUTH_PASSWORD`)
- All `/api/auth/*` and `/api/clientauth/*` routes
- Client-side plugins (`$auth`, `$authClient`) and composable wrappers

---

## Session Types

### `AuthSession` — `auth/server/utils/session.ts`

Full seller/staff session. Populated on login from `user.companies[0]`.

| Field | Type | Source |
|---|---|---|
| `id` | `string` | `user.id` |
| `email` | `string` | `user.email` |
| `name` | `string \| null` | `CompanyUser.name` |
| `image` | `string \| null` | `user.image` |
| `cleanup` | `boolean` | `user.cleanup` |
| `cleanupCode?` | `string` | `user.cleanupCode` |
| `companyId` | `string` | `CompanyUser.companyId` |
| `companyName` | `string` | `Company.name` |
| `companyType` | `string` | `Company.type` |
| `companyPhone?` | `string` | `Company.phone` |
| `storeUniqueName?` | `string` | `Company.storeUniqueName` |
| `role` | `string` | `CompanyUser.role` (`'admin'` or `'user'`) |
| `type` | `string` | Alias for `role` |
| `code` | `string` | `CompanyUser.code` |
| `plan` | `string` | `Company.plan` (`'free'`, `'lite'`, `'pro'`) |
| `pipelineId` | `string` | `Company.pipeline.id` |
| `logo?` | `string` | `Company.logo` |
| `isTaxIncluded` | `boolean` | `Company.isTaxIncluded` |
| `isCostIncluded` | `boolean` | `Company.isCostIncluded` |
| `isAiImage` | `boolean` | `Company.isAiImage` |
| `isUserTrackIncluded` | `boolean` | `Company.isUserTrackIncluded` |
| `isLite` | `Boolean` | — |
| `pointsValue?` | `number` | `Company.pointsValue` |
| `currency?` | `string` | `Company.currency` (default `'INR'`) |
| `address?` | `any` | `Company.address` |
| `openTime?` / `closeTime?` | `string` | `Company.openTime/closeTime` |
| `gstin` | `string` | `Company.gstin` |
| `accHolderName` | `string` | `Company.accHolderName` |
| `ifsc` | `string` | `Company.ifsc` |
| `accountNo` | `string` | `Company.accountNo` |
| `bankName` | `string` | `Company.bankName` |
| `upiId` | `string` | `Company.upiId` |
| `cash?` / `bank?` | `number` | Opening balances from settings |
| `printerLabelSize?` | `string` | `Company.printerLabelSize` |
| `deliveryType` | `string[]` | `Company.deliveryType` |
| `deliveryMode` | `string[]` | `Company.deliveryMode` |
| `fundDeliveryFees?` | `boolean` | `Company.fundDeliveryFees` |
| `deliveryRadius?` | `number` | `Company.deliveryRadius` |
| `deliveryFeesPerKm?` | `number` | — |
| `waitingTime?` | `number` | — |
| `waitingChargesPerMin?` | `number` | — |
| `minDeliveryCharges?` | `number` | — |
| `deliveryDiscountThreshold?` | `number` | — |
| `deliveryDiscountAmount?` | `number` | — |
| `commissionRate?` | `number` | `Company.commissionRate` |
| `category` | `string[]` | Visible category IDs |
| `purchaseExpenseCategoryId` | `string` | ID of the 'Purchase' ExpenseCategory |
| `description?` | `string` | `Company.description` |
| `thankYouNote?` | `string` | `Company.thankYouNote` |
| `refundPolicy?` | `string` | `Company.refundPolicy` |
| `returnPolicy?` | `string` | `Company.returnPolicy` |
| `productInputs?` | `{name,brand,category,description}` | `Company.productinput` |
| `variantInputs?` | `{name,code,sprice,pprice,dprice,discount,qty,unit,sizes,images,button}` | `Company.variantinput` |
| `authSessionVersion` | `string` | `process.env.AUTH_SESSION_VERSION` |

**Auth check:** `requireAuthSession` throws 401 if `session.data.email` is empty.

**Session config:**
- Cookie name: `NUXT_AUTH_PASSWORD` env var (warns and uses fallback secret if missing)
- `maxAge`: 31536000 (1 year)
- `secure`: true in production, `sameSite`: `'none'` in prod / `'lax'` in dev
- Storage: filesystem at `./.data/auth` (Nitro storage driver)

**Bug:** `console.log('Auth Config:', runtimeAuth)` fires at module load time — leaks auth config to logs.

### `AuthClientSession` — `auth/server/utils/clientSession.ts`

Thin session for store frontend customers.

| Field | Type |
|---|---|
| `id` | `string` — `client.id` |
| `name` | `string` |
| `email?` | `string` |
| `phone` | `string` |
| `type` | `string` — always `'CLIENT'` |

**Auth check:** `requireAuthClientSession` throws 401 if `session.data.phone` is empty.

Cookie `maxAge`: 60×60×24×365 (1 year). No `secure`/`sameSite` override (inherits defaults).

---

## Server Utility Functions

### `auth/server/utils/db.ts`

Prisma helpers for seller auth. Uses `~/server/prisma` (bare client).

| Function | Description |
|---|---|
| `findUserByEmail(email)` | Finds user with full nested include: `companies → company → pipeline, productinput, variantinput, address` |
| `findUserById(id)` | Finds user by id (no includes) |
| `createUser(user)` | Creates user via `Prisma.UserCreateInput` |
| `createCompany(company)` | Creates company with `variantinput: { create: {} }` and `productinput: { create: {} }` |
| `updatePassword(id, password)` | Updates hashed password |
| `updateUser(userId, companyId, name, role, code)` | Connects existing user to a company via `companies.create` |
| `createAddress(address)` | Creates `Address` row |
| `createPipeline(pipeline)` | Creates `Pipeline` row connected to company |
| `createDefaultExpenseCategories(companyId)` | Creates `ExpenseCategory` named `'Purchase'` for new company |
| `getPurchaseExpenseCategoryId(companyId)` | Finds first `ExpenseCategory` with `name: 'Purchase'` — throws if not found |

**Bug:** `createCompany` has `console.log(company)` left in.

### `auth/server/utils/clientdb.ts`

Prisma helpers for client auth. Uses `~/server/prisma`.

| Function | Description |
|---|---|
| `findClientByPhone(phone)` | `client.findUnique({ where: { phone } })` |
| `createClient(client)` | Creates client with company connect |
| `createClientAddress(address)` | Creates blank `Address` for new client |
| `updateClientPipeline(clientId, companyId)` | Connects client to company pipeline's `newClients` |

---

## API Routes — `/api/auth/`

All routes use `useAuthSession` / `requireAuthSession` from `auth/server/utils/session.ts`.

### Core Auth

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/login` | POST | No | Verifies `{ email, password }` (SHA-512 hash compare), populates full `AuthSession`, returns session |
| `/api/auth/register` | POST | No | Creates company + user (or adds user to new company if email exists), creates default expense category + pipeline. Returns `{ message }` |
| `/api/auth/logout` | POST | No | Clears session. Returns `{ message }` |
| `/api/auth/session` | GET | No | Returns raw `session.data` (no auth guard — unauthenticated callers get empty `{}`) |
| `/api/auth/session` | PUT | No | Bulk session update — accepts body of session fields, merges with existing session data (`{ ...session.data, ...updates }`, skipping `undefined` values), so unset fields are preserved rather than overwritten |
| `/api/auth/existinguser` | POST | No | Checks if email exists → returns `true`/`false` |
| `/api/auth/forgetPassword` | POST | Yes | Settings password change. Requires seller session, uses `session.data.id`, verifies `current_password`, then updates to new `password` (SHA-512). Accepts `{ current_password, password }` |
| `/api/auth/resetPassword` | POST | No | Forgot-password reset. Accepts `{ email, otp, password }`, validates `email_otps`, then updates `users.password` and deletes the OTP in one transaction. |
| `/api/auth/cleanup` | POST | — | Empty file (1 line, no content) |

**Note on login:** Always uses `user.companies[0]` — multi-company users are not supported at login. `isAiImage` defaults to `true` even if DB value is `false` (bug: `|| true` instead of `?? false`).

**Note on register:** `code` is hardcoded to `1` (integer, not a custom code).

**Bug:** `session.put.ts` has `console.log("session", session.data)` on every call.

### Session Partial-Update Routes (PUT)

Each route updates one or a few session fields, then returns the session. No auth guard on most — any caller with the session cookie can call.

| Route | Field(s) Updated |
|---|---|
| `/api/auth/changeAddress` | `address` |
| `/api/auth/changeCategory` | `category` |
| `/api/auth/changeDeliveryConfig` | `deliveryMode, fundDeliveryFees, deliveryRadius, deliveryFeesPerKm, waitingTime, waitingChargesPerMin, minDeliveryCharges, deliveryDiscountThreshold, deliveryDiscountAmount` |
| `/api/auth/changeDeliveryType` | `deliveryType` |
| `/api/auth/changeIncludeCost` | `isCostIncluded` |
| `/api/auth/changeIncludeTax` | `isTaxIncluded` |
| `/api/auth/changeIncludeUserTrack` | `isUserTrackIncluded` |
| `/api/auth/changeInputs` | `productInputs`, `variantInputs` |
| `/api/auth/changeisaiimage` | `isAiImage` |
| `/api/auth/changeLogo` | `logo` |
| `/api/auth/changeNotes` | `description, thankYouNote, refundPolicy, returnPolicy` |
| `/api/auth/changeOpeningBalance` | `cash, bank` |
| `/api/auth/changePointsValue` | `pointsValue` |
| `/api/auth/changePrinterLabelSize` | `printerLabelSize` |
| `/api/auth/changeprofiledetails` | `name`, `email`, `image` (falls back to existing if null) |
| `/api/auth/changeStorePhone` | `companyPhone` |
| `/api/auth/changeStoreUniqueName` | `storeUniqueName` |
| `/api/auth/changeTiming` | `openTime`, `closeTime` |

**Bugs in partial-update routes:**
- `changeCategory` — `console.log("category", category)` on every call
- `changeDeliveryConfig` — `console.log(deliveryMode)` on every call
- `changeTiming` — `console.log(openTime, closeTime)` on every call

---

## API Routes — `/api/clientauth/`

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/clientauth/login` | POST | No | Looks up client by `phone`, sets `AuthClientSession` with `id, name, email, phone, type:'CLIENT'` |
| `/api/clientauth/register` | POST | No | Creates client with hashed password, blank address, connects to company pipeline's `newClients`. Does **not** auto-login. |
| `/api/clientauth/logout` | POST | No | Clears client session |
| `/api/clientauth/session` | GET | No | Returns raw client `session.data` |

**Bug:** `clientauth/login` has `console.log("session", session.data)` on every call.

**Security note:** `clientauth/login` does **not** verify any password — logs in any client by phone number alone. No OTP or password check.

---

## Plugins

### `auth/plugins/0.auth.ts` — `$auth`

Runs on every app init (SSR + client). Provides `nuxtApp.$auth`.

- Fetches `/api/auth/session` with `credentials: 'include'`
- Exposes: `{ session, loggedIn: computed(() => !!session.email), updateSession }`
- `redirectTo` — `useState<string>('redirectTo')`, default `'/erp/billing'`

**Route middleware registered (client-only):**

1. `persist-last-route` — saves `to.fullPath` to `localStorage('lastRoute')` unless on `/login` or `/register`
2. `auth` — plan-aware route guard:
   - Logged-in user at `/login`/`/register` → redirect to `homeUrl`
   - `free`/`lite` plan hitting `/erp/billing` → redirect to `/offline`
   - `pro` plan hitting `/offline` → redirect to `/erp/billing`
   - Route with `meta.auth` and not logged in → redirect to `/login`, saves `redirectTo`

**Session restore on init:** If logged in and a `lastRoute` is saved in localStorage, navigates to it. Preserves query string from current route. The root page (`pages/index.vue`) handles the `/` → `/erp/billing` redirect for logged-in users.

`homeUrl`: `/offline` for `free`/`lite` plans, `/erp/billing` for `pro`.

### `auth/plugins/1.auth.ts` — `$authClient`

Runs on every app init. Provides `nuxtApp.$authClient`.

- Fetches `/api/clientauth/session`
- Exposes: `{ session, loggedIn: computed(() => !!session.phone), updateSession }`

---

## Composables

### `auth/composables/auth.ts`

Client-side wrappers for all seller auth API calls. All call `useAuth().updateSession()` after mutation to keep `$auth.session` reactive.

| Export | Calls | Description |
|---|---|---|
| `useAuth()` | — | `useNuxtApp().$auth` shortcut |
| `authLogin(email, password)` | `POST /api/auth/login` | Login + update session |
| `authRegister(email, name, companyname, password, plan, type)` | `POST /api/auth/register` → `authLogin` | Register then auto-login |
| `authForgetPassword(current_password, password)` | `POST /api/auth/forgetPassword` | Password change |
| `authLogout()` | `POST /api/auth/logout` | Logout + navigate to `/login` |
| `checkEmailExist(email)` | `POST /api/auth/existinguser` | Returns boolean |
| `updateCompanySession(params)` | `PUT /api/auth/session` | Full bulk session update — now takes a **single object** with 50+ optional typed fields (was positional args). Simply calls `$fetch('/api/auth/session', { method: 'PUT', body: params })`. New fields added: `cleanupCode`, `commissionRate`, `printerLabelSize`, `isAiImage`, `deliveryType`, `deliveryMode`, `fundDeliveryFees`, `deliveryRadius`, `deliveryFeesPerKm`, `waitingTime`, `waitingChargesPerMin`, `minDeliveryCharges`, `deliveryDiscountThreshold`, `deliveryDiscountAmount`, `isCostIncluded`, `openTime`, `closeTime`, `ifsc`, `accountNo`, `bankName`, `email`, `purchaseExpenseCategoryId` |
| `updateStoreUniqueName(storeUniqueName)` | `PUT /api/auth/changeStoreUniqueName` | — |
| `updateStorePhone(companyPhone)` | `PUT /api/auth/changeStorePhone` | — |
| `updateStoreNote(description, thankYouNote, refundPolicy, returnPolicy)` | `PUT /api/auth/changeNotes` | — |
| `updateIsTaxIncluded(isTaxIncluded)` | `PUT /api/auth/changeIncludeTax` | — |
| `updateIsCostIncluded(isCostIncluded)` | `PUT /api/auth/changeIncludeCost` | — |
| `updateIsUserTrackIncluded(isUserTrackIncluded)` | `PUT /api/auth/changeIncludeUserTrack` | — |
| `updateSession(productinputData, variantinputData)` | `PUT /api/auth/changeInputs` | — |

**Note:** `variantinput.unit` is normalized to a plural-only list on login/session updates. Old singular labels such as `No` and `Piece` are mapped forward to the plural display values used in settings and product forms.
| `updateProfileDetails(name, email, image)` | `PUT /api/auth/changeprofiledetails` | — |
| `updatePointsValue(pointsValue)` | `PUT /api/auth/changePointsValue` | — |
| `updateTimeValue(openTime, closeTime)` | `PUT /api/auth/changeTiming` | — |
| `updateCategoryValue(category)` | `PUT /api/auth/changeCategory` | — |
| `updateAddress(addstate)` | `PUT /api/auth/changeAddress` | — |
| `updateDeliveryConfig(deliveryConfig)` | `PUT /api/auth/changeDeliveryConfig` | — |
| `updateLogo(logo)` | `PUT /api/auth/changeLogo` | — |
| `updateDeliveryType(deliveryType)` | `PUT /api/auth/changeDeliveryType` | — |
| `updateIsAiImage(isAiImage)` | `PUT /api/auth/changeisaiimage` | — |
| `updatePrinterLabelSize(printerLabelSize)` | `PUT /api/auth/changePrinterLabelSize` | — |
| `updateOpeningBalance(openingBalance)` | `PUT /api/auth/changeOpeningBalance` | — |

**Note:** There are two versions of `auth.ts` — `auth/server/api/auth/auth.ts` (older, used by auth module internally) and `auth/composables/auth.ts` (newer, used by pages). They overlap but the composables version has more exports. `updateCompanySession` was refactored from positional params (28+ args) to a single typed object param.

**Bugs:** `updateSession` and `updateProfileDetails` have `console.log('Session updated')` left in. `updateCompanySession` has a `try/catch` that silently logs errors.

### `auth/composables/clientAuth.ts`

Client-side wrappers for customer auth.

| Export | Calls | Description |
|---|---|---|
| `useClientAuth()` | — | `useNuxtApp().$authClient` shortcut |
| `authClientLogin(phone)` | `POST /api/clientauth/login` | Calls `authClientLogout()` first, then logs in by phone |
| `authClientRegister(email, name, password, phone, companyId)` | `POST /api/clientauth/register` → `authClientLogin` | Register + auto-login |
| `authClientLogout()` | `POST /api/clientauth/logout` | Logout + update session |

---

## Auth Module nuxt.config.ts

`storetools/auth/nuxt.config.ts` — the layer config. Merged into main app via `extends: ['./auth']`.

- **`runtimeConfig.auth`:** `{ name: 'nuxt-session', password: NUXT_AUTH_PASSWORD }` — used by `useSession()` in all auth routes
- **`runtimeConfig.public.prismaUrl`:** `PRISMA_URL` env var (used by `useUserStore` to call `/api/getuser`)
- **`nitro.storage`:** `.data:auth` → filesystem driver at `./.data/auth` — session data is stored on disk

**Warning behavior:** If `NUXT_AUTH_PASSWORD` is not set, falls back to `'secretsecretsecretsecretsecretsecretsecret'` and logs a warning. This is a security risk in production.

---

## Storetools nuxt.config.ts

`storetools/nuxt.config.ts` — main Nuxt configuration.

### Layers

```ts
extends: ['@nuxt/ui-pro', './auth']
```

Inherits `@nuxt/ui-pro` (Nuxt UI Pro component library) and `./auth` (session auth layer above).

### Rendering

- `ssr: true` — server-side rendering enabled

### App Head

- PWA manifest: `/manifest.json`
- Apple touch icon: `/icons/icon-192.png`
- Theme color: `#3367D6`

### Build Transpile

- `trpc-nuxt` — tRPC adapter (likely unused in current app but configured)
- `@electric-sql/pglite` — ElectricSQL (paused feature, still needs transpile)

### Nitro

| Setting | Value | Notes |
|---|---|---|
| `preset` | `'vercel'` | Deploys to Vercel serverless |
| `routeRules['/nonetwork']` | `{ prerender: true }` | Offline fallback page prerendered |
| `esbuild.options.target` | `'es2022'` | Modern JS output |

### Vite

| Setting | Value | Notes |
|---|---|---|
| `optimizeDeps.exclude` | `['@electric-sql/pglite', '@point-of-sale/receipt-printer-encoder']` | Excluded from Vite pre-bundling |
| `ssr.noExternal` | `['@electric-sql/pglite']` | Bundle PGlite for SSR |
| `build.rollupOptions.output.manualChunks` | `() => 'app.js'` | Single bundle — all code in one `app.js` file |

**Note:** `manualChunks: () => 'app.js'` forces all modules into a single chunk. This maximizes caching simplicity at the cost of a large initial bundle.

### Modules

| Module | Purpose |
|---|---|
| `@nuxt/ui` | UI components (buttons, modals, tables, etc.) |
| `@nuxt/fonts` | Font loading optimization |
| `@vueuse/nuxt` | VueUse composables auto-import |
| `@nuxt/image` | Optimized image component |
| `@nuxtjs/sitemap` | Auto-generated sitemap |
| `nuxt-icon` | Icon component |
| `nuxt-headlessui` | HeadlessUI components |
| `@nuxtjs/tailwindcss` | Tailwind CSS integration |
| `@nuxtjs/robots` | robots.txt generation |
| `pinia-plugin-persistedstate/nuxt` | Pinia localStorage persistence |
| `@pinia/nuxt` | Pinia state management |

### Runtime Config

**Private (server-only):**
- `sessionSecret` — `SESSION_SECRET` env var
- `sourceId` — `SOURCE_ID` env var
- `secret` — `SECRET` env var

**Public (exposed to client):**
- `r2Id`, `r2Secret`, `r2Bucket`, `r2AccountId` — Cloudflare R2 credentials
- `baseUrl` — `BASE_URL`
- `serverUrl` — `SERVER_URL` (Express + Socket.io server URL, used by `$socket` plugin)
- `electricApiUrl` — `ELECTRIC_API_URL` (ElectricSQL — paused)

**Security bug:** R2 credentials (`r2Id`, `r2Secret`) are in `public` — they are accessible to browser clients. Should be server-only.

### Other Settings

- `site.url`: `https://markit.co.in`, `site.name`: `'Markit'` (used by `@nuxtjs/sitemap`)
- `imports.dirs: ['stores']` — auto-imports all Pinia stores
- `ui.safelistColors: ['primary', 'red', 'orange', 'green', 'tertiary']` — Tailwind safelist
- `compatibilityDate: '2025-02-28'`

---

## Bugs Summary

| File | Bug |
|---|---|
| `auth/server/utils/session.ts` | `console.log('Auth Config:', runtimeAuth)` fires at module load — logs session secret config |
| `auth/server/utils/db.ts` | `createCompany()` has `console.log(company)` left in |
| `auth/server/api/auth/login.post.ts` | `isAiImage: user.companies[0].company.isAiImage \|\| true` — always `true` even if DB is `false` |
| `auth/server/api/auth/register.post.ts` | `code` hardcoded to integer `1` instead of a configurable code |
| `auth/server/api/auth/session.put.ts` | `console.log("session", session.data)` on every call |
| `auth/server/api/auth/session.put.ts` | ~~`undefined` fields in PUT body overwrote existing session fields (e.g. cleared `cleanup`/`cleanupCode` on company switch → redirect to login)~~ **FIXED** — body is now filtered with `Object.entries(body).filter(([_, v]) => v !== undefined)` and merged with `{ ...session.data, ...updates }` |
| `auth/server/api/auth/changeCategory.put.ts` | `console.log("category", category)` on every call |
| `auth/server/api/auth/changeDeliveryConfig.put.ts` | `console.log(deliveryMode)` on every call |
| `auth/server/api/auth/changeTiming.put.ts` | `console.log(openTime, closeTime)` on every call |
| `auth/server/api/clientauth/login.post.ts` | No password check — any caller with a known phone number gets a session; `console.log("session", session.data)` |
| `auth/composables/auth.ts` | `updateSession()` and `updateProfileDetails()` have `console.log('Session updated')` |
| `auth/composables/auth.ts` | `updateCompanySession()` silently swallows errors (only `console.log(err)`) |
| `nuxt.config.ts` | `r2Id`, `r2Secret` in `runtimeConfig.public` — exposed to browser |
