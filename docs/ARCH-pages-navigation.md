# Page shells and navigation

These Vue files are route parents. Each renders `<NuxtPage />` for its child route inside a titled dashboard panel. They do not themselves load or mutate the feature's data; consult the child page guide for actual behavior. The one exception is `pages/settings.vue`, which also renders the settings tabs.

| Parent file | Title / child area |
|---|---|
| `pages/accounts.vue` | Legacy Accounts read-only history with archive notice |
| `pages/accountant.vue` | Independent Accountant books, section navigation and company selector; child state remounts on company changes |
| `pages/investments.vue` | Dedicated Investments area with company selector and overview, combined investors/ownership, capital/loan, allocation, payout and settings routes; no nested Accountant sidebar |
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

`pages/settings.vue` is the settings shell; its tabs are General, Store, Company & Branches (root companies only), Products, Account, Printer, Numbering and Requests. `pages/blogs.vue` is the public blog route shell with its own navigation/layout and `<NuxtPage />`, not the seller's CMS blog editor. `pages/products.vue` and the other dashboard shells use auth page metadata; verify child authorization independently for new pages.

`layouts/default.vue` separates ERP and Storefront navigation. Expense and
Investments are inserted into both full and simplified ERP menus. The final ERP
filter removes Ecom, AI, Orders and Bookings; order operations appear under
Storefront. The full Orders group includes Orders, Pickup, Failed deliveries,
Requests, Returns and Exchange. Accountant's own navigation includes dedicated
Money and Ecommerce components, selected by `pages/accountant/[view].vue` before
the generic management component.

`layouts/default.vue` inserts the Investments accordion into ERP navigation for
both full and simplified plan menus. Its children come from `utils/investments.ts`.
`/investments` redirects to Overview. `/accountant/investors` redirects to the new
investor directory. `/investments/ownership` also redirects there, preserving the
selected investor query; ownership has no separate sidebar entry. The old Accounts menu is labeled **Legacy Accounts** and labels its original page **Legacy
investments**. Investment pages retain admin/manager/accountant access and use the
company-scoped Accountant API. The `:investorId` detail parameter avoids the shared
CompanyScope `id`/Product lookup convention.
