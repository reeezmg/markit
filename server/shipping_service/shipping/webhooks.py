"""Carrier-facing webhook gateway; custom-api owns the single order write."""

import hmac
import os

import httpx
from fastapi import APIRouter, Body, Depends, Header, HTTPException

from shipping_service.deps import clean_env_value, db
from . import _common
from .carriers._registry import get_carrier

router = APIRouter()


@router.post("/{company_id}/shipping/webhook/{provider}")
def shipping_webhook(
    company_id: str,
    provider: str,
    payload: dict = Body(...),
    x_carrier_webhook_token: str | None = Header(default=None),
    conn=Depends(db),
):
    """Validate the seller's webhook secret and forward one event to custom-api."""
    adapter = get_carrier(provider)
    if not adapter or not callable(getattr(adapter, "verify_webhook", None)):
        raise HTTPException(status_code=404, detail=f"Webhooks not supported for provider: {provider}")

    cfg = _common._get_config(conn, company_id)
    gw = cfg.get("providers", {}).get(provider, {})
    if not gw.get("enabled"):
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' is not connected")
    secret = clean_env_value(gw.get("webhookToken", ""))
    if not secret:
        raise HTTPException(status_code=503, detail="Carrier webhook token is not configured")
    supplied = x_carrier_webhook_token or payload.get("token") or ""
    if not isinstance(supplied, str) or not hmac.compare_digest(supplied, secret):
        raise HTTPException(status_code=401, detail="Webhook verification failed")
    if not adapter.verify_webhook(gw, {**payload, "token": supplied}):
        raise HTTPException(status_code=401, detail="Webhook verification failed")

    base = clean_env_value(os.getenv("CUSTOM_API_URL", "")).rstrip("/")
    token = clean_env_value(os.getenv("CUSTOM_API_SERVICE_TOKEN", ""))
    if not base or not token:
        raise HTTPException(status_code=503, detail="Internal ecommerce webhook is not configured")
    api_base = base if base.endswith("/api") else f"{base}/api"
    url = f"{api_base}/custom/{company_id}/shipping/internal/webhook/{provider}"
    try:
        response = httpx.post(url, json=payload, headers={"X-Service-Token": token}, timeout=15)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Internal ecommerce webhook is unavailable") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Internal ecommerce webhook rejected the event")
    return response.json()
