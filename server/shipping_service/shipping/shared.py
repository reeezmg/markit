"""Seller-facing copies of shipping reads also used by ecommerce sites."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb

from shipping_service.deps import db, require_service
from .carriers._registry import get_carrier
from . import _carriers, _common

router = APIRouter(dependencies=[Depends(require_service)])

@router.get("/{company_id}/shipping/serviceability")
def serviceability(company_id: str, pincode: str, conn=Depends(db)):
    cfg = _common._get_config(conn, company_id)
    provider, gw = _common._active_provider(cfg)

    adapter = get_carrier(provider)
    if adapter and "serviceability" in adapter.capabilities:
        return adapter.serviceability(gw, pincode)
    raise HTTPException(status_code=400, detail=f"Serviceability not supported for provider: {provider}")


@router.get("/{company_id}/shipping/track/{tracking_id}")
def track_shipment(
    company_id: str,
    tracking_id: str,
    provider_hint: Optional[str] = None,
    conn=Depends(db),
):
    cfg = _common._get_config(conn, company_id)
    provider = provider_hint or cfg.get("primary", "")
    providers = cfg.get("providers", {})
    gw = providers.get(provider, {})

    adapter = get_carrier(provider)
    if adapter and "track" in adapter.capabilities:
        return adapter.track(gw, tracking_id)

    if provider == "shiprocket":
        return _carriers._shiprocket_track(gw, tracking_id)
    elif provider == "ecomexpress":
        return _carriers._ecomexpress_track(gw, tracking_id)
    elif provider == "xpressbees":
        return _carriers._xpressbees_track(gw, tracking_id)
    elif provider == "shadowfax":
        return _carriers._shadowfax_track(gw, tracking_id)
    elif provider == "dtdc":
        return _carriers._dtdc_track(gw, tracking_id)
    elif provider == "pickrr":
        return _carriers._pickrr_track(gw, tracking_id)
    elif provider == "dunzo":
        return _carriers._dunzo_track(gw, tracking_id)
    elif provider == "ekart":
        return _carriers._ekart_track(gw, tracking_id)
    elif provider == "speedpost":
        return _carriers._speedpost_track(gw, tracking_id)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


@router.get("/{company_id}/shipping/track-bulk")
def track_bulk(
    company_id: str,
    waybills: str,
    provider_hint: Optional[str] = None,
    conn=Depends(db),
):
    cfg = _common._get_config(conn, company_id)
    provider = provider_hint or cfg.get("primary", "")
    gw = cfg.get("providers", {}).get(provider, {})
    adapter = get_carrier(provider)
    ids = [w.strip() for w in (waybills or "").split(",") if w.strip()][:50]
    if not adapter or "track" not in adapter.capabilities or not ids:
        return {"statuses": {}}
    try:
        statuses = adapter.track_bulk(gw, ids)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Bulk tracking failed: {exc}")
    synced = _sync_tracked_statuses(conn, company_id, statuses)
    return {"statuses": statuses, "synced": synced}


def _sync_tracked_statuses(conn, company_id: str, statuses: dict) -> int:
    """Write what the carrier reported onto the orders it belongs to.

    Two separate writes, because they follow different rules:

    * The carrier detail (raw status, NSL code, instructions, attempt count) is
      recorded ALWAYS. NSL codes are not fully published, so an unrecognised one
      still has to reach the seller — and it can change while the status stays
      put, which a status-gated write would miss entirely.
    * The status itself only moves under the same forward-or-retry rule as the
      webhook, so a late or duplicate poll cannot drag an order backwards.
    """
    updated = 0
    for awb, info in (statuses or {}).items():
        info = info or {}
        detail = {
            "rawStatus":    info.get("rawStatus"),
            "statusType":   info.get("statusType"),
            "nslCode":      info.get("nslCode"),
            "instructions": info.get("instructions"),
            "ndrAttempts":  info.get("ndrAttempts"),
            "at":           datetime.now(timezone.utc).isoformat(),
        }
        try:
            with conn.transaction():
                conn.execute(
                    """
                    UPDATE ecomm_orders
                    SET meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb, updated_at = now()
                    WHERE company_id = %s AND meta->>'awb' = %s
                    """,
                    [Jsonb({"carrier": detail}), company_id, str(awb)],
                )
        except Exception:
            pass

        status = info.get("status")
        if not status:
            continue                      # unmapped wording — leave the status alone
        try:
            with conn.transaction():
                row = conn.execute(
                    f"""
                    UPDATE ecomm_orders
                    SET status = %s,
                        meta = COALESCE(meta, '{{}}'::jsonb) || %s::jsonb,
                        updated_at = now()
                    WHERE company_id = %s
                      AND meta->>'awb' = %s
                      AND status NOT IN ('DELIVERED', 'CANCELLED')
                      AND {_common._forward_or_retry_sql()}
                    RETURNING id
                    """,
                    [status,
                     Jsonb({"shippingStatus": status, "shippingRawStatus": info.get("rawStatus")}),
                     company_id, str(awb),
                     *([status] * _common.FORWARD_OR_RETRY_PARAMS)],
                ).fetchone()
                if row:
                    updated += 1
                    _common._record_history(conn, company_id, row["id"], status, "track",
                                            raw_status=info.get("rawStatus"), awb=str(awb))
                    if status == "DELIVERED":
                        _common._settle_delivered_cod(conn, company_id, row["id"])
        except Exception:
            continue                      # never let bookkeeping break tracking
    return updated
