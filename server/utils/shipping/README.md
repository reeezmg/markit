# Seller shipping in Nuxt

Seller shipping executes in the Storetools Nuxt server. Deploy the usual
`storetools` Vercel project; there is no Python process, localhost port or
separate shipping deployment to configure.

The existing `/api/ecommerce-cms/shipping/*` routes call `runShippingOperation`
or `runShippingBinary` in `index.ts`. Authentication and authorized company
selection happen before opening the database connection. `service.ts` owns
company-scoped SQL, transactions and operation dispatch. `cartonization.ts`
resolves item/product dimensions and selects boxes. `delhivery.ts` owns the
Delhivery HTTP contracts; `legacy-carriers.ts` preserves the previous limited
transports for other carriers without advertising unsupported capabilities.
Carrier requests use native fetch with timeouts and no automatic mutation retries.

Pickup creation is warehouse-level, with an expected parcel count; its public
contract does not provide an allocated-slot lookup or attach individual AWBs to
an existing pickup. `pickup/raise` retains the original response and the requested
date/time separately. Markit's pickup history exposes a manually recorded carrier
slot and explicitly labels the local handover list. `pickup/add` updates only
that local list; `pickup/schedule` records a slot copied from Delhivery One.
Neither operation claims to update Delhivery One's order list or reschedule the
carrier. The prepared `20261115160000_pickup_requested_schedule` migration must
be applied with separate authorization before creation/slot recording can use
the new columns; creation checks this before contacting the carrier.

## Configuration

- Use Storetools' existing `DATABASE_URL` and seller-session configuration.
- Carrier credentials, default provider, priority, label size and waybill pool
  remain in the existing company shipping preferences. Pickup locations and
  shipping boxes retain their existing tables. No schema change is needed.
- `SHIPPING_SERVICE_URL` and `SHIPPING_SERVICE_TOKEN` are no longer consumed.
- The public `/api/webhooks/shipping/{companyId}/{provider}` callback verifies
  the enabled carrier's configured `webhookToken` using constant-time comparison.
  Delhivery is the implemented webhook provider. The callback accepts the token
  in the query, `X-Carrier-Webhook-Token` header, or payload. Verified events are
  sent to `{CUSTOM_API_URL}/api/custom/{companyId}/shipping/internal/webhook/{provider}`
  with `CUSTOM_API_SERVICE_TOKEN`. A base URL already ending in `/api` is supported.
  The customer ecommerce API remains the single webhook event writer.

## Behavior

Previews read data only. Create uses the same dimension resolution and box
selection, and rejects missing phone/pincode/pickup, unresolved dimensions,
terminal or already-shipped orders, and missing e-waybill numbers above the
existing threshold. Order creation uses a transaction advisory lock to serialize
duplicate requests. Multi-piece creation uses pooled master/child AWBs and one
COD collection amount. Successful manifests retain order status until tracking
reports movement. Carrier errors, including HTTP-200 body rejections, surface
as failures rather than successful shipment actions.

Tracking preserves terminal orders and allowed retry transitions, appends status
history and settles pending delivered COD records. Delivery activation uses
the first delivery-history day in Asia/Kolkata and retains an existing activation.
Cancellation archives the previous AWB and releases the order to PACKED only
after carrier acceptance. Return/exchange shipments require approved requests
and a registered warehouse. Seller tracking/edit/label/NDR calls verify company
ownership of their AWBs. Expired PDF URLs are regenerated; ZIP downloads include
an errors file when some labels fail.

## Validation

Run from `storetools`:

```powershell
node --import tsx --test tests/shipping.test.ts
$env:SHIPPING_READONLY_CHECK='1'
node --import tsx --test tests/shipping.readonly.test.ts
```

Regression tests mock carrier and database writes. The optional real-database
check uses `BEGIN READ ONLY` and validates single/bulk previews without any
carrier HTTP requests. Neither test creates or alters schemas. Shipment creation,
cancellation, pickups and other real carrier mutations require seller actions;
tests never send them to a live carrier.

The legacy Python shipping implementation and its dedicated deployment files
have been removed. Seller shipping uses the Nuxt TypeScript implementation above.
