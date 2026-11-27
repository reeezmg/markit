## Settings Pages

### Sidebar settings

`/settings/sidebar` lets administrators/managers choose ERP, CRM, Storetools and Connect plus individual pages. Without saved choices only ERP is enabled; CRM, Storetools and Connect default to false. Choices are company-specific, backed up and versioned in existing GeneralPreference JSON; no schema change is needed. Other roles have a read-only view. Both sidebar modes update immediately for the login company; head-office edits to branch preferences stay scoped to that branch. Settings remains reachable in the user menu. See [ARCH-sidebar-navigation.md](ARCH-sidebar-navigation.md) for persistence, permissions and verification.

### Settings Tab Navigation
- Current `pages/settings.vue` tabs: General, Store, Company & Branches, Products, Account, Sidebar, Printer, Numbering, Requests.
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

Sales > Settings (`/erp/settings`) groups Accounts, Printer, Numbering and Sales
preferences without moving the existing settings routes. `Sales/AccountSettings.vue`
edits only Billing & sales mappings through GET/PUT `/api/accountant/erp`, merging
the seven edited sales fields into current mappings so expense-specific accounts
are preserved. Saving does not activate posting; **Save and connect accounting**
explicitly uses the existing `/erp/enable` action. The account editor retains the
admin/manager/accountant gate and refreshes the selected company's account defaults.
Printer and Numbering render their existing page editors under the Sales shell;
their company settings and device-local printer behavior are unchanged. The
preferences tab opens existing `Billing/Preferences.vue` (invoice/sale) and
`Quotes/Preferences.vue` (quote/sales-order), with their existing permission checks
and APIs. All Sales settings tabs retain the company/branch query selection.

Company & Branches (`/settings/branches`) owns the **Enable invoicing workflow**
and **Enable after-sales** checkboxes with explicit Save workflow. The workflow card
is removed from Sales settings. A company/branch selector targets the login company
or one of its active direct branches without switching the login. Existing branch
organization management and its root-company access rules are unchanged.
Invoicing off shows Billing, Sales, Credit and Settings in the Sales sidebar. On
shows Quotes, Billing, Sales, Credit, Sales order, Recurring invoices, Retainer
invoices, Payments received, then Settings. This company-specific navigation choice
is stored at `GeneralPreference` `sales-workflow/defaults` as `includeInvoicing`.
`includeAfterSales` controls the After-sales group in both ERP and Storefront sidebars.
It also hides related product, billing/invoice, client/order, ecommerce return and
customer-product numbering controls, and shows a disabled notice on direct workspace
visits. Existing service records and their integrity protections remain intact.
Missing flags default to disabled for both invoicing and after-sales; companies opt in explicitly.
Admin/manager/accountant may save. Partial API updates preserve the other saved flag.
`useSalesWorkflow` shares company-keyed state between settings and the active-company
sidebar, applies successful saves immediately, and prevents late reads from undoing
a save or crossing company contexts. Failed saves retain the previously saved mode.
Menu visibility does not change document authorization, accounting or existing data.
Billing also reads this setting: when off, its mode selector is hidden and its local
mode stays Pay now, including after draft restoration or an invoice-mode query link.
Turning the setting on restores the selector. Existing issued documents are unchanged.

Native bank disconnection (2026-10-06): staff/supplier configuration no longer
queries archived BankAccount records. Historical `bank:<id>` roles are retained
from source documents and saved mappings for existing postings. Staff settings
returns no legacy bank selector options; future payout choices use active native
BANK accounts or the configured default. Existing source account snapshots remain
authoritative on edits.

Company-scoped admin/manager/accountant configuration is grouped into Billing & sales,
Expenses, Salary & staff credit, Purchase & supplier payments, Investments, Loans,
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
Loans exposes receiving Cash/Bank, long-term liability, current liability, interest
expense and fees expense. These defaults are also managed at `/loans/settings`.
New loans use the company loan defaults, with per-loan overrides; investor account
mappings do not control loan posting accounts. The investor form exposes only
equity and profit-payable mappings, preserving historical loan mappings internally.
POST `/account-settings/investment-defaults`
initializes missing investment/loan defaults using the standard company account
codes, preserving valid custom defaults. Investor and loan entry forms call it
before loading account choices; repeated initialization creates no duplicates.
Missing defaults are restored for these flows even after an empty settings save.
No new schema is required. Empty saved groups clear older defaults. Purchase forms
and payment writes use company defaults only without an existing source-account
snapshot; explicit transaction choices take precedence. Investor profiles/movements,
Receive/Pay, transfer creation, asset categories and disposals prefill from these
settings. Existing posted source mappings remain unchanged. Ecommerce PUT `/settings`
updates future-order defaults without enabling posting or changing existing orders.

Selection precedence (updated 2026-10-29): new supplier transaction forms merge
company purchase defaults, then saved supplier mappings, then the user's transaction
choices. Saved supplier choices therefore override the company fallback for the same role;
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
- **Sales History table:** `pages/saleshistory/index.vue` filters by related `BillHistory.changedAt`, using full selected Indian calendar days with an exclusive next-day boundary. All dates removes that event date filter; both the bill eligibility and expanded snapshots use the same event/cleanup predicate. Events default to newest first with an ID tie-breaker. Search normalizes invoice numbers and safely returns no matches for invalid/out-of-range integers. Filters, sorting and page-size changes reset pagination and expansion; empty results start at zero and shrinking counts clamp the page. Query failures display errors. Restore is guarded against duplicate clicks, sends the row's company explicitly without changing the table scope, and refreshes rows/count after the transactional source API succeeds.
- **History detail:** `pages/saleshistory/[billId].vue` remains read-only. `utils/sales-history.ts` normalizes numeric snapshot values and snake/camel payment fields, preserves zero quantities, and hydrates saved split payments (including Bank/Cheque and historical method names). Quantity/rate cells match their headers. The displayed invoice date uses the stored creation date, with the history timestamp shown separately in Indian time. Errors/missing records no longer show an empty bill form. Split details have a Close action; resizing listeners are removed on unmount. `tests/sales-history.test.ts` covers filters, snapshot hydration, pagination, restores and Vue compilation without database access.
- **Delete Account:** Opens `SettingsDeleteAccountModal`
- ZenStack hooks used: `useFindUniqueUser`, `useUpdateUser`, `useFindUniqueCompanyUser`, `useUpdateCompanyUser`

---

### `pages/settings/store.vue` (Store Settings)
Largest settings page - manages all company-level configuration. Every field has a corresponding `isXxxChanged` ref (dirty tracking) to only enable Save buttons when a field is actually changed.

**Layout:** Settings are organized into eight visually separated groups, each with an `<h2>` heading, a short description, and a thick `border-b-2` divider between groups (no inner `UDivider` lines within a group). The Store page does **not** render `<SettingsTabNav />`; it uses the parent settings navigation. Several groups are rendered as stacked card blocks so labels sit above controls rather than beside them. Combined save buttons include:
- **Store Identity** - "Save Store Identity" covers store unique name, logo, categories and Store Description in one awaited `useUpdateCompany.mutateAsync()` call. Description retains its 40-character input and dirty tracking. Submitted values drive session synchronization even if query refresh clears dirty flags.
- **Contact Details** - one save covers phone, email and social links. Address remains in Store Location with its own save.
- **Delivery Settings** - single "Save Delivery Settings" button covers delivery type, delivery mode, radius, and self-delivery discount in one mutation + one toast

Other sections retain their own save buttons or immediate toggles. Description & Policies is removed, including Thank You Note, Refund Policy and Return Policy inputs. Removing the controls does not erase their existing stored values.

**Sections and what they update:**

| Group | Section | Hook / Auth fn | Fields |
|---|---|---|---|
| Store Identity | Store unique name (URL slug) | `useUpdateCompany` + `updateStoreUniqueName` | `storeUniqueName` |
| Contact Details | Store phone | `useUpdateCompany` + `updateStorePhone` | `phone` |
| Store Identity | Store Description | `useUpdateCompany` + `updateStoreNote` (preserving legacy policy session values) | `description` |
| Store Identity | Logo | `AwsService.uploadBase64Object` + `updateLogo` | `logo` (S3 uuid) |
| Store Location | Address | `useUpsertAddress` + `updateAddress` | street, landmark, city, state, pincode, lat, lng, placeId, formattedAddress, name |
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
- **Label choices:** Default product label groups Base templates (Standard Label, 50 x 38 mm) and Your label designs. The base uses reserved `builtin:standard-product-label`, resolves to the editable Standard Label through the canvas renderer, and consumes no custom design slot. It can be saved as the company default and prints as TSPL/CPCL image data; it is not the legacy command fallback.
- **Label starter tools and typography:** `originalLabelTemplate()` builds the Standard/New label exclusively from linked Text, Line and Code layers with normal editor properties. Its 50 x 38 mm layout uses Arial, a bold shop name and discounted price, regular product/variant/MRP/SKU text, and an independently editable centered barcode-value Text layer. The Code 128 layer hides its encoder caption so readable digits are not stretched with the bars. MRP strikethrough and sale-price visibility use ordinary Conditions comparing the price fields; there are no discount-specific inspector options. `label-tool-template.ts` refreshes only exact untouched legacy eight-layer thermal starters when opened by an admin/manager, preserving design identity and the original layer IDs. This is one undoable local draft change requiring Save; customized saved labels are retained. Standard/base output and newly created labels use the clean starter immediately. PDF and TSPL/CPCL use the same configured-font canvas; no printer font commands are substituted.
- **Receipt & Label Designer:** `components/PrinterTemplateDesigner.vue` owns the company library, starter chooser, defaults, scoped loading/saving and output. It supports up to 12 custom templates; reserved built-in templates consume no custom slot. Only admins/managers mount the editor and save. New label, the Tax/No Tax receipt starter chooser and library Edit cards navigate to `/print-design/{label|receipt}/{id}`. The route is authenticated with `layout: false` and `documentDesigner: true`; editors fill the viewport without a modal or application navigation. Built-in receipt preview dialogs remain read-only previews with PDF/test/default actions.
- **Receipt tables:** Add content groups Text, Linked data, Image, Codes and Table at the top of the inspector. Table offers Items and Tax summary as data sources; neither has a separate insertion button at the bottom. Both sources expose the same column editor and table sizing/style controls. Changing source preserves the layer ID, position, appearance and each source's configured columns, with Undo/Redo. Version-1 JSON retains `items`/`taxsummary`, using `columns` for item rows and optional `taxColumns` for tax rows. Each source supports 1-12 columns with heading, row-data field, relative width, alignment, layout line, Text after value, total-row label and totals. Tax fields are `tax.rate`, `tax.sgst`, `tax.cgst`, `tax.total` and row number; amounts come from `receiptSummary`, without changing bill arithmetic. Items retain billed-item, catalogue and active custom-field groups. Width percentages redistribute only the same layout line; headings/newlines and cells wrap, and later receipt sections follow the full table height. The common renderer handles headers, widths, typography, padding, borders, rules, totals and wrapping for both sources. New Tax summary tables contain only the configured table; titles are normal Text layers. Old saved tables without explicit columns retain their legacy output until converted or configured. Layer names are Table / Items or Table / Tax summary unless renamed. Labels offer Text, Linked data, Image and Codes, without receipt tables.
- **Codes:** The shared label/receipt editor offers `+ Codes` beside the other content types. Opening its chooser creates nothing; QR code and Barcode insert normal selectable layers, including inside a selected frame. New codes are revealed in the canvas after rendering. Labels initially bind to product barcode; receipt QR binds to `receiptUpiPayment` when available, otherwise invoice number, while receipt barcodes use invoice number. Content has one Code type selector (QR, Code 128, Code 39, EAN-13, EAN-8, UPC-A and ITF-14) and the existing searchable Link to data/custom Code value controls. UPI payment link uses the same payment/balance-aware value as the built-in receipt QR. Switching type preserves layer ID, geometry, appearance and binding/value and supports Undo/Redo. Barcodes can hide their readable value. Numeric formats accept a base value or a complete valid check digit; Code 39 encodes letters in uppercase. Invalid values display a local rendering error and block Save/output instead of producing a blank code. Optional version-1 JSON `barcodeFormat` and `barcodeDisplayValue` persist through the existing company-scoped settings API; omitted fields retain the original Code 128/readable-value pixels. No database schema changes are involved.
- **Shared Conditions:** `DocumentDesigner/Conditions.vue` is embedded in `ElementProperties.vue` for labels, receipts, quotes and sales orders. Each layer supports up to 16 rules, each matching All/Any of 1-8 conditions. Conditions select a data field and test filled/empty, equality/inequality, numeric comparisons or text containment, against a value or another field. Zero remains a value; missing/invalid numbers do not pass numeric comparisons. Actions are Show only when matched, Hide when matched, text strikethrough/bold/italic/underline/colour, background/fill colour or stroke colour. Show rules gate visibility even when unmatched; Hide applies only on a match. Multiple visibility gates combine and cannot unhide a manually hidden layer; later matching paint rules win, and unmatched formatting retains the base appearance. Stroke colour uses the normal configured stroke width. The inspector reports matching against current preview data. Strikethrough is also a normal visible typography toggle. `utils/designer-rules.ts` owns schema/evaluation shared by DOM and raster output. Legacy printer `whenField`, `visibility` and `strikeThrough` remain readable and appear as generic rules; editing rules converts those properties in the local draft in the same Undo transaction. Custom preferences are not written on open. No discount-specific controls remain. Quote required totals/items and ancestors of protected native values reject visibility rules in both UI and schema. Label related-variable loading includes rule references. Optional version-one JSON rules require no database schema change.
- **Table sizing:** `DocumentDesigner/TableProperties.vue` and `ColumnWidth.vue` are shared with quote/sales-order tables and both receipt table sources. Optional `items.tableStyle`/`taxsummary.tableStyle` stores minimum row/header heights, cell padding, point-based body/header text sizes, vertical alignment and border thickness. Columns have numeric percentage inputs and sliders; resizing redistributes only columns on the same receipt layout line through `utils/document-table.ts`. Rows grow past minimums to fit content and later receipt sections follow their full height. Preview/PDF/ESC-POS use that same canvas geometry. Existing print tables without these properties retain their rendering. Product thumbnail sizing/fit/placement belongs to quote/sales-order adapters; receipt tables use text-variable cells. Labels do not support receipt tables. Settings require explicit Save and add no database columns.
- **Shared document editor tools:** `components/DocumentDesigner/workspace.css`, `QuoteCanvas.vue`, `LayerTree.vue`, `ElementProperties.vue`, `DataBinding.vue`, `TextProperties.vue` and `CanvasToolbar.vue` serve quote/order and printer editors. `PrintEditor.vue` adapts the existing printer format through `utils/print-designer.ts`. It has a left layer tree, shared move/hand tools, nested frames, marquee/Shift multi-selection, snapping/grid, align/distribute, resize/rotate, group/ungroup, clipboard, visibility, inherited locks and a contextual right inspector. Print text uses points (6-32). The editing canvas preserves colours and has no Thermal preview toggle. Printing renders the configured fonts/layout into an image; thermal commands encode that image as monochrome raster data rather than replacing text with printer fonts. Labels retain fixed millimetre geometry and overflow validation; receipt sections retain growing flow by default. Applying a starter preserves the selected design ID/name. Uploaded images still normalize PNG/JPEG/WebP through `designer-image.client.ts` and capture the target before async work.
- **Inspector sections:** Printer-layer properties use Content, Position, Layout, Appearance, Typography, Fill, Background, Stroke and Conditions through shared `ElementProperties.vue` extension slots. Linked text/barcode/QR content has matching Text before value and Text after value controls and a complete formatted preview. Optional version-1 `suffix` complements the existing `text` prefix; `printElementValue` resolves the same content for preview, raster/PDF/printer output and disconnecting to manual text. Empty linked data omits both affixes; zero remains a value. Disconnecting snapshots the combined text once and clears the suffix; linking manual text/code starts with the selected value. Position contains alignment, X/Y, rotation, quarter-turn and flips, plus receipt flow/fixed placement. Layout contains text Auto width / Auto height / Fixed size, dimensions, saved aspect lock for numeric and pointer resizing, and matching Padding/Margin controls. Margin replaces Space before/after and expands to top/right/bottom/left; old receipt gaps display as top/bottom margins (defaults 0/1 mm) until edited. Flow Y is editable: numeric Y, vertical dragging and the top margin all adjust the same signed flow offset. Negative offsets move a layer upward, bounded by the page top; the layer still follows earlier content as tables grow. Multi-selection uses one shared movement delta instead of adding it again for every selected section. Switching placement preserves measured position where valid; fixed sheet layers must fit the first sheet, and excessive flow gaps report a local error. Appearance contains layer visibility, opacity and corner radius. Text layers use a separate Background colour section instead of the former White text on black checkbox. `FourValues.vue` expands corner radius into top-left/top-right/bottom-left/bottom-right inputs. Layout offers the same expansion for Padding (space inside text, images/codes, tables and native quote content), with top/right/bottom/left inputs. Each unified field shows Mixed for unequal values; editing it replaces all four overrides. Expanding/collapsing alone preserves values and adds no history step. Margin is space outside the layer; Padding is space inside it. The same Margin control is available to quotes, labels and receipts. Four-sided values support -300 to 300 mm, including negative top margins for upward receipt movement. Existing quote gaps and receipt `gapBefore`/`gapAfter` are fallbacks, not an additional spacing layer. Manually positioned frame children retain parent-relative coordinates, with margins outside their border boxes. Page setup offers all six named system font families, Arial (standard) and the legacy Condensed thermal page font. Text layers and receipt item/tax tables can inherit Page font or select their own family. An explicitly chosen layer/table family renders at natural width, even on a condensed page. Typography adds six system font families, numeric weight, size presets, Auto or percentage line height, absolute or percentage letter spacing, horizontal/vertical alignment and More text options for existing heading/list/strike-through controls. Fill supports up to eight solid fill layers with editable colour/hex, opacity, visibility, add/remove and presets. New fills go above existing paint so opaque earlier fills cannot hide a newly added colour; Fill explains Text colour for text layers and Colour inside the layer for other elements; Stroke explains the layer outline and contains section borders/double rules. Text Background uses the same swatch, editable hex, opacity, visibility and presets, plus Add/Remove background; removing it restores transparency without changing text colour. Non-text layer backgrounds remain their Fill, so there is no duplicate colour control. `PrintVisibility.vue` groups the layer toggle, Always print / Only if data is available, Data to check, current value and rule result; label discount conditions live here too. Empty/whitespace-only condition data hides the whole layer and removes its receipt flow spacing; numeric zero is available data. Frames, images and tables use the same visibility controls. These are declarative presentation settings, without executable expressions or database schema changes.
- **Saved inspector presentation:** `utils/designer-presentation.ts` defines optional shared version-1 fields (`fontWeight`, `letterSpacingUnit`, `textVerticalAlign`, `resizeMode`, `aspectLocked`, `fillOpacity`, `fillVisible`, `fills`, `cornerRadii`, `padding`, `paddingSides`, `margin`, `marginSides`, `backgroundOpacity`, `backgroundVisible`) for both quote layers and printer elements. Scalar `radius` remains the fallback; explicit corner and side objects override the unified value, including zero. Corner radii/padding are 0-100 mm; margins are -300 to 300 mm and use normal draft history/save. DOM border-radius/padding/margin and raster content/border boxes apply the same clockwise order; automatic text sizes include padding and flowing receipt height includes top/bottom padding. Padding that leaves no content width or no height in a fixed box is rejected before printing. Images clip to the configured rounded outer box. The DOM and raster renderers apply them; absent properties retain existing layouts. Automatic text dimensions are measured from current bound values, including affixes. Manual resizing switches back to fixed dimensions. Parent/page vector conversion includes ancestor flips and rotation, so nested drags and numeric positions remain consistent in mirrored frames. Raster validation uses measured auto dimensions, including label/frame/first-sheet bounds, and blocks unprintable overflow. Text background opacity/visibility is independent of text Fill and layer opacity. The raster background grows with wrapped receipt text. Empty receipt text still renders its explicitly enabled background or stroke in its configured box and consumes normal flow space; text Fill remains independent. Empty text without background/stroke retains legacy collapse. A data visibility condition still hides the whole layer, including its paint. Collapsed empty text returns separate `emptyBounds` selection metadata at its actual flow/parent position, so selecting an empty GST/address field does not highlight the company heading. Unselected collapsed hitboxes do not intercept canvas clicks. Empty content skips glyph measurement/drawing, preserving small fixed boxes and configured auto-size fallbacks. Legacy `inverse: true` outside converted starter copies still renders through its original path: the inspector projects white text/black background without mutating the draft on open. A colour, fill or background edit converts that layer to explicit colours and clears inverse in the same undo step; geometry/typography edits preserve it. Font availability is system-dependent. `renderPrintTemplate` defaults to print mode; optional `{ mode: 'design' }` retains colour for the editor without changing geometry. Thermal PDFs and receipt/label printer bytes convert colours and opacity to monochrome, while sheet PDFs and quote DOM output retain colour. Line Fill controls the rule ink (including opacity/visibility), with legacy `color`/black fallback. Explicit transparent shape fills stay transparent. Table Fill paints the whole measured table height behind its independent text, including growing rows. Stroke follows rounded rectangles or ellipses and sits inside the layer bounds, preventing clipping at paper edges. No database migration is involved.
- **Design dimensions:** thermal printable width 25-100 mm, label height 15-150 mm, 203/300 DPI. Receipt sheets support A4 (210 x 297 mm), A5 (148 x 210 mm) and Letter (216 x 279 mm). Labels reject content outside the paper or text box, and barcodes too dense for their boxes. Receipt item rows expand and later flowing sections follow them; independent images do not consume section space. Earned vouchers remain appended.
- **Built-in receipts:** Original receipt keeps the existing fixed HTML/PDF/ESC-POS paths (`receiptId: null`). No Tax Receipt uses reserved `builtin:no-tax-receipt`, outside the 12 custom slots. Tax and No Tax Receipt can be previewed and selected for the company; selection saves through existing print preferences. Original is retained only for internal legacy rendering/fallback and is not offered in the designer. No Tax Receipt derives from `taxlessReceiptTemplate()` and uses the Tax Receipt's 72 mm thermal typography, company/payment sections, enlarged grand total, white-on-black savings using normal Text colour/Background, conditional UPI QR and footer. Its single-line table keeps SL/DESCRIPTION/QTY/MRP/DISC/VALUE, monetary line discounts, dashed rules and column totals. It omits HSN/tax columns and the tax summary without recalculating charged totals. The shared template renderer handles preview/PDF/ESC-POS with no separate no-tax drawing branch. `utils/no-tax-receipt.ts` remains only as the legacy internal HTML/layout export utility. Preview actions include PDF, test print and Use for company. No Tax Receipt previews use the same monochrome canvas pixels as PDF and ESC/POS output; HTML is no longer offered in the receipt download actions.
- **Tax Receipt (tool-based layout):** `classicReceiptTemplate()` is a 72 mm built-in (`builtin:classic-tax-receipt`) composed entirely of public editor layers: linked text, ordinary text, lines, Items/Tax summary tables and a linked QR code. Company/payment fields, two-line item columns/totals, discount/round-off, grand total, savings, tax rows, UPI caption/code and footers all use the same tools as user-created content. Savings uses explicit white text, black Background and padding; spacing uses four-sided margins, without legacy inverse flags, spacer elements or space-padded strings. TAX SUMMARY is a separate Text layer with ordinary colours/padding; its rules are Line layers. The tax table has explicit `defaultTaxTableColumns()` and shared table styling, without a hidden heading or fixed-width layout. The tax heading/table/rule use the normal available-data condition `receiptTaxGroups`; no taxable rows hides the block. UPI caption/code use the ordinary `receiptUpiPayment` condition. Built-in preview uses representative tax-inclusive items; actual bills retain their data and company tax mode. New receipt or the Tax preset applies this layout to an editable copy; normal tools, history, Save, PDF and thermal rendering handle subsequent changes.
- **Existing starter copies:** `utils/receipt-tool-template.ts` converts old receipt copies identified by the original `classic-0` company layer when opened in an editable workspace. It keeps design/layer IDs, names, custom styles and bindings; expands a legacy tax block into ordinary heading/rule layers plus a configured tax table, converts inverse text to explicit paint, converts old spacing layers to frames and replaces root flow gaps with explicit margins. Nested/fixed legacy tax blocks or designs without room under the 40-layer limit are left unchanged. Conversion is one undoable local draft step and never writes preferences until Save. Printing unopened saved designs keeps the legacy fallback. New starters are already tool-based and need no conversion.
- **Tax / No Tax editor presets:** Page setup presets replace the current receipt draft layout with Undo support. Tax restores the tool-based Tax Receipt. No Tax keeps its ordinary company/payment/footer layers, removes the tax table and associated heading/rules, and uses one table line: SL, DESCRIPTION, QTY, MRP, DISC, VALUE, with dashed rules and a TOTAL row. DISC uses computed monetary line discount (finite fallback zero); VALUE uses billed `tvalue`. This changes presentation only, not bill tax calculation. Layouts persist through existing template preferences; PDF and ESC/POS use the shared renderer.
- **Custom receipt starter layout:** New receipt first asks for Tax Receipt or No Tax Receipt, then copies `classicReceiptTemplate()` or `noTaxReceiptTemplate()` with a fresh custom ID and an editable name. Both open in the existing full-page editor and support the normal save, default selection, preview, undo/redo and duplication controls. Receipt layout changes remain presentation-only. The original base templates are unchanged by editing the copy; saved custom designs remain available in the library and the default selector.
- **Direct receipt canvas editing:** Receipt drags and numeric X/Y inputs update horizontal X and the signed top margin (-300 to 300 mm), retaining automatic flow as tables grow. Upward movement is clamped to the paper top. Switching flow/fixed placement preserves measured Y where the offset is within range; visible earlier sections supply the flow baseline. Gesture bounds are captured with the elements so repeated pointer events and multi-selection keep stable positions; cancel and Undo/Redo restore the complete move. Explicit margins persist as optional `margin`/`marginSides` in the existing version-1 preferences JSON; legacy gaps stay readable. Margin edits replace those legacy gaps, and later Y moves update only the top margin while retaining the other sides. Left/right and fixed top/bottom margins reserve space within the parent/paper bounds; the editor reduces oversized boxes to fit the new margins. Grouping uses exact renderer millimetres rather than rounded DOM pixel dimensions, absorbs child margins into the measured child positions and keeps outside receipt spacing on the frame. Nested groups account for parent rotation and flips; printer frames use their border box as the child origin, so a stored padding value on a frame does not shift grouping coordinates. Ungrouping uses exact raster geometry too. Moving uses stored dimensions and leaves child geometry unchanged; existing frames undersized by at most 0.5 mm can expand to contain their configured children when moved, while larger overflow remains invalid. The renderer includes transformed layer corners when measuring the receipt bottom, preventing rotated frames from being cropped. It retains the furthest flowing content edge when a later layer moves up, so earlier content is not cropped and appended invoice/voucher content follows it. The inspector also offers explicit fixed placement for any root receipt layer. Layers reorder sections; frame children use parent-relative X/Y. Growing item tables and tax summaries cannot be grouped or reparented through the UI; new table layers stay at the receipt root. Frames carry descendants, can resize together and can be ungrouped when their flow children do not overlap. The raster renderer resolves the same saved frame hierarchy and transforms for preview/PDF/thermal output. Optional version-1 JSON properties add frames/shapes, parents, names, locks, visibility, rotation, appearance and typography without database schema changes. Group, paste and reparent actions check the resulting subtree depth before mutation, keeping drafts valid at the eight-level boundary. Validation rejects cycles/non-frame parents, child boxes outside frames, duplicate IDs and nesting beyond eight levels; the 40-element limit includes frame children.
- **Editor audit:** `npm run test:designer-audit` runs local unit/API-fixture tests, ten Chromium editor/rendering browser suites and printer/quote type checks sequentially. `printer-interactions-browser.html` exercises transformed parent/group workflows and nesting boundaries; `designer-combinations-browser.html` uses deterministic pairwise coverage across text settings plus table/rotated-frame combinations. The runner writes JSON/HTML reports and per-suite logs under `artifacts/document-designer/` at the repository root. Browser runtime exceptions fail editor suites. It does not write live preferences, access a database or send physical print jobs. Coverage is finite; hardware quality/scanning and other browsers require separate verification.
- **Designer undo/redo:** `utils/designer-history.ts` keeps 50 local draft steps. Global editor listeners support Ctrl/Command-Z, Ctrl-Y/Command-Shift-Z and Ctrl/Command-S; inputs retain native undo/redo. Toolbar Undo/Redo buttons are removed. Pointer gestures are one transaction; cancellation restores the entire original element collection, including transformed frame children. Clipboard, duplicate, grouping, alignment, reordering and property changes use the same draft history. Numeric width/height changes switch to fixed sizing within the adapter's dimension transaction, so one Undo restores the previous resize mode and all child sizes. Successful Save and Discard reset history; changes require Save to persist.
- **Label and receipt editor workspace:** `pages/print-design/[kind]/[id].vue` mounts `PrintEditor.vue` through the manager. Save, Back, Download PDF and Test print are in the right inspector; Design and Page setup separate selection properties from paper/name/DPI/default/template controls. Desktop uses Layers / canvas / inspector; mobile stacks the preview and controls. Zoom/fit, Ctrl-wheel and Space/hand/middle-button panning change only the preview. `usePrintDesignDraft` retains settings, the saved snapshot, selection and originating settings route in company-keyed Nuxt state. Back/browser navigation preserve unsaved drafts; library Discard restores the saved snapshot; SPA drafts do not survive a browser reload. The loaded owner and originating route are captured before navigation so unmount cannot write another company's draft or overwrite Back's destination. Direct saved links reload scoped preferences; missing designs, denied roles and load failures expose Back/Retry without mounting the editor.
- **Standard label starter:** `originalLabelTemplate()` uses the editable Arial layout described above. Page setup > Start from a template > Standard label resets the selected draft with Undo support. `labelVariantSize` joins variant name and size; code uses the supplied variant code. The MRP strike action and sale-price Show action each use an All rule requiring both prices to have values, sale price >= 0, and sale price < MRP. Null, missing, invalid, equal or higher prices do not match; zero is valid. Fixed label positions retain space for hidden rows. Use Sample product or Preview data to select actual product data; discount-specific preview presets have been removed. The shared renderer evaluates the same declarative conditions for canvas, PDF and TSPL/CPCL bitmap output. No executable expressions are stored.
- **Label variables:** New and existing text/barcode/QR layers use the same **Content > Link to data** search and grouped field dropdown at the top of the inspector, with value preview and manual-text mode. The label catalog includes company/address, product/category/subcategory/brand/collection, variant/size, item, supplier/purchase and active custom fields from `GET /api/settings/label-variables`. `utils/label-variables.ts` owns the existing catalog/resolution; no executable expressions are saved. **Preview data** can search a real item by product or barcode via scoped `GET /api/bill/searchItems`, then read its authorized values via `POST /api/settings/label-variables`. Selected product/variant/size/custom fields drive the canvas; Use sample product restores the sample data; there are no synthetic discount/no-discount presets. PDF/test print use the displayed data, while the saved design contains bindings rather than sample values. Supplier values remain blank without the purchase link. Receipt fields use the same picker, and item-table columns separately link to billed/related row data. Existing flat-field designs remain supported.
- **Quote design workspace:** ERP quote and sales-order designs use their own authenticated full-page routes and share the editing workspace primitives above. Their A4 schema, DOM renderer and preference storage remain separate from printer templates and defaults. See `ARCH-pages-erp.md`, Quotes.
- **Company persistence:** `GET/PUT /api/settings/print-templates` uses existing `general_preferences` rows at page `printer`, key `templates`; the previous saved JSON is backed up to `templates-backup` within the save transaction. No schema changes or runtime DDL. Designs are fetched fresh for printing while online; a company-keyed local cache supports offline printing after an online load/save.
- **Label print alignment:** TSPL image jobs reset direction/mirroring, reference origin and X/Y shift before printing the complete untrimmed canvas. The design already contains its margins; no additional offset is added to layer coordinates. This isolates jobs from remembered TSPL placement settings. WebUSB and native Bluetooth share the same job preparation and preserve the selected design; rendering failures do not silently switch label layouts. Editor Test print uses the current draft explicitly, while regular product printing uses the saved default. Automated tests verify retained 2 mm left whitespace at 203/300 DPI and origin/shift resets; physical stock positioning/calibration still needs a device print to verify.
- **Output:** Preview, PDF and thermal output share `utils/print-template-renderer.client.ts`. Thermal receipts use ESC/POS raster bands; sheet receipts retain colour, split at row/section boundaries into real sheet-size PDF pages and use a system print dialog through `usePrint` (no thermal assignment required). Direct thermal byte preparation rejects sheet templates before fallback. Product labels use TSPL BITMAP or CPCL CG binary raster. Web uses assigned WebUSB printers; native mobile printing uses the selected Bluetooth printer; unsupported browsers, missing assignments and USB errors report actionable errors. Fixed receipt builders are available only when no receipt design is selected. Selected receipt and label designs fail visibly before transmission on rendering errors and never substitute another layout or device font. The fixed TSPL label builder remains only for an unset label default; CPCL requires a selected design. No job retries after a USB transmission failure. Courier labels remain carrier-generated PDFs.
- **Standard paper sizes:** Canvas and setup selectors offer receipt printable widths 48, 58, 72 and 80 mm plus A4, A5 and Letter sheets; label sizes remain 40x30, 50x25, 50x30, 50x38, 60x40, 80x50 and 100x150 mm. `utils/print-paper.ts` preserves fields and IDs while resizing geometry and records paperSize only for sheet receipts. Preview/PDF/output use saved dimensions.
- **Validation:** `npm run test:print-templates` runs focused TypeScript plus schema/raster, cache, receipt and printer-routing checks. `npm run test:print-template-browser` runs rendering, sheet-image, receipt audit and `printer-designer-browser.html` fixtures. The routed fixture covers both label/receipt pages, source changes and custom fields, real-product preview, prefix/suffix save and disconnect, grouped properties, visibility and collapsed flow spacing, placement/spacing, nested frames, movement/locks/cancellation/history, defaults/save failures, Back/discard/reopen, company isolation, denied access/retry, receipt table/flow/paper settings and preview/PDF/TSPL/CPCL parity. Rendering checks cover nested rotations/receipt growth and existing output pixels. These fixtures use the real-time Chromium runner; set `PRINT_TEST_BROWSER` for another installation. Printer Settings and Bluetooth settings fixtures retain their mocked device checks. Tests do not write to a database; physical output requires a printer test.
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
- A separate Client product references section uses `components/settings/CustomerProductNumbering.vue` and company-scoped `GET/PUT /api/settings/customer-product-numbering`. Explicit imports must retain the lowercase `settings` directory for Linux builds. It defaults to `PR-000001`, previews the next company number and saves the prefix without resetting its bigint counter or rewriting existing references. Admin/manager/accountant can edit; other authorized users can view. Prefixes normalize to uppercase, accept 1–16 letters/numbers/hyphens/underscores and omit the trailing separator. Errors retain input; branch edits retain the login company. Missing numbering installation shows a setup notice and disables changes. Financial-year resets affect bill numbering only. See `ARCH-after-sales.md` for migration and allocation behavior.
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
