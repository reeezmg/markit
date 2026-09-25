# How the shared database fits together

This guide explains records used by storefronts. For exact columns, defaults and
relations, use [DB-CATALOG.md](./DB-CATALOG.md). The schema source is
`storetools/schema.zmodel`.

## Company and people

`companies` identifies a store. Operational records commonly carry `company_id` to
identify their owner. `users` are seller staff; `company_users` associates a user with
a company and stores their role. `clients` are buyers; `company_clients` associates a
buyer with a company and holds company-specific state such as points. A buyer ID alone
does not establish access to a company's cart or order. Sources: `schema.zmodel`
models `Company`, `User`, `CompanyUser`, `Client`, `CompanyClient`.

## Products and stock

`products` holds the product identity and category, collection and brand links.
`variants` holds each sellable presentation and its prices. `items` holds the option
value and stock quantity. `Variant.sizeLabel` names the option, such as Size or Shade;
`Item.size` stores its value, such as M or Red. A product-detail API path takes a
variant ID. Checkout needs both the `variantId` and the stock-bearing `itemId`, and
rechecks stock at order creation. Sources: `schema.zmodel` models `Product`, `Variant`,
`Item`; `ecommerce-api/api/app/routes/products.py`, `checkout.py`.

## Cart, payment and order

`ecomm_carts` stores one JSON cart for a company/client pair; it does not reserve
stock. COD and zero-total checkout creates `ecomm_checkouts`, `ecomm_orders`, a bill,
entries and first status event, then decrements stock in one transaction. Positive-
total online checkout first creates `ecomm_payment_intents` with a server-computed
total and saved request. After gateway verification, `ecomm_payment_verifications`
holds one-use proof. Settlement consumes that proof and creates the actual order.
`EcommPaymentIntent` mirrors the API-created `ecomm_payment_intents` table in
`schema.zmodel`; the trusted ecommerce API creates and updates payment attempts.
Sources: `schema.zmodel` and `ecommerce-api/api/app/routes/checkout.py`,
`payment.py`, `tables.py`.

`ecomm_orders.items` is a purchase-time snapshot. `ecomm_order_status_history` records
status events. `ecomm_order_requests` holds cancellation, return and exchange requests.
`ecomm_product_reviews` holds reviews of delivered purchased items. Sources:
`schema.zmodel` and `ecommerce-api/api/app/routes/orders.py`, `reviews.py`.

## Content

`ecomm_faqs`, `ecomm_blogs`, `ecomm_feedback` and `ecomm_gallery` supply storefront
content. `storefront_pages` holds page configuration. `ecomm_contact_messages` holds
submitted enquiries. `ecomm_wishlists` holds selected variant IDs and display
snapshots. The public API filters company content; seller editing lives in Storetools.
Sources: `schema.zmodel` and the API `pages.py`, `blogs.py`, `gallery.py`,
`contact.py`, `wishlist.py` route modules.

## Reading the catalog

`@map` names the physical PostgreSQL column or table. `@@unique` and `@@index`
describe constraints and indexes. Relation `fields` and `references` show declared
foreign keys. `Base` is abstract and has no physical table. Model and field
explanations come from `dbExplanations.json`, while code-reference paths come from a
direct source search. Check the owning workflow before changing a field's behavior.
