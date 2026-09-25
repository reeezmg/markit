## Auth Pages

### `pages/login.vue`
- `definePageMeta({ layout: false })` — uses no layout (standalone page)
- Form fields: `email`, `password` (Zod validation: email format, password min 6 chars)
- Uses `UAuthForm` from Nuxt UI for the login form
- On submit: calls `authLogin(email, password)` from `auth/composables/auth.ts`
  - POST `/api/auth/login` → sets session cookie
  - calls `useAuth().updateSession()` to hydrate reactive session
  - redirects to `useAuth().redirectTo.value || '/dashboard'`
- After login: registers push notifications
  - Web: `usePushNotifications(userId)` from `composables/usePushNotifications`
  - Native (Capacitor): `registerPush(userId)` from `composables/useCapPush`
- `reject` ref: set to `false` on error to show `UAlert` error banner
- Password hint links to `/forgot-password`
- **Bugs:** Two `console.log` statements left in (line 15: `route.query.code`; line 19: `watchEffect` logging session ID)
- `route.query.code` is read but never used anywhere in the component

---

### `pages/forgot-password.vue`
- `definePageMeta({ layout: false })` — standalone unauthenticated page
- Step 1: email input validates format and checks `/api/auth/existinguser`; if found, sends OTP via `POST /api/send-otp`
- Step 2: OTP, new password, confirm password fields are shown after OTP send
- On submit: `POST /api/auth/resetPassword` with `{ email, otp, password }`
  - Server validates OTP against `email_otps`
  - On success, updates `users.password` and deletes the OTP in one transaction
  - Redirects to `/login` after success

---

### `pages/register.vue`
- `definePageMeta({ layout: false })` — standalone page
- Registration is a **2-step flow**: email verification → fill remaining fields
  - Step 1: Enter email → click "Verify Email" → OTP sent via `POST /api/send-otp`
  - Step 2: Enter OTP → click "Verify OTP" → `POST /api/verify-otp` → `isEmailVerified = true`
  - Step 3: Remaining fields shown only after `isEmailVerified`: name, password, confirmPassword, companyname, plan
- Plan pre-filled from `route.query.plan` (e.g. `/register?plan=pro`); defaults to `free` when the query is missing or invalid
- `checkEmail(email)` called concurrently with OTP send → `POST /api/auth/existinguser`
  - If email already exists: toast "You're about to link a new company to an existing email" → `emailExist = true` → skip confirmPassword field; password is treated as the existing account password
- On submit: `authRegister(email, name, companyname, password, plan, 'buyer')`
  - POST `/api/auth/register` → creates company + user (or links to existing user)
  - Immediately calls `authLogin` after successful register → auto-login

---

### `POST /api/auth/register`
**File:** `auth/server/api/auth/register.post.ts`
- Body: `{ email, name, companyname, password, type, plan }`
- Flow:
  1. Normalize/validate body: email lowercase, required name/company/password, valid company type, valid plan (default `free`)
  2. `findUserByEmail(email)` — check if user exists
  3. If user exists, compare `hash(password)` to the existing password before creating a company; mismatch returns 401
  4. `createCompany({ name: companyname, type, plan, variantinput: { create: {} }, productinput: { create: {} } })`
  5. If user exists: `updateUser(userId, companyId, name, 'admin', 1)` — link new company to existing user
  6. If new user: `createUser({ email, password: hash(password), companies: { create: [...] } })` with role `admin`, code `1`
  7. `createDefaultExpenseCategories(companyId)` — seeds default expense categories for new company
  8. `createPipeline({ company: { connect: { id: companyId } } })` — creates default CRM pipeline
- Returns: `{ message: 'Successfully registered!' }`
- Tables touched: `companies`, `users`, `company_users`, `product_inputs`, `variant_inputs`, `expense_categories`, `pipelines`

---

### `POST /api/send-otp`
**File:** `server/api/send-otp.ts`
- Body: `{ email }`
- Generates 6-digit OTP via `generateOtp()` from `server/utils/otp`
- Upserts to `email_otps` table (`email` is unique key): `{ email, otp, expiresAt: now + 10 min }`
- Sends email via `sendEmailWithOtp(email, otp)` from `server/utils/mailer`
- Returns: `{ message: 'OTP sent successfully' }`

---

### `POST /api/verify-otp`
**File:** `server/api/verify-otp.ts`
- Body: `{ email, otp }`
- Looks up `EmailOtp` record by email
- Checks expiry: if `record.expiresAt < now` → deletes record → throws 410
- Checks OTP match: throws 401 on mismatch
- On success: deletes the `email_otp` record (single-use)
- Returns: `{ message: 'OTP verified successfully' }`

---

### `POST /api/auth/resetPassword`
**File:** `auth/server/api/auth/resetPassword.post.ts`
- Body: `{ email, otp, password }`
- Flow:
  1. Normalize email; require email, OTP, and password
  2. Reject passwords shorter than 6 characters
  3. `findUserByEmail(email)` — returns 404 if the seller account does not exist
  4. `prisma.emailOtp.findUnique({ where: { email } })` — validates OTP presence, expiry, and exact OTP match
  5. `prisma.$transaction([user.update(password: hash(password)), emailOtp.delete(email)])` — atomically changes the password and consumes the OTP
- Returns: `{ message: 'Password reset successfully' }`

---

## Settings & Offline Pages

> **Settings moved to dedicated file:** See `ARCH-pages-settings.md` for full settings documentation (general, store, printer, members, auth composable).

---

## Offline Page

### `pages/offline/index.vue`
A **simplified billing page** for free/lite plan users — no customer tracking, no payment types, no points, no tax. Only captures item + qty + category for stock deduction.

**Purpose:** Allow stock to be marked as sold without creating a full bill record (no `bills` table entry).

**Item row shape (simplified vs billing.vue):**
```
{ id, variantId, name, sn, barcode, category[], size, item, qty, rate, sizes, totalQty, return }
```
Missing vs billing.vue: no `discount`, `tax`, `value`, `user`, `userCode`, `userId`, `cost`, `paymentType`

**Draft bill system:** Identical to `billing.vue` — `localStorage['bills']`, multiple concurrent drafts, billNo re-sequencing on create/delete.

**Barcode lookup:** `GET /api/bill/by-barcode?barcode=` — same endpoint as billing.vue. Sets item name, category, rate, sizes, variantId.

**Save flow:**
1. Validates: items not empty, each item has a category
2. POSTs to `POST /api/bill/offline` (non-blocking `.then()/.catch()`)
3. On success: `queryClient.invalidateQueries(['zenstack', 'Product', 'findMany'])` + `reset()`
4. On error: `reconstructBill(error.data.data)` — repopulates items from error response

**No payment captured** — purely a stock deduction tool.

**Stock Return:** `BillingStockReturn` component (same as billing.vue). Returned items appended to `items` with `return: true`.

**Keyboard navigation:** Full arrow-key grid navigation (up/down/left/right) across barcode/category/name/rate/qty columns. Same `moveFocus()` / `focusInput()` pattern as billing.vue.

**Category navigation:** `movecatgeory(rowIndex)` — opens USelectMenu dropdown on ArrowLeft/ArrowRight/Enter, wires ArrowRight → name input, ArrowLeft → barcode input.

**Barcode scanning:**
- Web: Quagga2 (`code_128_reader`, `ean_reader`, `ean_8_reader`) — same format validation `/^\d+[A-Z]\d{6}$/`
- Native: `CapacitorBarcodeScanner` with `CODE_128` hint

**Resizable columns:** `mousedown`/`mousemove`/`mouseup` drag handlers on `<th>` dividers (desktop only).

**Mobile vs desktop:** `isMobile = window.innerWidth < 1024`. Mobile shows card-per-row layout; desktop shows traditional table.

**ZenStack hooks:** `useFindFirstItem`, `useFindManyCategory`

---
