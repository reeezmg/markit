## Settings Pages

### Settings Tab Navigation
- Current `pages/settings.vue` tabs: General, Store, Company & Branches, Products, Account, Printer, Numbering, Requests.
- Head-office admins can select a direct active branch inside Settings without switching the login company. The shell retains `entryCompany` across company-setting tabs and remounts child pages on a target change. `useSettingsCompany()` creates an independent form scope for each child before loading its data; pending saves retain their original target. Unrelated companies and branch-to-head selections are rejected by the shared organization scope.
- Company-setting saves refresh `/api/organization/context` for their target. Cookie-writing auth helpers run only when editing the login's own company; branch values never replace head-office session fields. General's display name belongs to the selected company membership; email/password/avatar remain user-wide. Company & Branches manages the login's organization and clears the local target rather than creating subbranches.
- Printer label size, product dimension/custom-field requests, Accountant mappings and printer-template designer requests use the selected company. Physical printer discovery and browser device selection remain device-local. Shipping proxies resolve company authorization server-side before forwarding the selected branch ID.
- Related Opening Balances, Chart of Accounts and Sales History links retain the local company through `entryCompany`. Sales History validates that selection against its organization options before filtering; its route shell remounts the child on target changes.
- Page scopes reload current company settings, including the login company, rather than relying on old cookie values. `useCompanyRequestSession` also overlays current database settings on every authorized request without changing the cookie. `useSelectedAccounts` reads those page defaults after scope readiness and refreshes only the edited company's context. Thus a branch picks up head-office edits on its next page load/request without a company switch or relogin; existing open forms do not receive a realtime push.
- Local branch-settings verification is recorded in `tests/branch-reports/company-workspace-verification.json`: 151 regressions, 20 focused checks, real settings API save/reload in two contexts (including branch managed from head office), 16 billing/collection scenarios and expense writes in both offices passed. The source-verified production browser run passed branch selection/tab retention and all seven rejected-save checks; six company-owned save requests explicitly proved the branch target, while the rejected profile request targeted the user record. Of 25 page visits, 23 passed and two Store visits had only the known external Maps billing error. All owned database fixtures rolled back. The separate 99-page ERP scope inventory is static coverage, not a fresh CRUD walkthrough of every page.
- `/settings/branches` lets a company admin mark a root company as a head office and create branches. Branches have separate settings, stock, bills, and accounts. The page reads `/api/branches` and calls `/api/branches/head-office` and `/api/branches` for writes.
- `server/api/branches/index.post.ts` provisions the branch's standard accounting accounts and default selections through `initializeNewCompanyAccounts` in the branch creation transaction. Each branch receives its own account IDs; parent account selections are not copied. A provisioning failure rolls back branch creation.
- `TeamsDropdown.vue` lists actual companies and branches and is the explicit session company switch. ERP local table/report filters and full-page form selectors share the right side of `ErpPageNavbar`; selectors for embedded forms and modals stay inside their forms/dialogs. Settings moves its existing route-driven selector to that same navbar position. These controls do not change the sidebar company. There is no synthetic All Stores company; the existing All companies option is a read filter only.
- When the selected company has `parentCompanyId`, the settings shell hides Company & Branches and a direct visit to `/settings/branches` redirects to `/settings/store`.
- Enabling head-office mode refreshes the auth snapshot and Nuxt data; creating a branch refreshes company lists so new branch controls appear without a manual reload. Branch creation rejects inactive parents.
- `utils/companySwitchLocation.ts` keeps safe list/date routes on sidebar company switches, clears company/record query selections, and returns record-edit/detail screens to their corresponding lists. The dropdown reloads the destination page through `location.assign` after verifying the saved session company.
- Inline horizontal tabs via `<SettingsTabNav />` component on the main settings pages: General (`/settings`), Printer (`/settings/printer`), Numbering (`/settings/numbering`), Requests (`/settings/requests`). The Store page (`/settings/store`) uses the parent navigation instead of rendering the tab row again.
- The parent settings page supplies the settings navigation; older child `SettingsTabNav` descriptions may reflect the previous layout.
- Store saves await `mutateAsync` before syncing session fields or showing success (2026-10-21). Loading remains active through persistence and session updates; rejected saves show an error without a success toast. Combined identity/delivery saves use submitted fields even when query invalidation clears dirty flags. Identity uploads its logo before a single company update; profile/avatar saves upload before storing the new key. Profile failures never show success from `finally`. Address reload preserves zero latitude/longitude. `tests/settings-form-save.test.ts` exercises delayed/rejected saves, dirty-flag refreshes and upload failures; `tests/branch-settings-write.integration.test.ts` verifies real enhanced model writes and company isolation with rollback-only fixtures.
- Numbering and Printer label-size saves also await database persistence and session refresh before success; duplicate clicks are guarded. Printer session updates use the submitted size. Account mapping/ecommerce save retries clear stale errors and guard duplicate submissions. Expanded settings model/API suites use owned head/branch fixtures and roll back accounts, preferences, custom fields and fixture bills; they do not alter existing company settings or historical records.
- Expanded verification on 2026-10-21 passed 145 branch regressions (all 146 Vue pages compile), 50 settings component checks plus two account-router suites, and both-role model/API save/reload suites. The source-verified production build browser walkthrough passed all 14 rejected-save interactions across General, Store, Products, Account, Printer, Numbering and Requests; loading cleared, no success appeared and session snapshots stayed unchanged. Its 28 successful page visits and two Store visits blocked solely by external Maps Cloud billing are recorded in `tests/branch-reports/settings-final-summary.txt`. Physical printer output, live uploads and email OTP delivery were not tested.

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
all configured form-default selectors in a disposable schema. The stock and supplier
account-settings integration suites verify selected accounts and frozen snapshots.
Current schema-free coverage is `tests/branch-settings-api.integration.test.ts`:
all 20 default selectors per office, mapping roundtrips without activation,
invalid/foreign selections, clearing defaults, custom-field replacement isolation,
print-preference backups and permissions, real branch creation, and financial-year
validation/numbering using owned fixture bills. The whole company/account graph
rolls back. Disposable-schema suites must not be run under the current schema rule.

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

Printer WebUSB support starts false during SSR and hydration, then detects browser capability on mount. This preserves printer behavior while avoiding server/browser markup differences.
- **Server rendering:** `utils/print-template-renderer.client.ts` loads jsPDF dynamically inside `renderedTemplatePDF`, after browser canvas rendering. Importing the designer during server rendering does not load the PDF library.
- **Device settings:** WebUSB connection cards come first, followed by company designs and collapsed courier PDF settings. Receipt bottom lines (0-30, default 7), automatic cutting and label language (TSPL/CPCL) are saved explicitly on the browser/device. Receipt/report output uses ESC/POS; label language applies to product printing and tests. Connections are made only here, never from a print action.
- **Receipt choices on printer settings:** `pages/settings/printer.vue` enables `hideOriginalReceipt` on the designer. New receipt opens a keyboard-focusable chooser with exactly two starter templates: Tax Receipt and No Tax Receipt. Choosing a starter creates a separate editable copy with a new ID; Cancel/Escape creates nothing. The default receipt selector groups the two base templates separately from saved custom receipts. A null legacy default is shown as a disabled Choose a design placeholder; loading does not overwrite company preferences. Legacy formats are not selectable in the UI. Custom receipt creation, library cards, editing and default selection are available alongside product-label tools.
- **Label choices:** Default product label groups Base templates (Standard Label, 50 x 38 mm) and Your label designs. The base uses reserved `builtin:standard-product-label`, resolves to the original editable starter layout through the canvas renderer, and consumes no custom design slot. It can be saved as the company default and prints as TSPL/CPCL image data; it is not the legacy command fallback.
- **Receipt & Label Designer:** `components/PrinterTemplateDesigner.vue` manages up to 12 company templates and separate receipt/product-label defaults; null defaults retain the internal command fallback for receipts/TSPL; CPCL requires a saved label default. Supports custom text, live fields (including `customFields.<key>` when supplied by print data), uploaded PNG/JPEG logos, lines, CODE128 barcodes, QR codes and receipt item lists. Receipt sections can be dragged/reordered or moved with arrows; label elements can be dragged on the preview or positioned numerically in millimetres. The editor provides monochrome sample previews, PDF download, test print, duplicate/delete and discard/save controls. Only admins/managers can save; changes become active after save, while test print uses the unsaved selected design. The overview separates creation actions from save/discard status, groups Print defaults in a panel and lists Your designs with Default badges. Base-template previews and printer setup tips are expandable. New drafts require Save designs to persist; selecting a starter does not change the company default.
- **Receipt tables:** The builder labels the persisted `items` element as Table. New tables store 1–12 columns with heading text, variable, relative width and left/center/right alignment, plus table borders and cell padding. Width controls show percentages and redistribute remaining space; headings accept explicit newlines and all cells wrap automatically. Header and data cells share column geometry/alignment; each row uses its tallest cell and subsequent receipt sections follow the full table height. The picker groups billed-item values, product/category/subcategory/brand/collection, variant/variant brand, item/size and active product/variant custom fields. Legacy items without columns retain their renderer until Customize table columns is clicked. Changes use normal draft Undo/Redo and save. Existing built-in receipt layouts remain fixed.
- **Design dimensions:** printable width 25–100 mm, label height 15–150 mm, 203/300 DPI. Labels reject content outside the paper or text box, and barcodes too dense for their boxes. Receipts expand item rows and place subsequent sections below them; earned coupon vouchers are appended. Paper width is printable width, so use the printer's printable area rather than its nominal roll width.
- **Built-in receipts:** Original receipt keeps the existing fixed HTML/PDF/ESC-POS paths (`receiptId: null`). No Tax Receipt uses reserved `builtin:no-tax-receipt`, outside the 12 custom slots. Tax and No Tax Receipt can be previewed and selected for the company; selection saves through existing print preferences. Original is retained only for internal legacy rendering/fallback and is not offered in the designer. No Tax Receipt derives from `taxlessReceiptTemplate()` and uses the Tax Receipt's 72 mm thermal typography, company/payment sections, enlarged grand total, inverted savings, conditional UPI QR and footer. Its single-line table keeps SL/DESCRIPTION/QTY/MRP/DISC/VALUE, monetary line discounts, dashed rules and column totals. It omits HSN/tax columns and the tax summary without recalculating charged totals. The shared template renderer handles preview/PDF/ESC-POS with no separate no-tax drawing branch. `utils/no-tax-receipt.ts` remains only as the legacy internal HTML/layout export utility. Preview actions include PDF, test print and Use for company. No Tax Receipt previews use the same monochrome canvas pixels as PDF and ESC/POS output; HTML is no longer offered in the receipt download actions.
- **Tax Receipt (photo layout):** `classicReceiptTemplate()` is a 72 mm built-in (`builtin:classic-tax-receipt`) with condensed thermal type, two header/item layout lines, column totals, discount/round-off, enlarged grand total, inverted savings, rate-grouped SGST/CGST summary, conditional UPI QR, thank-you note and customer-care footer. New receipt lets the user select this or the No Tax starter before opening an editable copy. Use photo layout applies it to an existing receipt draft with Undo support. Receipt tables allow up to three independent layout lines; each line normalizes its own column widths and repeats for every item. Columns can sum numeric billed values; item gaps, horizontal rules, heading weight, section gaps, inverse text, tax summaries and spacers are editable. Built-in preview uses representative tax-inclusive sample items; actual bills use their own data/company tax mode. QR uses the company UPI address and UPI tender amount (including Split); absent UPI details omit caption and code. Original and No Tax Receipt remain separate defaults. Preview/PDF/thermal output share raster geometry; standalone HTML embeds the same raster for this preset and custom receipts.
- **Tax / Taxless editor presets:** Header buttons replace the current receipt draft layout (Undo supported). Tax restores Tax Receipt. Taxless keeps its company/payment/footer sections, removes tax summary and its preceding spacer, and uses one table line: SL, DESCRIPTION, QTY, MRP, DISC, VALUE, with dashed rules and a TOTAL row. DISC uses computed monetary line discount (finite fallback zero); VALUE uses billed `tvalue`. This changes presentation only, not bill tax calculation. Layouts remain editable and persist through existing template preferences; PDF and ESC/POS use the shared renderer.
- **Custom receipt starter layout:** New receipt first asks for Tax Receipt or No Tax Receipt, then copies `classicReceiptTemplate()` or `noTaxReceiptTemplate()` with a fresh custom ID and an editable name. Both open in the existing full-page editor and support the normal save, default selection, preview, undo/redo and duplication controls. Receipt layout changes remain presentation-only. The original base templates are unchanged by editing the copy; saved custom designs remain available in the library and the default selector.
- **Direct receipt canvas editing:** The canvas occupies the available workspace height and sits left of the narrower properties panel on desktop. Persistent help captions and the workspace footer are removed. Its toolbar operates on selected boxes: reorder, duplicate, delete and align left/center/right within the printable paper width. Text alignment/bold remain in properties. Receipt dragging changes horizontal `x` and vertical `gapBefore` (0-300 mm); the renderer adds that space before a section and subsequent sections retain automatic flow, including growing tables. Upward dragging removes existing space above; section-order buttons/sidebar dragging move across other sections. Side/bottom handles resize width/minimum height with paper bounds and 2-100 mm size limits. Pointer cancellation restores geometry; gestures form one undo step. Unmodified mouse wheel zooms (25-300%); dragging the canvas background pans, and scrollbars remain available. Fit width, zoom presets/buttons and keyboard shortcuts are retained. Rendering stays debounced and PDF/ESC-POS use the same geometry.
- **Designer undo/redo:** `utils/designer-history.ts` keeps up to 50 local draft undo steps. Ctrl/Cmd+Z undoes; Ctrl+Y or Ctrl/Cmd+Shift+Z redoes, scoped to the label and receipt editor workspaces. Undo/Redo buttons appear only inside those editors, not in the main settings toolbar. Pointer moves/resizes are single transactions; synchronous mutations such as element reordering are batched. Variable search retains native text undo. New edits clear redo; load, successful Save and Discard reset history. Undo/redo changes only the draft and requires Save to persist.
- **Label and receipt editor workspace:** New label, New receipt and the template library's Edit cards open `components/PrinterDesignerWorkspace.vue` as a full-page native dialog. The dialog contains focus, locks background scrolling, restores focus/scrolling on close and blocks closing during save/print. Done or Escape retains the unsaved draft; Discard changes restores saved settings. Receipts use the same full-page modal, with receipt-specific headings and content-ordering guidance. Desktop uses a wider canvas on the left and independently scrolling properties on the right. Label setup is the first tab and opens by default; it contains paper dimensions, resolution, default selection and design actions. Content follows with human-readable item names and selected-item properties. Position and size controls are expandable. Selected label elements also expose eight edge/corner resize handles; pointer movement is converted from preview pixels to paper millimetres, with 2 mm minimum boxes and paper-bound clamping. Arrow keys on focused resize handles resize by 0.1 mm (Shift: 1 mm). Elsewhere in the label editor, arrow keys move the selected box by 0.1 mm (Shift: 1 mm), clamped to paper bounds; text inputs and selects retain normal keyboard behavior. Clicking or dragging a canvas box focuses it so keyboard movement works immediately. These moves participate in draft undo/redo. Label hit boxes follow the editable geometry even when text overflow makes the preview invalid, allowing users to expand the box to recover. ResizeObserver fits labels within both preview axes. Receipts fit the available width (up to 200%) and scroll vertically so long bills remain readable; Fit width restores this after manual zoom (25-300%). Built-in Tax and No Tax Receipt previews use the same representative sample data and are centered at up to 420px wide, so the on-screen receipt is readable without changing its paper dimensions. Below 761px the preview appears above the controls and the workspace scrolls. Zoom only changes the preview, never the rendered print dimensions. Browser checks cover panel widths, preview containment, tab/selection interactions, focus restoration, draft retention and zoom alongside rendering checks.
- **Original label starter:** New label uses `originalLabelTemplate()` at 50 x 38 mm with left-aligned thermal typography: shop name, divider, product name, combined variant name and item size value, MRP, discounted price, variant code, and barcode with readable digits. It mirrors the original TSPL layout using editable canvas elements. Existing saved designs are unchanged; Use original label layout resets the selected draft to this starter with Undo support. `labelVariantSize` joins flat `name`/`variantName` and `size`, with nested variant/item fallbacks; code uses the existing variant code supplied as `code`. Label properties expose Show this item (always/discount/no-discount) and Strike through (never/always/discount). A discount requires finite nonnegative dprice below finite sprice, including a zero discounted price; null, missing, invalid, equal or higher prices do not count. The MRP starter strikes only for discounts, and the discount row is visible only for discounts. Fixed label positions retain space for hidden rows. Sample data/With discount/Without discount preview modes exercise both branches without changing product data. Hidden items remain selectable in the editor. Rules are declarative schema fields, evaluated by the shared renderer for preview, PDF and TSPL bitmap output; no executable expressions are stored.
- **Label variables:** Content > Variable opens a searchable, grouped picker for company/address, product/category/subcategory/brand/collection, variant/variant brand/size label, item, distributor/address/company number and purchase-order fields. Active product/variant custom-field definitions are loaded from `GET /api/settings/label-variables`. `utils/label-variables.ts` owns the catalogue and sample values; preview/PDF/test-print use sample data. Distributor values follow the product purchase order and remain blank without that link. Existing flat-field designs remain supported.
- **Company persistence:** `GET/PUT /api/settings/print-templates` uses existing `general_preferences` rows at page `printer`, key `templates`; the previous saved JSON is backed up to `templates-backup` within the save transaction. No schema changes or runtime DDL. Designs are fetched fresh for printing while online; a company-keyed local cache supports offline printing after an online load/save.
- **Output:** Preview, PDF and thermal output share `utils/print-template-renderer.client.ts`. Direct receipts use ESC/POS raster bands; labels use TSPL BITMAP or CPCL CG binary raster. Web uses assigned WebUSB printers; native mobile printing uses the selected Bluetooth printer; unsupported browsers, missing assignments and USB errors report actionable errors. Legacy fixed command builders remain internal pre-transmission failsafes for receipts/TSPL; CPCL and unsaved editor tests surface rendering errors. No job retries after a USB transmission failure. Courier labels remain carrier-generated PDFs.
- **Standard paper sizes:** Both canvas toolbar and setup panel offer receipt printable widths 48, 58, 72 and 80 mm (48/72 identify common 58/80 mm rolls), and labels 40-30, 50x25, 50-30, 50x38, 60x40, 80x50 and 100x150 mm. `utils/print-paper.ts` resizes existing element geometry, preserving content and IDs; custom dimensions remain available. Small sizes still need content appropriate for the available area. Width and height belong to the saved design, used by billing/bill edit/product printing.
- **Validation:** `npm run test:print-templates` runs focused TypeScript and pure schema/raster checks; `npm run test:print-template-browser` runs isolated Chromium tests for rendering, PDF dimensions, printer pixel equivalence and designer interactions. Set `PRINT_TEST_BROWSER` when Chromium is installed outside the runner's known locations. `PRINT_TEST_PAGE=printer-settings-browser.html` runs settings connection/assignment, persisted language and receipt/CPCL label button tests with mocked USB. `PRINT_TEST_PAGE=bluetooth-settings-browser.html` with `PRINT_TEST_VIRTUAL_MS=60000` tests native Bluetooth discovery, saved selection, receipt/CPCL test printing and forgetting with mocked BLE. No database writes occur in these tests; physical printer calibration still requires test prints.
- **Label Settings section:** Printer label size selector (`50x25mm` / `50x38 mm`) - `useUpdateCompany` + `updatePrinterLabelSize`. Moved here from `store.vue`. Has its own `isPrinterLabelSizeChanged` dirty flag and save handler.
- **WebUSB persistence:** `savedWebUsbPrinters` stores device identities and `webUsbPrinterRoles` stores independent receipt/barcode assignments. `markit-label-printer-language` stores TSPL/CPCL. The same device may hold both roles if it supports the respective commands.
- **Connection:** Connect USB printer calls `navigator.usb.requestDevice`; role dropdowns assign saved devices. Manage saved devices forgets a device and clears its assignments. Browser capability detection happens on mount, preserving SSR hydration.
- **Print preparation:** System-font canvas rendering does not wait for unrelated page webfonts. USB device discovery overlaps job preparation. Identical JSON label payloads reuse rendered bytes within one job while retaining every requested copy; different payloads and later jobs render independently. Printing uses a schema-validated versioned localStorage cache keyed by company, fetching settings only on a missing/invalid cache. Loading Printer Settings or successfully saving designs/defaults refreshes that company cache. Failed saves leave it unchanged. The v2 cache key invalidates pre-rollout defaults once, then keeps selections locally. Later changes from other devices become visible when Printer Settings is reloaded; browser storage clearing requires an online fetch.
- **Print feedback:** Shared WebUSB and native Bluetooth transports show one Print initiated toast before preparing images or connecting, after checking printer selection, covering page actions and test prints. They yield to the UI before preparation. Later failures still reach the caller error handler; initiation does not confirm transmission or paper output.
- **Test language:** The WebUSB product label card offers a TSPL/CPCL selector for that test job only. It initializes from the saved device language; changing it does not change the normal product-print setting. Receipt tests remain ESC/POS.
- **Tests:** Receipt/label test actions use the selected settings company's saved default designs. Company scope is included in sample data.
- Local print server routing and the separate legacy label-size selector remain removed. Native mobile Bluetooth discovery is restored through `BluetoothPrinterSettings.vue`: scan for five seconds, save/select/forget devices, and test the current receipt or label design. Existing `savedPrinters` and `selectedPrinter` values are reused. Scans stop on unmount; selection and capability are loaded after mounting for SSR safety.

---

### `pages/settings/numbering.vue` (Number Prefixes & Financial Year)
Previously `settings/sales.vue`, renamed to better reflect content.

**Number Prefixes section:**
- 8 prefix fields: bill, expense, distributor, distributorPayment, distributorCredit, client, user, account
- Each shows a live preview (e.g. `INV-000001`)
- Save awaits `UpdateCompany.mutateAsync` and then `updatePrefixes()`; rejection leaves the auth snapshot unchanged and shows an error.

**Financial Year section:**
- Shows current `closingDate` if set
- "Start New Year" flow: pick closing date -> confirm modal -> POST `/api/bill/startNewYear` -> `startNewYear()` auth composable
- Renumbers undeleted bills after the closing date and sets the bill counter to their count plus one. Other counters are untouched. The API checks authenticated company scope, admin/manager/accountant role and a valid date, then locks the company row for the source transaction. SQL timestamp/integer casts support typed prepared parameters. The client retains its submitted date while saving; the auth endpoint only refreshes the session closing date.

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
Historical route only. This file is absent from the current `storetools/pages` tree and is not a current settings tab. Do not build integrations against it.

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
| `startNewYear` | PUT `/api/auth/startNewYear` | Refresh session closingDate after the separate bill-numbering API succeeds |

**Pattern:** Model-backed setting saves await persistence, then refresh their company context through `useSettingsCompany`. Its `updateXxx` wrappers call the legacy auth composable only for the login company. Branch edits refresh local context without updating the authentication cookie. Account/custom-field/template handlers retain their dedicated persistence paths.

---
## Current product settings page

### `pages/settings/products.vue`

Controls which product and variant inputs sellers see, billing units and size labels, and dimension-related input switches. `/api/product-inputs` reads the dimension flags; one awaited company mutation saves all built-in fields, units, size labels and flags through nested product/variant input upserts. Missing input rows are created in the same transaction. Saved flags use the submitted snapshot, while the computed dirty state compares all current fields and toggles so changes during a save remain visible. The previous split model/session/dimension save is removed.

Custom product/variant fields use `/api/product-custom-fields`. Replace requires an explicit fields array; invalid selections and duplicate IDs reject before replacement. The API locks submitted existing IDs and rejects foreign-company ownership before deleting any current definitions. Its conflict update also checks company ownership to reject concurrent foreign-ID conflicts atomically. Label edits retain the supplied stable key. These settings do not edit values stored on existing products. The migration warning remains for databases without custom-field support.

The current parent `pages/settings.vue` has eight tabs: General, Store, Company & Branches, Products, Account, Printer, Numbering and Requests. Company & Branches is hidden in a branch. The historical members route is absent.

Store opening balances (2026-10-06): `/settings/store` displays the old company cash/bank
opening values and dates disabled. Its former legacy PUT is removed; the action links
to `/accountant/opening-balances`. Account role selection remains on `/settings/account`.
