# Page shells and navigation

`layouts/default.vue` offers ERP, CRM, Storetools and Connect sections, narrowed by
the company's Settings → Sidebar choices and existing plan/role/workflow gates.
Connect is available only to administrators/managers when selected; its page is
`/connect/whatsapp`. `pages/connect.vue` owns the form company selector and remounts its
workspace when that company changes. `/connect` redirects to WhatsApp while
retaining query parameters. See `ARCH-connect-whatsapp.md` for onboarding and setup.

`pages/after-sales.vue` supplies the After-sales shell. When **Enable after-sales**
on Company & Branches is on (off by default), the ERP and Storefront menus both expose
Service workspace, Service items, Maintenance plans, Warranty plans and Guarantee plans.
While after-sales is off, direct workspace visits show a disabled notice without
mounting child pages. Related product/billing/invoice fields and service-history
links also follow the owning company's setting. Maintenance, warranty and guarantee
are configuration pages; due maintenance and service jobs live in the workspace.
Service items (`/after-sales/items`) owns reusable charges and links to shared product
creation/editing for service repair parts.
After-sales child pages now use the ERP Sales panel-content/card/table patterns and
navbar company controls. Its parent keys children by route path and `entryCompany`;
  customer product history opens visits/claims in a side panel. Client Actions → Service
  history opens `/after-sales/customers/:clientId` with the row's `entryCompany`; purchased
  product Actions → View opens the registered unit detail. See `ARCH-after-sales.md`.

ERP sidebar links include `/erp/recurring-invoices` and `/erp/retainer-invoices`.
These pages provide a single-company form toolbar and lock company selection while
editing, viewing a selected document or saving. See `ARCH-pages-erp.md` for workflows.

These Vue files are route parents. They normally render `<NuxtPage />` inside a titled dashboard panel. They do not themselves load or mutate the feature's data; consult the child page guide for actual behavior. `pages/settings.vue` also renders settings tabs. `pages/erp.vue` omits its navbar/dashboard wrapper for children with `documentDesigner` metadata: `/erp/quotes/design` and `/erp/sales-orders/design`. Those authenticated page files also set `layout: false` to fill the viewport without the application sidebar. The editor's Save and Back controls live in its right inspector; see `ARCH-pages-erp.md`. Label and receipt editors use the standalone authenticated `/print-design/:kind/:id` route with `layout: false`; Printer Settings and Sales Settings hand off company-scoped drafts and retain their return route. See `ARCH-pages-settings.md`, Printer.

| Parent file | Title / child area |
|---|---|
| `pages/accounts.vue` | Legacy Accounts read-only history with archive notice |
| `pages/accountant.vue` | Independent Accountant books, section navigation and company selector; child state remounts on company changes |
| `pages/loans.vue` | Separate Loans area with company selector, table, loan account and earlier-history routes; preserves admin/manager/accountant access |
| `pages/investments.vue` | Dedicated Investments area with company selector and overview, combined investors/ownership, capital, allocation, payout and settings routes; no nested Accountant sidebar |
| `pages/client.vue` | Client management |
| `pages/coupon.vue` | Coupons |
| `pages/dashboard.vue` | Dashboard |
| `pages/distributor.vue` | Distributor pages |
| `pages/erp.vue` | ERP and billing |
| `pages/marketing.vue` | Marketing children |
| `pages/offline.vue` | Offline children |
| `pages/order.vue` | Orders and fulfilment |
| `pages/products.vue` | Product catalog |
| `pages/reports.vue` | Reports |
| `pages/saleshistory.vue` | Bill history |
| `pages/users.vue` | Staff/users |
| `pages/ai.vue` | AI settings/usage |
| `pages/checkout.vue` | Checkout children; the current checkout child pages are stubs |

`pages/settings.vue` is the settings shell; its tabs are General, Store, Company & Branches (root companies only), Products, Account, Sidebar, Printer, Numbering and Requests. `pages/blogs.vue` is the public blog route shell with its own navigation/layout and `<NuxtPage />`, not the seller's CMS blog editor. `pages/products.vue` and the other dashboard shells use auth page metadata; verify child authorization independently for new pages.

ERP route shells use `ErpPageNavbar.vue`, whose right side hosts page company selectors while preserving the original title on the left. `CompanyTableFilter` and full-page `CompanyFormField toolbar` controls move there after hydration through `CompanyControlPlacement`; embedded forms and modal/slideover form fields keep their selectors inside the form or dialog. This changes placement only: table/report filtering, form ownership, record locks, transfers and the logged-in sidebar company retain their existing behavior. Repeated copies for the same purpose in mounted tabs display once. Notifications and statement processing use the same navbar.

The navbar also exposes `page-navbar-actions` after the company controls. Billing
teleports its Invoice / Pay now selector there after hydration, placing it at the
far right of the ERP title row on desktop and mobile. It is hidden when the owning
company's invoicing workflow is off, with Billing constrained to Pay now. The billing page owns the
selection and save lock; leaving billing removes the selector. Its company-local
localStorage preference survives navigation and draft operations (see `ARCH-pages-erp.md`).

Settings uses that same top-right position for its existing route-driven selector. Its tab links retain `entryCompany`; the Company & Branches link clears it. Offline stock adjustments key their child by route so selecting another company recreates its draft/form context. Legacy Accounts supplies a form company scope and recreates its read-only child when the selected company changes. These controls do not call the sidebar session switch.

`layouts/default.vue` displays ERP, CRM, Storetools (storefront tools) and Connect navigation from `utils/sidebar-menu.ts`. Settings → Sidebar selects sections/pages for the active company; both expanded and collapsed menus honor those choices, including custom Account navigation. See `ARCH-sidebar-navigation.md`. Existing workflow/role/plan gates still run first. Expense and
Investments and the separate Loans entry are inserted into both full and simplified ERP menus. The final ERP
filter removes Ecom, AI, Orders and Bookings; order operations appear under
Storefront. The full Orders group includes Orders, Pickup, Failed deliveries,
Requests, Returns and Exchange. Accountant's own navigation includes dedicated
Money and Ecommerce components, selected by `pages/accountant/[view].vue` before
the generic management component.

The sidebar group formerly labeled ERP is now **Sales** in both full and simplified
menus; its existing `/erp/*` URLs and shortcuts remain. `pages/erp.vue` uses the
Sales navbar title. The group includes Settings at `/erp/settings`, rendered by
`Sales/SettingsPage.vue`, with Accounts, Printer, Numbering and Sales preferences
tabs (`section` query). Tabs retain `entryCompany`; company changes use the existing
settings form scope and recreate the page through the ERP shell's company key.
Printer and Numbering reuse their existing settings editors. Preferences open the
existing invoice/Pay now and quote/sales-order drawers in the selected company.
The Sales menu is built by `utils/sales-workflow.ts` from the active company's
persisted **Enable invoicing workflow** setting. Both plan menu variants use the
same order: Quotes, Billing, Sales, Credit, Sales order, Recurring invoices,
Retainer invoices, Payments received, Settings. When disabled, only Billing,
Sales, Credit and Settings appear. The former Online child is outside this Sales
menu. Existing page URLs and their authorization remain unchanged.

ERP → Quotes links to the saved quotes table at `/erp/quotes` in both menu variants.
With invoicing enabled, both menus place Quotes before Billing in the Sales group.
Add quote opens `/erp/quotes/add`; quote numbers/Edit open
`/erp/quotes/edit/:quoteId`. The two editor routes share `Quotes/Editor.vue`, whose
Back to quotes link returns to the table. All links carry `entryCompany`. The quote
editor uses a form company scope and locks company selection for saved quotes;
create a new quote to choose another company. Dirty editor navigation prompts before
discarding, including returning to the table.

The Quotes table's Preference button opens a right drawer for company defaults and
approval/conversion policies. Share quote provides the signed public `/quote/:token`
page and a manual WhatsApp link; public quote routes have no seller layout/login.
Invoice drafts (`/erp/invoice-drafts`) is linked from Invoices and quote workflows;
it reviews quote-backed drafts before issuing a real invoice.

The ERP Sales link (`/erp/sales`) opens the unified All sales / Pay now / Invoices /
Unpaid / overdue table. Its tabs use the `view` query; old `/erp/invoices` links
redirect to `/erp/sales?view=invoices`, retaining company/search query values.
There is no separate Invoices sidebar item. Payments received (`/erp/payments`)
continues to use `Billing/InvoiceWorkspace.vue` under a table company scope.
New invoice from Sales' invoice views opens billing in Invoice mode and preserves
the selected company through `entryCompany`. Recurring/Retainer sidebar links remain.

ERP child links use the standard submenu dots without individual page icons; the
ERP parent retains its credit-card icon. The customer Accounts link is labeled
Credit and retains `/erp/accounts` and its existing shortcut.

`layouts/default.vue` inserts the Investments accordion into ERP navigation for
both full and simplified plan menus. Its children come from `utils/investments.ts`.
`/investments` redirects to Overview. `/accountant/investors` redirects to the new
investor directory. `/investments/ownership` also redirects there, preserving the
selected investor query; ownership has no separate sidebar entry. The old Accounts menu is labeled **Legacy Accounts** and labels its original page **Legacy
investments**. Investment pages retain admin/manager/accountant access and use the
company-scoped Accountant API. The `:investorId` detail parameter avoids the shared
CompanyScope `id`/Product lookup convention. Loans is a separate sidebar item beside Investments in the Account/finance area.
Its sidebar contains Loan accounts (`/loans`, table-only), Repayments
(`/loans/repayments`, due/upcoming unpaid instalments), Settings (`/loans/settings`,
shared account defaults), and Earlier history (`/loans/history`, unassigned movements).
Opening an account or repayment navigates to `/loans/:loanId`; due repayment links
open that loan's payment form. Its own parent shell keeps the
company selector, role check and company/route remount behavior. The Loans sidebar
link stays active on its child pages. Old `/investments/loans` index/detail/history
URLs redirect to their new counterparts, preserving query values including
entryCompany, investor and repay. Canonical list/detail/history, overview and
investor-statement links explicitly carry the current owner company across shells.
Loans is absent from investmentPages. Old `?loan=` links redirect to the dedicated
detail route. Saving a loan records it directly; there is no validation screen.

With invoicing enabled, Sales order follows Credit in both Sales menus. `/erp/sales-orders` opens
the shared-style saved-order table; Add and Edit use `/erp/sales-orders/add` and
`/erp/sales-orders/edit/:orderId`. Company query preservation, the preference drawer
and independent A4 designer follow Quotes. New quote/order editor drafts survive Back
and refresh through company/user/document-scoped local storage; successful save clears
the draft while preserving the selected status. Existing-document edits still warn
before discarding unsaved changes.
