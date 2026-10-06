## Settings Pages

### Settings Tab Navigation
- Current `pages/settings.vue` tabs: General, Store, Company & Branches, Products, Account, Printer, Numbering, Requests.
- `/settings/branches` lets a company admin mark a root company as a head office and create branches. Branches have separate settings, stock, bills, and accounts. The page reads `/api/branches` and calls `/api/branches/head-office` and `/api/branches` for writes.
- `server/api/branches/index.post.ts` provisions the branch's standard accounting accounts and default selections through `initializeNewCompanyAccounts` in the branch creation transaction. Each branch receives its own account IDs; parent account selections are not copied. A provisioning failure rolls back branch creation.
- `TeamsDropdown.vue` lists actual companies and branches and is the explicit session company switch. ERP, Products, and Distributor use local table filters and form company fields; these controls do not change the sidebar company. There is no synthetic All Stores company or shared header selector.
- When the selected company has `parentCompanyId`, the settings shell hides Company & Branches and a direct visit to `/settings/branches` redirects to `/settings/store`.
- Inline horizontal tabs via `<SettingsTabNav />` component on the main settings pages: General (`/settings`), Printer (`/settings/printer`), Numbering (`/settings/numbering`), Requests (`/settings/requests`). The Store page (`/settings/store`) uses the parent navigation instead of rendering the tab row again.
- The parent settings page supplies the settings navigation; older child `SettingsTabNav` descriptions may reflect the previous layout.

---

### `pages/settings/account.vue` (Account Settings)

Native bank disconnection (2026-10-06): staff/supplier configuration no longer
queries archived BankAccount records. Historical `bank:<id>` roles are retained
from source documents and saved mappings for existing postings. Staff settings
returns no legacy bank selector options; future payout choices use active native
BANK accounts or the configured default. Existing source account snapshots remain
authoritative on edits.

Company-scoped admin/manager/accountant configuration is grouped into Billing & sales,
Expenses, Salary & staff credit, Purchase & supplier payments, Investments,
Receive / Pay money, Transfers, Fixed assets, and Online sales & settlements.
ERP and staff sections use their existing configuration/activation APIs. Billing
and expenses currently share the ERP cash/bank choices. Supplier-specific setup,
history import and overrides are embedded here through `Distributor/Accounting.vue`.
The previous Accounting buttons on billing, sales, expense, customer, staff and
supplier pages have been removed. Ecommerce setup and investor profit-distribution
account selection are also here; investment share-count settings remain separate.
Investments exposes shared Equity, Profit payable and Investor loan defaults plus
an investor selector opening `Investments/ProfileModal.vue` for account overrides.
New investor creation resolves defaults server-side; explicit investor choices
take precedence. Existing mappings remain until explicitly edited, and an account
with an outstanding balance for that investor/purpose cannot be changed without
settlement or reclassification. Shared accounts retain investor attribution on
each journal line; investor event balances and payment limits remain separate.
One **Save investment settings** button saves the investment defaults and profit
distribution account together through PUT `/account-settings/investments` in the
existing request transaction. Its optional `profitDistributionAccountId` requires
admin/manager and validates an active company equity account distinct from investor
purpose accounts before either setting is written. Accountants save defaults only;
the distribution selector remains read-only for them.
Receive / Pay money is one card containing Receive into and Pay from with one save
button. Purpose-account defaults are no longer offered. PUT `/account-settings/receive-pay`
validates both Cash/Bank selections before appending the existing `receive` and
`pay` audit groups in one request transaction; empty selections clear defaults.

`/api/accountant/account-settings` lists active company accounts, suppliers and saved
form defaults; `/defaults` reads just defaults. PUT `/:group` validates account type,
company, activity, role and distinct transfer endpoints. Defaults are append-only
`AccountantAudit` entries (`account-defaults` / `configured`, resourceId = group).
No new schema is required. Empty saved groups clear older defaults. Purchase forms
and payment writes use company defaults only without an existing source-account
snapshot; explicit transaction choices take precedence. Investor profiles/movements,
Receive/Pay, transfer creation, asset categories and disposals prefill from these
settings. Existing posted source mappings remain unchanged. Ecommerce PUT `/settings`
updates future-order defaults without enabling posting or changing existing orders.

Verified selection precedence (2026-10-06): new supplier transaction forms merge
supplier mappings, then company purchase defaults, then the user's transaction
choices. Company defaults therefore override a supplier mapping for the same role;
recorded source accounts take precedence when editing. Billing and expense sections
share Cash/Bank mappings. Saving either section merges only its fields into current
saved ERP settings so the other section's dedicated fields are preserved.

Verified fixes (2026-10-06): ERP mapping save updates stock-control's default
Stock account in the same transaction and synchronizes valuation when enabled.
PO-specific stock snapshots retain their recorded selections; default/unlinked
stock follows the Billing Stock selection. Supplier opening sources consume the
company purchase opening default on their first posting. The additive migration
`20261006120000_supplier_opening_account_default` installs a selection trigger for
generated supplier opening edits; import also snapshots defaults explicitly.
Existing source selections remain frozen. This migration is prepared/tested,
not applied to production by the sidebar-fix task. Supplier preview supplies the
company opening default when no opening has been recorded. Profit distribution
settings remain admin/manager-only: accountants see a disabled selector and no
Save button; the handler and endpoint enforce the same permission.
Shared SQL selection helpers use `prismaSqlClient` inside the Accountant transaction;
advisory locks and mutations without RETURNING execute without decoding row data.

Checks: `npx tsx tests/account-settings.test.ts` covers company/role/type validation,
clearing defaults, purchase overrides and preserving existing account snapshots.
`tests/account-settings-posting.integration.test.ts` additionally checks every ERP
and staff mapping role, named staff banks, old/new source account preservation and
all 22 form-default selectors in a disposable schema. The stock and supplier
account-settings integration suites verify selected accounts and frozen snapshots.

---

### `pages/settings/index.vue` (General Settings)
- **Theme:** `UColorModeButton` for dark/light toggle
- **Email change flow:** OTP-verified (same send-otp/verify-otp pattern as register)
  - Enter new email -> "Verify Email" -> OTP -> verify -> `useUpdateUser({ email })` + `updateProfileDetails(null, email, null)`
- **Avatar:** File picker -> S3 upload via `AwsService.uploadBase64File()` -> `useUpdateUser({ image: uuid })` + `updateProfileDetails(name, null, uuid)`
- **Name:** `useUpdateCompanyUser({ name })` - updates `CompanyUser.name` (per-company display name, not User.name)
- **Password change:** `authForgetPassword(current, new)` -> POST `/api/auth/forgetPassword`
  - Validates locally: all fields required, passwords match, min 6 chars
  - Server requires seller session, uses `session.data.id`, verifies current password, rejects short/missing values, then updates hashed password
  - **Bug:** Toast on successful tax change incorrectly references `error.statusMessage` (line 570 and similar across other handlers) - `error` is out of scope in the success branch
- **Sales History link:** Button navigating to `/saleshistory`
- **Delete Account:** Opens `SettingsDeleteAccountModal`
- ZenStack hooks used: `useFindUniqueUser`, `useUpdateUser`, `useFindUniqueCompanyUser`, `useUpdateCompanyUser`

---

### `pages/settings/store.vue` (Store Settings)
Largest settings page - manages all company-level configuration. Every field has a corresponding `isXxxChanged` ref (dirty tracking) to only enable Save buttons when a field is actually changed.

**Layout:** Settings are organized into 10 visually separated groups, each with an `<h2>` heading, a short description, and a thick `border-b-2` divider between groups (no inner `UDivider` lines within a group). The Store page does **not** render `<SettingsTabNav />`; it uses the parent settings navigation. Several groups are now rendered as stacked card blocks so labels sit above controls rather than beside them. Two groups have combined save buttons:
- **Store Identity** - single "Save Store Identity" button covers store name, phone, logo, categories, description/notes, and address in one `useUpdateCompany.mutate()` call + one toast
- **Delivery Settings** - single "Save Delivery Settings" button covers delivery type, delivery mode, radius, and self-delivery discount in one mutation + one toast

All other sections save individually per field (toggle, input blur, etc.).

**Sections and what they update:**

| Group | Section | Hook / Auth fn | Fields |
|---|---|---|---|
| Store Identity | Store unique name (URL slug) | `useUpdateCompany` + `updateStoreUniqueName` | `storeUniqueName` |
| Store Identity | Store phone | `useUpdateCompany` + `updateStorePhone` | `phone` |
| Store Identity | Description / notes | `useUpdateCompany` + `updateStoreNote` | `description`, `thankYouNote`, `refundPolicy`, `returnPolicy` |
| Store Identity | Logo | `AwsService.uploadBase64File` + `updateLogo` | `logo` (S3 uuid) |
| Store Identity | Address | `useUpsertAddress` + `updateAddress` | street, landmark, city, state, pincode, lat, lng, placeId, formattedAddress, name |
| Store Identity | Category list | `useUpdateCompany` + `updateCategoryValue` | `category` (string array) |
| Business Hours | Open/close timing | `useUpdateCompany` + `updateTimeValue` | `openTime`, `closeTime` |
| Billing Settings | Tax included toggle | `useUpdateCompany` + `updateIsTaxIncluded` | `isTaxIncluded` |
| Billing Settings | Cost included toggle | `useUpdateCompany` + `updateIsCostIncluded` | `isCostIncluded` |
| Billing Settings | Points value | `useUpdateCompany` + `updatePointsValue` | `pointsValue` |
| Delivery Settings | Delivery type | `useUpdateCompany` + `updateDeliveryType` | `deliveryType` array - options: `['trynbuy', 'booking', 'delivery']` |
| Delivery Settings | Delivery config | `useUpdateCompany` + `updateDeliveryConfig` | `deliveryMode`, `deliveryRadius`, `deliveryDiscount` (0-100%), `codCharge` (non-negative flat COD surcharge) |
| Bank Details | Bank / UPI | `useUpdateCompany` + session update | `accHolderName`, `ifsc`, `accountNo`, `bankName`, `upiId`, `gstin` |
| Opening Balance | Archived opening balance | Disabled history fields; link to `/accountant/opening-balances` | Existing `cash`, `bank`, `openingCashDate`, `openingBankDate` remain visible. New financial openings use Accountant; the old PUT route returns 410. |
| Feature Toggles | AI Image toggle | `useUpdateCompany` + `updateIsAiImage` | `isAiImage` |
| Feature Toggles | User track toggle | `useUpdateCompany` + `updateIsUserTrackIncluded` | `isUserTrackIncluded` |

Product/variant input switches and billing units are on `pages/settings/products.vue`, not the Store tab.

**Address handling:** `useUpsertAddress` with `where: { companyId }` - correct upsert (unlike Distributor Form which uses `create`). Address fields also populated from a place-selector component (`onLocationSelected`).

**Unique name availability check:** `useFindUniqueCompany({ where: { storeUniqueName } })` - reactive query; shows if name is already taken.

**Bug:** `onaccSubmit` success toast references `error.statusMessage` before `error` is defined - same pattern as index.vue (line 496).

**ZenStack hooks:** `useUpdateCompany`, `useFindUniqueCompany` (x2), `useUpsertAddress`

---

### `pages/settings/printer.vue` (Printer & Label Settings)
- **Label Settings section:** Printer label size selector (`50x25mm` / `50x38 mm`) - `useUpdateCompany` + `updatePrinterLabelSize`. Moved here from `store.vue`. Has its own `isPrinterLabelSizeChanged` dirty flag and save handler.
- **WebUSB Printers section:** Web-only browser printer management via `useWebUsbPrinter()`
- WebUSB support gate: rendered only when not on native; shows an explanatory warning when `navigator.usb` is unavailable
- **WebUSB persistence:** `localStorage['savedWebUsbPrinters']` (saved USB printers), `localStorage['webUsbPrinterRoles']` (`{ receipt, barcode }`)
- **WebUSB role assignment:** receipt printer and barcode printer are assigned independently; the same USB device may hold both roles
- **WebUSB add flow:** `connectUsbPrinter()` -> `navigator.usb.requestDevice({ filters: [] })` -> save printer record -> assign roles from the saved printer card
- **WebUSB test actions:**
  1. Receipt test calls `printBillViaUsb(sampleReceipt)`
  2. Barcode test calls `printLabelViaUsb(sampleLabel, selectedPrinterLabelSize)`
- **Saved WebUSB printer card actions:** `Set/Clear Receipt`, `Set/Clear Barcode`, `Remove`, plus role badges (`Receipt`, `Barcode`)
- **Bluetooth Printers section:** Native-only (Capacitor): BLE via `@capacitor-community/bluetooth-le`
- Web fallback: `alert('Bluetooth only works on a real device.')`
- BLE Service UUID: `000018f0-0000-1000-8000-00805f9b34fb`
- BLE Characteristic UUID: `00002af1-0000-1000-8000-00805f9b34fb`
- **Printer persistence:** `localStorage['savedPrinters']` (array), `localStorage['selectedPrinter']` (single object)
- **Scan flow:**
  1. `BleClient.initialize()` on mount (native only)
  2. `BleClient.requestLEScan({ services: [SERVICE] })` - filters to matching service UUID
  3. Scan runs for 5 seconds then `BleClient.stopLEScan()`
  4. Discovered devices split into: already-saved (shown as "Online") vs new (shown in "Available Printers")
- **Add printer:** pushes to `savedPrinters`, persists to localStorage, auto-selects
- **Remove printer:** removes from `savedPrinters`, clears selection if was selected
- **Select/deselect:** toggle `selectedDevice` (persisted to `localStorage['selectedPrinter']`)
- **Test print:** `BleClient.connect` -> encode with `ReceiptPrinterEncoder` -> `BleClient.write` -> `BleClient.disconnect`
  - Test print content: hardcoded "Shopname", "MRP Rs. 1440.00", barcode `313063057461`
- Printer encoder library: `@point-of-sale/receipt-printer-encoder`

---

### `pages/settings/numbering.vue` (Number Prefixes & Financial Year)
Previously `settings/sales.vue`, renamed to better reflect content.

**Number Prefixes section:**
- 12 prefix fields: bill, quote, salesOrder, invoice, payment, expense, distributor, distributorPayment, distributorCredit, client, user, account
- Each shows a live preview (e.g. `INV-000001`)
- Save calls `UpdateCompany.mutate` + `updatePrefixes()` auth composable
- **Previous bill prefix:** When `closingDate` exists and bill prefix changes, the old bill prefix is saved as `previousBillPrefix` on the company. This allows records before the closing date to display the old prefix.

**Financial Year section:**
- Shows current `closingDate` if set
- "Start New Year" flow: pick closing date -> confirm modal -> POST `/api/bill/startNewYear` -> `startNewYear()` auth composable
- Resets all counters (bill, quote, salesOrder, invoice, payment) to 1 and renumbers records after the closing date

**ZenStack hooks:** `useUpdateCompany`
**Auth composable functions:** `updatePrefixes`, `startNewYear`

---

### `pages/settings/requests.vue` (Ecommerce Request Rules)
- Stores cancellation/return/exchange/refund policy config in `GeneralPreference` using `pageName = 'ecommerce_requests'` and `key = 'request_rules'`.
- Uses `useFindFirstGeneralPreference` to load the current company rule JSON and `useUpsertGeneralPreference` to save it through the generated ZenStack endpoint.
- Global toggles: notify customer on status changes, allow item-level requests.
- Per-request sections: enabled toggle, eligibility condition, request window in hours, refund/settlement mode, fee type/value, auto-approval, reason requirement, image proof requirement, pickup requirement, and customer-facing policy text.
- This is configuration only; the actual request queue is currently the UI scaffold at `/order/requests`.

---

### Page Preferences
Removed from active storetools routing. The former `pages/settings/preferences.vue` route, `/api/general-preferences` API, document preference sidebar, and quote-only enforcement code were moved out of active source in the 2026-06-15 cleanup.

---

### `pages/settings/members.vue`
Historical route only. This file is absent from the current `storetools/pages` tree and is not one of the six current settings tabs. Do not build integrations against it.

---

### Auth Composable: `auth/composables/auth.ts`
Key exported functions (all call PUT endpoints and then `useAuth().updateSession()` to keep session in sync):

| Function | Endpoint | Purpose |
|---|---|---|
| `authLogin` | POST `/api/auth/login` | Login + session hydrate + redirect |
| `authRegister` | POST `/api/auth/register` | Register + auto-login |
| `authLogout` | POST `/api/auth/logout` | Clear session + navigate to `/login` |
| `authForgetPassword` | POST `/api/auth/forgetPassword` | Change password with current password verification |
| `checkEmailExist` | POST `/api/auth/existinguser` | Returns true/false |
| `updateStoreUniqueName` | PUT `/api/auth/changeStoreUniqueName` | Update store URL slug |
| `updateStorePhone` | PUT `/api/auth/changeStorePhone` | |
| `updateStoreNote` | PUT `/api/auth/changeNotes` | description, thankYouNote, refundPolicy, returnPolicy |
| `updateIsTaxIncluded` | PUT `/api/auth/changeIncludeTax` | |
| `updateIsUserTrackIncluded` | PUT `/api/auth/changeIncludeUserTrack` | |
| `updateIsCostIncluded` | PUT `/api/auth/changeIncludeCost` | |
| `updateSession` | PUT `/api/auth/changeInputs` | productInputs + variantInputs |
| `updateProfileDetails` | PUT `/api/auth/changeprofiledetails` | name, email, image |
| `updatePointsValue` | PUT `/api/auth/changePointsValue` | |
| `updateTimeValue` | PUT `/api/auth/changeTiming` | openTime, closeTime |
| `updateCategoryValue` | PUT `/api/auth/changeCategory` | company categories list |
| `updateAddress` | PUT `/api/auth/changeAddress` | |
| `updateDeliveryConfig` | PUT `/api/auth/changeDeliveryConfig` | full delivery config object |
| `updateLogo` | PUT `/api/auth/changeLogo` | |
| `updateDeliveryType` | PUT `/api/auth/changeDeliveryType` | deliveryType array |
| `updateIsAiImage` | PUT `/api/auth/changeisaiimage` | |
| `updatePrinterLabelSize` | PUT `/api/auth/changePrinterLabelSize` | |
| `updateOpeningBalance` | PUT `/api/auth/changeOpeningBalance` | cash, bank, openingCashDate, openingBankDate |
| `updatePrefixes` | PUT `/api/auth/changePrefixes` | All 12 prefix fields + `previousBillPrefix` if bill prefix changed with closingDate set |
| `startNewYear` | PUT `/api/auth/startNewYear` | Set closingDate, reset counters, refresh session |

**Pattern:** Every setting change calls BOTH a ZenStack hook mutation (for optimistic update) AND the corresponding `updateXxx` auth composable (to persist to session). The session stores a flat copy of company fields so they're instantly available everywhere without re-fetching.

---
## Current product settings page

### `pages/settings/products.vue`

Controls which product and variant inputs sellers see, billing units and size labels, and dimension-related input switches. Reads/saves configuration through `/api/product-inputs` and company update hooks. Also manages scoped custom product fields (create fields versus variant fields) through `/api/product-custom-fields`; field validation runs before save. These are input-definition settings, not edits to existing product rows. The page shows a migration warning if the custom-field database support is unavailable.

The current parent `pages/settings.vue` has six tabs: General, Store, Products, Printer, Numbering and Requests. Earlier references to a `pages/settings/members.vue` route are historical: that Vue file is not present in the current page tree.

Store opening balances (2026-10-06): `/settings/store` displays the old company cash/bank
opening values and dates disabled. Its former legacy PUT is removed; the action links
to `/accountant/opening-balances`. Account role selection remains on `/settings/account`.
