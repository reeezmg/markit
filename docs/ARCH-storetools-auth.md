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

`selectedAccounts` stores the current company's saved account-default IDs with a
companyId guard. Login/company switch load these from account-default audit rows;
session GET hydrates older sessions. POST `/api/auth/selected-accounts` reloads
authorized-company settings from the database and updates the cookie only for the
login company. Client `useSelectedAccounts` then calls `$auth.updateSession()`,
following the company-phone update pattern. Other-store forms fetch their own
defaults without replacing the login company's defaults. Generic session PUT may
not overwrite selectedAccounts. Account Settings saves refresh this snapshot;
account selectors and useAccountantApi default reads consume it. Account options
and existing source snapshots remain separate; backend posting still validates
account ownership/type rather than trusting cookie defaults.

Cookie transport compresses the snapshot into `selectedAccountsPacked` to avoid
adding the full mapping JSON to the existing encrypted login cookie. Session GET
decodes it back to `selectedAccounts` for consumers and omits the packed field from
the response. Missing, invalid or old-version snapshots reload from saved settings.
Neither representation can be set by generic session PUT.

Seller session cookie transport is handled by
`auth/server/utils/chunked-session.ts`, called by `useAuthSession`. H3 still seals
and verifies the entire session. A sealed value over 3,000 characters is split
across `nuxt-session.0`, `.1`, etc., with a `chunks:N` marker in the base cookie;
each cookie keeps the configured Secure, HttpOnly, SameSite and expiry options.
Existing single-cookie sessions remain readable. Updates remove obsolete chunks;
logout deletes the base cookie and its chunks. Incomplete or invalid encrypted
chunks do not authenticate. This avoids browsers discarding a full login cookie
over their individual-cookie size limit, which otherwise yields an empty session.
The account snapshot compression alone does not bound the full session size.
No server-local storage or database schema is introduced. The regression test is
`tests/auth-session-cookie-size.test.ts`.

The version-2 snapshot also includes saved ERP, staff and ecommerce mappings in
`defaults.erp`, `defaults.staff` and `defaults.ecommerce`. Account Settings and the
ERP/staff connection dialogs refresh it after successful mapping saves. Investment
profile/movement, Receive/Pay, transfer and asset forms explicitly consume
`useSelectedAccounts`; ecommerce money-account defaults use its ERP/ecommerce
mappings. No component requests `/account-settings/defaults` over HTTP. Available
account lists and source-specific overrides still use their respective endpoints.
The Account Settings page and ERP/staff connection forms also populate saved
selections from this snapshot; backend suggestions apply only when that group has
never been saved. Their API reads retain available-account and activation data.

Full seller/staff session. Login selects an active direct company membership first; a delegated branch membership is used only if its head-office admin access remains valid.

| Field | Type | Source |
|---|---|---|
| `id` | `string` | `user.id` |
| `email` | `string` | `user.email` |
| `name` | `string \| null` | `CompanyUser.name` |
| `image` | `string \| null` | `user.image` |
| `cleanup` | `boolean` | `user.cleanup` |
| `cleanupCode?` | `string` | `user.cleanupCode` |
| `companyId` | `string` | `CompanyUser.companyId` |
| `allStores?` | `boolean` | Head-office combined data scope; enabled automatically for head-office admins |
| `organizationHeadOfficeId?` | `string` | Deprecated legacy field; cleared by session refresh/login/switch |
| `readCompanyId?` | `string` | Deprecated legacy field; table filters are now component-local and sent per request |
| `delegatedHeadOfficeId?` | `string` | Head office authorizing access to the selected branch |
| `companyName` | `string` | `Company.name` |
| `companyType` | `string` | `Company.type` |
| `companyPhone?` | `string` | `Company.phone` |
| `storeUniqueName?` | `string` | `Company.storeUniqueName` |
| `role` | `string` | `CompanyUser.role` (`admin`, `manager`, `biller`, `accountant`, `investor`, or `user`) |
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

Company switching in `TeamsDropdown` calls `POST /api/auth/switch-company`. The server verifies an active direct membership or valid delegated head-office access, loads the destination company and settings, and rebuilds company-specific session fields. Destination packed account defaults replace the previous company's defaults after spreading existing session data; category and plan flags are also replaced. The dropdown verifies the saved company and reloads a safe destination using `utils/companySwitchLocation.ts`. The general session PUT route rejects changes to `companyId`.

Head-office membership provisioning creates missing delegated memberships and reactivates inactive delegated memberships. When access is already current, `ensureHeadOfficeBranchMemberships` performs no database writes; direct memberships are preserved.

`server/middleware/organization-access.ts` revalidates delegated branch authority and All Stores access. If a stale All Stores cookie outlives a company's head-office designation, an active, nondeleted direct admin membership in an active company allows the request after clearing `allStores` and legacy scope fields. Revoked, downgraded, inactive or delegated memberships cannot use this fallback. Branch requests still require current authorization in `companyRequestScope.ts`; the fallback grants no branch access. This also handles SSR subrequests carrying a cookie from before session refresh. Regression coverage: `tests/organization-access.test.ts` (in-memory; no database writes).

**Session config:**
- Cookie name: `nuxt-session`; encryption password comes from `NUXT_AUTH_PASSWORD` (the layer warns and supplies a fallback when it is missing)
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
| `registerCompanyWithOwner(params)` | Creates company, creates or links the owner user, creates the Purchase expense category and pipeline, then provisions company-owned standard accounting accounts and defaults in one transaction; any failure rolls back registration |
| `updatePassword(id, password)` | Updates hashed password |
| `createAddress(address)` | Creates `Address` row |
| `getPurchaseExpenseCategoryId(companyId)` | Finds first `ExpenseCategory` with `name: 'Purchase'` — throws if not found |

Registration calls `initializeNewCompanyAccounts` from
`server/utils/accountant/company-account-defaults.ts`. This configures selections
without posting journals or enabling integrations. Company chart accounts and
default settings commit together with the company and owner membership.

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

**Note on login:** Selects the first active direct company membership, falling back to an active delegated membership only after checking that its head-office authority remains valid. `isAiImage` uses `?? true`, preserving an explicit `false`.

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

**Route middleware:** Auth and plan guards run during SSR and client navigation; route persistence uses browser storage only.

1. `persist-last-route` (client only) — saves `to.fullPath` to `localStorage('lastRoute')` unless on `/login` or `/register`
2. `auth` (server and client) — plan-aware route guard:
   - Logged-in user at `/login`/`/register` → redirect to `homeUrl`
   - `free`/`lite` plan hitting `/erp/billing` → redirect to `/offline`
   - `pro` plan hitting `/offline` → redirect to `/erp/billing`
   - Route with `meta.auth` and not logged in → redirect to `/login`, saves `redirectTo`

**Session restore on init:** A saved last route is restored from browser storage only when entering `/`. Explicit seller deep links keep their requested path. Logged-in login/register navigation uses the plan fallback; the root page handles its normal authenticated entry redirect.

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

The isolated local audit build disables server sourcemaps and `/nonetwork` prerendering to reduce memory use. It disables Nitro dependency tracing because its output runs alongside the existing installed dependencies, and resolves Prisma's generated `.prisma/client` import to its installed directory. This output is a local test artifact, not a standalone deployment package; the regular deployment configuration keeps its existing settings.

The `preserveServerPrefetchIds` inline module removes `onServerPrefetch` from Nuxt's client composable removal list before build plugins initialize. Vue 3.5 uses registration of that hook to allocate async `useId` boundaries. Removing icon registrations only on the client shifts subsequent menu/control IDs; preserving registration does not execute server-prefetch callbacks in the browser. The Chrome regression has a negative control reproducing shifted IDs and checks the configured build's label/input IDs against SSR.

The module only filters an existing `client.vue` list. Development defaults to an
empty map; adding `vue: []` activates the installed Nuxt composable transform with
an empty regex alternative. Dependency modules containing a line starting with `(`
then trigger `Cannot overwrite a zero-length range` during Vite pre-transform.
`tests/composable-tree-shake-config.test.ts` checks that development retains the
empty map while production preserves prefetch registration and other removal lists.

Application type preparation excludes standalone `tests/` and `cypress/` projects, whose ambient mocks must not replace Nuxt's real app/session/router types. Dedicated test configurations, such as `tests/tsconfig.print-templates.json`, continue to include their own mocks. `npm run typecheck:large` prepares Nuxt types and runs the complete application check with an 8192 MB Node heap; `TYPECHECK_MEMORY_MB` overrides that limit. Its incremental cache is in `node_modules/.cache`, since Nuxt preparation clears its build folder. The isolated browser server also defaults to an 8192 MB heap (`BRANCH_E2E_MEMORY_MB` overrides it).

The isolated browser audit registers H3 middleware that blocks mutations except company switching and blocks storefront source/agent/design workflows. Before opening Chrome, the runner requires a real HTTP probe to return 409 with the audit-blocked header; a Nitro request hook alone did not stop handlers. The manually registered middleware path uses forward slashes for Windows Nitro imports. Audit browser profiles live under `node_modules/.cache/branch-e2e-profiles` with containment-checked cleanup. Startup allows 30 minutes by default on constrained machines. The external run directory's `control.json` can request a graceful stop using the exact active `driverProcessId` as `stopDriver` and the matching `startedAt`; cleanup stops only resources owned by that run. This audit cannot establish create/edit/delete form success because those writes are blocked.

`npm run build:branches:e2e` prepares a local bundled audit server with an 8192 MB build heap and read-only database options. Only the isolated build uses Nitro's `node-server` preset, `.output-branch-e2e` and Vite's default route splitting; normal deployment keeps its existing preset and chunk policy. `npm run test:branches:bundled` runs the same guarded browser audit against that bundle, avoiding development-time module transformations on every page. `npm run test:branches:forms:bundled` selects the existing opt-in coupon fixture scenario. Production hydration mismatch details remain enabled in the audit bundle so a bundled test cannot conceal those failures. Rebuild after changing application source.

The audit build hashes its application/configuration inputs before and after compilation and writes `bundled-manifest.json`. A changed source produces a stale manifest, not a verified build. The bundled runner checks that fingerprint before startup and again after its final company switch. Reports, architecture prose and browser-driver edits do not change the application fingerprint; the registered server guard/plugin do. The build can explicitly collect garbage between completed Vite stages to limit retained memory on the local test machine.

Read-only audit mode permits the verified POST reader `/api/billSale/findManyBills` (its body supplies filters and its SQL queries only SELECT). Coupon fixture mode keeps that POST exception disabled. Each audited page gets a fresh document and query client. Readiness requires Vue mounting, the expected destination, settled API/module requests, settled active queries and settled Nuxt async data; failed query or SSR payload data also fail the page. API failures belong to request IDs and document loader IDs for that visit. These boundaries prevent late supplier responses or cancelled cached queries affecting another page. Per-page hydration warnings are snapshotted rather than sharing mutable arrays. Literal redirects and query-preserving object redirects are recognized as aliases. The seller walkthrough excludes the legacy buyer marketplace/checkout routes, as requested, and selects undeleted records for dynamic pages where the model supports soft deletion.

For an explicitly authorized test database, `BRANCH_E2E_FORM_TESTS=1` enables the runner's coupon browser create/edit/delete scenario in both companies. The parent inspection clients remain read-only; the actual server verifies write capability, and middleware permits only scalar coupon mutations whose code starts with that run's unique `BRANCH_E2E_` prefix. Existing ordinary coupons, bulk writes and nested record creation stay blocked. The runner records fixture snapshots in `tests/branch-reports/form-fixture-backup.json`, checks saved values in the database and after a browser reload, and deletes only remaining run-owned fixtures in its final cleanup. This mode does not apply any schema changes and must not be used against production.

`npm run test:branches:catalog:bundled` adds brand/collection browser form scenarios to coupon fixture mode. The additional `--catalog` opt-in enables only run-prefixed brand/collection scalar mutations; ordinary records, nested writes and bulk actions remain blocked. Catalog snapshots and cleanup results are separate in `catalog-fixture-backup.json`. `tests/fixture-guard.test.ts` checks these restrictions without database mutations. These scenarios being available does not establish a passing browser result; consult the run report.

Native select interaction in these scenarios emits both `input` and `change`: Nuxt UI 2 updates its model on `input`. Page-form selection must also update `entryCompany` before the scenario proceeds. Product, ERP and distributor parent pages already key nested pages by path and entry company; the Chrome component regression uses the product page's actual key expression. Change-only simulated selection is not evidence that the form or table filter changed scope.

`npm run test:branches:create` calls the real branch-creation handler against the explicitly selected test environment, inside an outer transaction that always rolls back. It checks blank-name and nested-branch rejection, saved parent ownership, admin membership, Purchase category, pipeline/input defaults and branch-owned accounting selections. The report snapshots only the new fixture and verifies its company, membership, expense category and accounts are absent after rollback. It does not test browser clicks or password login.

The read-only browser runner can set `MARKIT_E2E_BUILD_DIR` to isolate its generated files from the normal `.nuxt` dev server. That mode disables eager page warmup and loads `tests/helpers/readonly-nitro-plugin.ts`, which refuses startup unless the actual PostgreSQL and Prisma clients both report read-only transactions. Generated test reports, log files and both generated build folders are excluded from dev watching so the two dev servers cannot trigger each other's rebuilds. Live E2E logs/results are written outside the project under `artifacts/storetools-branch-e2e-run`, with a final result copied to `tests/branch-reports/e2e-results.json` after server cleanup. Cold page navigation and settling allow 180 seconds by default (`BRANCH_E2E_PAGE_MS` overrides this); navigation timeouts are failed pages, not successes or silent skips. The runner bootstraps an encrypted session for an existing authorized member; it does not test password login or live business mutations.

### App Head

- PWA manifest: `/manifest.json`
- Apple touch icon: `/icons/icon-192.png`
- Theme color: `#3367D6`

### Build Transpile

`vercel.json` sets the production build command to `npx zenstack generate && nuxt build`.
Production builds generate clients/hooks and compile the application without running
`prisma db push`. Database changes use the separate reviewed SQL migration workflow
in `scripts/production-accounting`; generating or building does not apply those migrations.

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

R2 credentials (`r2Id`, `r2Secret`, `r2Bucket`, `r2AccountId`) are in private `runtimeConfig`; the current configuration does not expose them through `runtimeConfig.public`.

### Other Settings

- `site.url`: `https://markit.co.in`, `site.name`: `'Markit'` (used by `@nuxtjs/sitemap`)
- `imports.dirs: ['stores']` — auto-imports all Pinia stores
- `ui.safelistColors: ['primary', 'red', 'orange', 'green', 'tertiary']` — Tailwind safelist
- `compatibilityDate: '2025-02-28'`

---

## Bugs Summary

| File | Bug |
|---|---|
| `auth/server/api/auth/register.post.ts` | `code` hardcoded to integer `1` instead of a configurable code |
| `auth/server/api/auth/session.put.ts` | `console.log("session", session.data)` on every call |
| `auth/server/api/auth/session.put.ts` | ~~`undefined` fields in PUT body overwrote existing session fields (e.g. cleared `cleanup`/`cleanupCode` on company switch → redirect to login)~~ **FIXED** — body is now filtered with `Object.entries(body).filter(([_, v]) => v !== undefined)` and merged with `{ ...session.data, ...updates }` |
| `auth/server/api/auth/changeCategory.put.ts` | `console.log("category", category)` on every call |
| `auth/server/api/auth/changeDeliveryConfig.put.ts` | `console.log(deliveryMode)` on every call |
| `auth/server/api/auth/changeTiming.put.ts` | `console.log(openTime, closeTime)` on every call |
| `auth/server/api/clientauth/login.post.ts` | No password check — any caller with a known phone number gets a session; `console.log("session", session.data)` |
| `auth/composables/auth.ts` | `updateSession()` and `updateProfileDetails()` have `console.log('Session updated')` |
| `auth/composables/auth.ts` | `updateCompanySession()` silently swallows errors (only `console.log(err)`) |
| `nuxt.config.ts` | R2 credentials remain in private runtime configuration |
