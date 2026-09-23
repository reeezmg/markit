# Ecommerce payment gateways

Markit's seller-facing gateway configuration is available at
`/ecommerce-cms/payment`. Storefront payment requests are implemented by the shared
`markit-custom-api`; the Markit page only manages each company's selected gateway and
credentials.

## Stored configuration

Gateway settings are stored as a company-scoped `GeneralPreference` with:

- `pageName`: `ecomm_payment`
- `key`: `gateway_config`
- `value.gateway`: the selected gateway
- `value.enabled`: whether online payment is active
- `value.<gateway>`: that gateway's credentials and environment

Saving credentials updates only that gateway's nested configuration. It does not
activate the gateway or erase any other saved gateway. A configured gateway can be
selected later with **Switch to this**; switching updates `value.gateway` and enables
online payments while retaining every saved configuration.

The storefront API reads the same preference using the `{company_id}` route boundary.
Its public `GET /payment/config` response must never contain a secret key.

## Cashfree setup

1. Open **Ecommerce CMS → Payment Gateway → Cashfree → Configure**.
2. Copy the App ID and Secret Key from Cashfree Dashboard → Developers → API Keys.
3. Choose **Test / Sandbox** for sandbox credentials or **Production** for live
   credentials. Credentials are environment-specific and cannot be mixed.
4. Select **Test Connection**. After it succeeds, select **Save Configuration**.
5. On the Cashfree card, select **Switch to this** when Cashfree should become active.
6. Copy the displayed webhook URL into Cashfree Dashboard → Developers → Webhooks and
   enable payment-success, payment-failed, and user-dropped events.

The webhook URL is company-specific:

```text
https://api.markit.co.in/api/custom/{company_id}/payment/webhook/cashfree
```

Cashfree uses the account's Secret Key to sign webhook callbacks; there is no separate
Cashfree webhook-secret field in Markit.

## Connection-test behavior

Markit's internal `POST /api/ecommerce-cms/payment/test` route validates Cashfree
credentials against the selected environment with Payments API version `2026-01-01`.
It calls the supported Get Order endpoint with a deliberately unknown synthetic order:

```text
GET {cashfree_base_url}/pg/orders/markit_check_<timestamp>
```

This check does not create an order or payment. Cashfree normally returns `404` because
the synthetic order does not exist; Markit treats that response as success because the
request reached the authenticated Get Order operation. Authentication and other API
errors remain failures and their Cashfree message is shown in the configuration modal.

Do not change this check back to `GET /pg/orders?limit=1`. Cashfree's current Payments
API does not provide that list operation and responds with `endpoint or method is not
valid` even when the credentials are correct.

## Runtime payment flow

For Cashfree, the browser-facing flow is:

1. The authenticated customer creates a server-priced payment intent.
2. `POST /payment/initiate` creates the Cashfree order and returns a
   `paymentSessionId` for Cashfree JS checkout.
3. The storefront opens Cashfree Checkout in the configured sandbox or production
   mode.
4. On return, the storefront calls `POST /payment/verify` with Cashfree's `orderId`.
5. The verified, single-use proof settles the payment intent and creates the paid
   ecommerce order.

The signed Cashfree webhook provides the recovery path when the buyer completes payment
but does not return to the storefront. The custom API verifies the raw-body signature,
company, pending payment intent, INR currency, and amount before recording and settling
the payment. Duplicate successful callbacks are idempotent.

The detailed browser API contract and required call ordering live in
`../../markit-custom-api/storefront_api_docs/API-checkout-payment.md`.

## Troubleshooting

| Message or symptom | Check |
|---|---|
| `endpoint or method is not valid` | Restart the Markit server so it uses the specific-order connection check described above. |
| Invalid credentials / authentication error | Confirm the App ID and Secret Key belong to the selected sandbox or production environment. |
| Connection succeeds but checkout fails | Confirm Cashfree has activated Payment Gateway access and the storefront domain is allowed in the Cashfree dashboard. |
| Payment succeeds but no order appears | Confirm the company-specific webhook URL is configured, its success event is enabled, and `markit-custom-api` is reachable. |
| Invalid webhook signature | Confirm the stored Secret Key matches the environment from which Cashfree sent the callback. |
