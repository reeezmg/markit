# Page shells and navigation

These Vue files are route parents. Each renders `<NuxtPage />` for its child route inside a titled dashboard panel. They do not themselves load or mutate the feature's data; consult the child page guide for actual behavior. The one exception is `pages/settings.vue`, which also renders the settings tabs.

| Parent file | Title / child area |
|---|---|
| `pages/accounts.vue` | Accounts / finance pages |
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

`pages/settings.vue` is the settings shell; its tabs are General, Store, Products, Printer, Numbering and Requests. `pages/blogs.vue` is the public blog route shell with its own navigation/layout and `<NuxtPage />`, not the seller's CMS blog editor. `pages/products.vue` and the other dashboard shells use auth page metadata; verify child authorization independently for new pages.
