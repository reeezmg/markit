Seller shipment operations live here. This is a private FastAPI service under
`storetools/server`; the Nuxt `/api/ecommerce-cms/shipping/*` routes authenticate
the seller and forward to it. It is not the public ecommerce API.

Carrier implementations are separate files in `shipping/carriers/`. Delhivery's
implemented operations were copied intact. Undocumented operations for the
other carriers have explicit `501 Not Implemented` placeholders, so they cannot
be mistaken for successful shipment actions. Shared seller reads (serviceability
and tracking) are in `shipping/shared.py`; the public copies stay in custom-api.
The carrier webhook gateway is in `shipping/webhooks.py` at
`/api/seller/{company_id}/shipping/webhook/{provider}`. The public URL is
`https://markit.co.in/api/webhooks/shipping/{company_id}/{provider}?token=...`.
It checks the enabled carrier and its configured `webhookToken`, then forwards
to custom-api's token-protected internal webhook. Only custom-api writes the
order. Set `CUSTOM_API_URL` and the same `CUSTOM_API_SERVICE_TOKEN` on this
service and custom-api. Delhivery can use this path when a webhook token is
configured; other carriers still need implemented webhook verification/parsing.

From `storetools/server`, install `shipping_service/requirements.txt` and run:

```
python -m uvicorn shipping_service.app:app --port 8001
```

For a separate Vercel project, set its root directory to `storetools/server`;
the `vercel.json` and `requirements.txt` there package this service. Do not
deploy the Python service through the Nuxt project rooted at `storetools`.

Set `SHIPPING_SERVICE_URL` (default `http://localhost:8001`) and
`SHIPPING_SERVICE_TOKEN` for the Nuxt server and this service. During migration,
both also accept the existing `CUSTOM_API_SERVICE_TOKEN` setting. Deploy this
Python service separately from the Nuxt app; its source remains in storetools.

Rollout order: deploy this seller service first, set its database URL and token,
set `SHIPPING_SERVICE_URL` and the matching token on the Nuxt deployment, then
deploy the custom-api version that removes seller shipping routes. The public
ecommerce API keeps quotes and customer tracking. Carrier webhooks enter through
markit.co.in and reach custom-api only through its private internal endpoint.
