"""Internal seller shipping API. Public ecommerce routes stay in custom-api."""

from fastapi import FastAPI

from shipping_service.shipping.ops import router as seller_router
from shipping_service.shipping.shared import router as shared_router
from shipping_service.shipping.webhooks import router as webhook_router

app = FastAPI(title="Markit Seller Shipping Service", docs_url=None, redoc_url=None)
app.include_router(seller_router, prefix="/api/seller")
app.include_router(shared_router, prefix="/api/seller")
app.include_router(webhook_router, prefix="/api/seller")


@app.get("/health")
def health():
    return {"ok": True}
