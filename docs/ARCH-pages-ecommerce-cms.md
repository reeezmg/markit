# Ecommerce CMS pages

These are seller-facing Storetools pages under `pages/ecommerce-cms/`. They manage content, customers, integrations and campaigns for a company's customer storefront; they are not the public storefront pages. The page files below are the source of truth for what the UI currently exposes.

### `pages/ecommerce-cms/blogs.vue`

Blog management. Lists posts and opens a create/edit form with title, content, image and publication state. The editor supports image upload. It loads and creates posts through `/api/ecommerce-cms/blogs`, updates/deletes individual posts, and uploads images through `/api/upload`. Publishing is controlled by the saved status, not by visiting this page.

### `pages/ecommerce-cms/customers.vue`

Storefront customer CRM. Search and segment the customer list, open a customer detail view, and inspect orders, shopping data (including wishlist), feedback, notes and follow-up tasks. The page can save follow-ups and complete tasks. This is customer activity, distinct from the seller's staff list in `pages/users/`.

### `pages/ecommerce-cms/faq.vue`

FAQ content manager. Lists questions, answers, order and publication status; creates, edits and deletes entries through `/api/ecommerce-cms/faq`. Both question and answer are required before saving.

### `pages/ecommerce-cms/feedback.vue`

Storefront testimonial/feedback manager. Loads feedback and selectable clients, then lets staff create, edit, delete and order feedback with a customer name or linked client, title, message, rating and display status. Requires title/message and either a selected client or customer name. Uses `/api/ecommerce-cms/feedback` and `/api/ecommerce-cms/feedback/clients`.

### `pages/ecommerce-cms/gallery.vue`

Gallery manager for storefront photos and videos. Users may upload files or enter supported external image/YouTube links, set the name and display settings, edit entries and delete entries. The page validates media type, file size and URL before saving. It calls the gallery API and upload API; a gallery entry and an uploaded media file are separate concerns.

### `pages/ecommerce-cms/marketing.vue`

Campaign and automation dashboard. Loads segment counts, campaigns and delivery-job state from `/api/ecommerce-cms/marketing`. Staff can save campaign drafts, queue or cancel campaigns, and configure abandoned-cart and post-purchase automations. The eligible audience is based on confirmed marketing consent; the UI exposes segments such as all, new, repeat, inactive and cart. Queuing schedules delivery work; opening the page does not itself send a campaign.

### `pages/ecommerce-cms/messages.vue`

Contact-message inbox. Lists messages from customers, tracks their status, allows deletion, and offers email or WhatsApp reply shortcuts only when the message has the relevant contact detail. The reply buttons launch a reply path; changing inbox status is a separate API action via `/api/ecommerce-cms/messages`.

### `pages/ecommerce-cms/payment.vue`

Payment gateway connection settings. Shows provider-specific credential fields and webhook guidance for Razorpay, Cashfree, PhonePe, PayU and Paytm. Reads/writes the company `GeneralPreference` record with page name `ecomm_payment` and key `gateway_config`; tests credentials via `/api/ecommerce-cms/payment/test` before saving. Only one gateway is selected as active in this UI. Treat values entered here as secrets; the page does not establish that storage is encrypted.

### `pages/ecommerce-cms/policies.vue`

Storefront legal/policy content editor. Provides standard policy slots (refund, return, terms, privacy, cookies, shipping and cancellation) plus custom policies. Staff edit text and titles, then save the policy set. This controls storefront content, not legal compliance by itself.

### `pages/ecommerce-cms/reviews.vue`

Verified-purchase product-review list. Shows product, customer, rating, review text and photos from `/api/ecommerce-cms/reviews`; staff can delete reviews. The page says verified-purchase reviews publish automatically. There is no approve/edit action in this UI.

### `pages/ecommerce-cms/shipping.vue`

Shipping-provider connection settings. Reads/writes company `GeneralPreference` data (`ecomm_shipping` / `provider_config`), displays provider credential forms and connection order, tests supported providers via `/api/ecommerce-cms/shipping/test`, and allows save/disconnect. The first connected provider is treated as primary in the displayed priority chain. Provider-specific webhooks and test capability differ; a configured card alone does not prove live carrier connectivity.
