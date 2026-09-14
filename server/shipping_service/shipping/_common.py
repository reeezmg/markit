"""
Shared shipping internals: per-company carrier config, provider selection,
status bookkeeping and the request models.

Imported by every shipping route module. Route modules call these through the
module object (`_common.helper(...)`) so a test can monkeypatch one helper and
have every caller pick it up.
"""

import json
import uuid

import httpx
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel
from typing import Optional

from .carriers._registry import get_carrier
from shipping_service.utils import money


def _item_display_name(item: dict) -> str:
    base = item.get("name") or item.get("variantName") or "Item"
    options = [
        f"{item.get('sizeLabel') or 'Size'}: {item.get('size')}" if item.get("size") else "",
        f"Shade: {item.get('shade')}" if item.get("shade") else "",
    ]
    descriptor = " · ".join(value for value in options if value)
    return f"{base} ({descriptor})" if descriptor else base


def _get_config(conn, company_id: str) -> dict:
    row = conn.execute(
        """
        SELECT preference_value FROM general_preferences
        WHERE company_id = %s AND page_name = 'ecomm_shipping' AND preference_key = 'provider_config'
        LIMIT 1
        """,
        [company_id],
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Shipping not configured")
    cfg = row["preference_value"] if isinstance(row["preference_value"], dict) else json.loads(row["preference_value"])
    return cfg


def _active_provider(cfg: dict) -> tuple[str, dict]:
    primary = cfg.get("primary", "")
    if not primary:
        raise HTTPException(status_code=400, detail="No primary shipping provider set")
    providers = cfg.get("providers", {})
    gw = providers.get(primary, {})
    if not gw.get("enabled"):
        raise HTTPException(status_code=400, detail=f"Provider '{primary}' is not connected")
    return primary, gw


def _ordered_providers(cfg: dict) -> list[tuple[str, dict]]:
    """Enabled providers in fallback priority order.

    Uses cfg['priority'] (an ordered list of provider ids) when present, else
    falls back to [primary]. Any enabled provider missing from the list is
    appended at the end so it is never silently dropped.
    """
    providers = cfg.get("providers", {})
    order = [p for p in (cfg.get("priority") or []) if p]
    if not order and cfg.get("primary"):
        order = [cfg["primary"]]
    for pid in providers:
        if pid not in order:
            order.append(pid)
    return [(pid, providers.get(pid, {})) for pid in order if providers.get(pid, {}).get("enabled")]


def _origin_pincode(conn, company_id: str) -> str:
    """Resolve the shipping origin pincode for rate calls.

    Prefer the seller's default registered pickup location; fall back to the
    company's own address pincode so a rate can still be priced even when no
    pickup location is configured yet. Empty string if neither exists.
    """
    row = conn.execute(
        """
        SELECT pincode FROM ecomm_pickup_locations
        WHERE company_id = %s AND active = true
        ORDER BY is_default DESC, created_at ASC
        LIMIT 1
        """,
        [company_id],
    ).fetchone()
    pin = (row or {}).get("pincode")
    if pin:
        return str(pin)
    row = conn.execute(
        "SELECT pincode FROM addresses WHERE company_id = %s LIMIT 1",
        [company_id],
    ).fetchone()
    return str((row or {}).get("pincode") or "")


def _extract_fee(rates_result: dict):
    """Pull a single delivery fee out of a carrier rate response (best-effort)."""
    rates = rates_result.get("rates")
    first = rates[0] if isinstance(rates, list) and rates else rates
    if isinstance(first, dict):
        for key in ("total_amount", "charge_DL", "gross_amount", "amount"):
            if first.get(key) is not None:
                return money(first[key])
    return None


def _rank_case(expr: str) -> str:
    """Build a SQL CASE that maps a status column/param to its rank."""
    whens = " ".join(f"WHEN '{k}' THEN {v}" for k, v in STATUS_RANK.items())
    return f"(CASE {expr} {whens} ELSE 0 END)"


# The journey is not strictly one-way. After a failed delivery attempt the
# carrier puts the parcel back out for delivery, which is a LOWER rank — a plain
# monotonic guard would reject it and leave the order stuck on "Undelivered"
# until it was either delivered or returned. These are the moves back down the
# ladder that are legitimate.
STATUS_RETRIES = {
    "UNDELIVERED": {"OUT_FOR_DELIVERY", "SHIPPED"},
    "NOT_PICKED":  {"MANIFESTED"},          # re-manifested for another pickup
}


def _forward_or_retry_sql(status_param: str = "%s") -> str:
    """SQL predicate: the new status moves the order forward, or is one of the
    permitted retry moves. Both branches read the same status parameter, so the
    caller must pass it once per placeholder this returns (see the count below).
    """
    retries = " OR ".join(
        "(status = '{}' AND {} IN ({}))".format(
            frm, status_param, ", ".join(f"'{t}'" for t in sorted(targets)))
        for frm, targets in STATUS_RETRIES.items()
    )
    return f"({_rank_case('status')} < {_rank_case(status_param)} OR {retries})"


#: How many status parameters _forward_or_retry_sql() expects, in order.
FORWARD_OR_RETRY_PARAMS = 1 + len(STATUS_RETRIES)


def _record_history(conn, company_id: str, order_id: str, status: str, source: str,
                    raw_status: str | None = None, note: str | None = None, awb: str | None = None) -> None:
    """Append a row to ecomm_order_status_history (one per status change)."""
    conn.execute(
        """
        INSERT INTO ecomm_order_status_history (id, company_id, order_id, status, raw_status, source, note, awb)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [str(uuid.uuid4()), company_id, order_id, status, raw_status, source, note, awb],
    )


def _settle_delivered_cod(conn, company_id: str, order_id: str) -> None:
    """Mark a delivered COD order and its linked checkout/bill paid atomically.

    The caller must already be in the status-change transaction. Non-COD and
    non-delivered orders are ignored, and only pending payment rows are changed.
    """
    row = conn.execute(
        """SELECT checkout_id, bill_id FROM ecomm_orders
           WHERE id = %s AND company_id = %s AND status = 'DELIVERED'
             AND UPPER(COALESCE(payment_method, '')) = 'COD'
           FOR UPDATE""",
        [order_id, company_id],
    ).fetchone()
    if not row:
        return
    conn.execute(
        """UPDATE ecomm_orders SET payment_status = 'PAID', updated_at = now()
           WHERE id = %s AND company_id = %s AND payment_status = 'PENDING'""",
        [order_id, company_id],
    )
    if row.get("checkout_id"):
        conn.execute(
            """UPDATE ecomm_checkouts
               SET payment_status = 'PAID', status = 'PAID', updated_at = now()
               WHERE id = %s AND company_id = %s
                 AND UPPER(COALESCE(payment_method, '')) = 'COD'
                 AND payment_status = 'PENDING'""",
            [row["checkout_id"], company_id],
        )
    if row.get("bill_id"):
        conn.execute(
            """UPDATE bills SET payment_status = 'PAID', updated_at = now()
               WHERE id = %s AND company_id = %s
                 AND UPPER(COALESCE(payment_method, '')) = 'COD'
                 AND payment_status = 'PENDING'""",
            [row["bill_id"], company_id],
        )


def _persist_shipment(conn, company_id: str, body: "CreateShipmentRequest",
                      provider: str, result: dict) -> None:
    """
    Record the carrier's AWB on the order — WITHOUT changing its status.

    The AWB is written to ecomm_orders.meta->>'awb' so the shipping webhook and
    the bulk-track endpoint can locate the order from a carrier status push. The
    order's status is left untouched: it is driven purely by the carrier (track
    API / webhook), so a freshly manifested order stays PLACED until Delhivery
    reports actual movement. storetools reads this same row via ZenStack.
    """
    awb = result.get("awb") or result.get("trackingId") or result.get("shipmentId")
    if not awb:
        return
    meta = {
        "awb": str(awb),
        "shipping": {
            "provider":   provider,
            "awb":        str(awb),
            "trackingId": str(result.get("trackingId") or awb),
            "status":     result.get("status"),
            "location":   getattr(body, "pickupLocation", None),
        },
    }
    with conn.transaction():
        conn.execute(
            """
            UPDATE ecomm_orders
            SET meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb,
                updated_at = now()
            WHERE company_id = %s AND (id = %s OR order_number::text = %s)
            """,
            [Jsonb(meta), company_id, body.orderId, str(body.orderNumber)],
        )


def _get_shiprocket_token(gw: dict) -> str:
    resp = httpx.post(
        "https://apiv2.shiprocket.in/v1/external/auth/login",
        json={"email": gw.get("email", ""), "password": gw.get("password", "")},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("token", "")


class RatesRequest(BaseModel):
    pickupPincode: str
    deliveryPincode: str
    weight: float = 0.5        # kg
    length: float = 10.0       # cm
    width:  float = 10.0
    height: float = 10.0
    codAmount: float = 0.0
    orderId: Optional[str] = None


class CreateShipmentRequest(BaseModel):
    orderId: str
    orderNumber: str
    customerName: str
    customerPhone: str
    customerEmail: Optional[str] = ""
    deliveryAddress: str
    deliveryCity: str
    deliveryState: str
    deliveryPincode: str
    deliveryCountry: str = "India"
    pickupPincode: Optional[str] = None
    items: list[dict]
    weight: float = 0.5
    length: float = 10.0
    width:  float = 10.0
    height: float = 10.0
    paymentMethod: str = "Prepaid"
    codAmount: float = 0.0
    totalAmount: float = 0.0
    pickupLocation: Optional[str] = None      # registered warehouse name to ship from


class CancelShipmentRequest(BaseModel):
    awb: Optional[str] = None
    shipmentId: Optional[str] = None
    orderId: Optional[str] = None


class UpdateShipmentRequest(BaseModel):
    """Fields Delhivery's edit API actually accepts.

    Pincode is NOT editable — the carrier ignores it, so it is deliberately not
    offered here; a wrong pincode means cancelling and recreating the shipment.
    Weight is in kg on our side and converted to grams (`gm`) by the adapter.
    """
    awb: str
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    productsDesc: Optional[str] = None
    weight: Optional[float] = None             # kg
    length: Optional[float] = None             # cm
    width: Optional[float] = None
    height: Optional[float] = None
    paymentMode: Optional[str] = None          # "COD" / "Pre-paid"
    codAmount: Optional[float] = None           # required when switching to COD


class PickupRequest(BaseModel):
    pickupLocation: str
    pickupDate: str                            # YYYY-MM-DD
    pickupTime: str = "12:00:00"               # HH:MM:SS
    expectedPackageCount: int = 1
    provider: Optional[str] = None             # carrier to call; defaults to primary


class ReverseShipmentRequest(BaseModel):
    requestId: str                             # ecomm_order_requests.id (approved return)
    weight: Optional[float] = None             # grams override; defaults from the forward shipment


class NdrActionRequest(BaseModel):
    awb: str
    action: str                                # carrier action code: RE-ATTEMPT / PICKUP_RESCHEDULE
    remarks: Optional[str] = None
    # Corrected delivery details (unused by Delhivery — its NDR API takes only
    # waybill+act — kept for carriers whose NDR flow accepts an address fix).
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    pincode: Optional[str] = None
    extra: Optional[dict] = None


def _require_capability(conn, company_id: str, capability: str):
    cfg = _get_config(conn, company_id)
    provider, gw = _active_provider(cfg)
    adapter = get_carrier(provider)
    if not adapter or capability not in adapter.capabilities:
        raise HTTPException(status_code=400, detail=f"{capability.capitalize()} not supported for provider: {provider}")
    return provider, gw, adapter


def _label_size(conn, company_id: str) -> str:
    row = conn.execute(
        """SELECT preference_value FROM general_preferences
           WHERE company_id = %s AND page_name = 'ecomm_shipping' AND preference_key = 'label_size'
           LIMIT 1""",
        [company_id],
    ).fetchone()
    if not row:
        return "A4"
    v = row["preference_value"]
    val = v if isinstance(v, str) else (v.get("size") if isinstance(v, dict) else None)
    return val if val in ("A4", "4R") else "A4"


def _persist_label(conn, company_id: str, awb: str, url: str) -> None:
    with conn.transaction():
        conn.execute(
            """
            UPDATE ecomm_orders
            SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{shipping,labelUrl}', %s::jsonb, true),
                updated_at = now()
            WHERE company_id = %s AND meta->>'awb' = %s
            """,
            [Jsonb(url), company_id, str(awb)],
        )


# ---------------------------------------------------------------------------
# Carrier base URLs
# ---------------------------------------------------------------------------
URLS = {
    "shiprocket": {
        "PROD": "https://apiv2.shiprocket.in/v1/external",
    },
    "ecomexpress": {
        "PROD": "https://clbeta.ecomexpress.in",
        "TEST": "https://clbeta.ecomexpress.in",
    },
    "xpressbees": {
        "PROD": "https://ship.xpressbees.com",
    },
    "shadowfax": {
        "PROD": "https://logistics.shadowfax.in/api/v1",
    },
    "dtdc": {
        "PROD": "https://dtdcapi.dtdc.com/dtdc/ext",
        "TEST": "https://dtdcapi.dtdc.com/dtdc/ext",
    },
    "pickrr": {
        "PROD": "https://pickrr.com/api-v5",
    },
    "dunzo": {
        "PROD": "https://api.dunzo.com/api/v1",
        "TEST": "https://staging.dunzo.com/api/v1",
    },
    "ekart": {
        "PROD": "https://api.ekartlogistics.com/v1",
    },
    "speedpost": {
        "PROD": "https://trackingapi.indiapost.gov.in/api/v1",
    },
}


# Canonical order-status lifecycle. Higher rank = further along; status only ever
# advances (never regresses). CANCELLED is terminal/high so it can always apply.
# How far along the journey each status is. The webhook only moves an order
# forward (rank must increase), so an out-of-order carrier push cannot drag a
# delivered parcel back to "in transit".
#
# Every status the adapters can emit MUST appear here: _rank_case falls back to
# 0 for anything unlisted, and a rank of 0 can never beat the order's current
# rank — so a missing entry means that status silently never persists.
STATUS_RANK = {
    # Seller side, before a carrier is involved
    "PLACED": 0,
    "PACKED": 1,
    # Forward leg
    "MANIFESTED": 2,
    "NOT_PICKED": 3,
    "PICKED": 4,
    "SHIPPED": 5,
    "OUT_FOR_DELIVERY": 6,
    "UNDELIVERED": 7,
    # Return to origin
    "RTO": 8,
    "RTO_DELIVERED": 9,
    # Terminal success
    "DELIVERED": 10,
    # Reverse pickup (customer returning goods)
    "PICKUP_SCHEDULED": 11,
    "OUT_FOR_PICKUP": 12,
    "RETURNING": 13,
    "RETURNED": 14,
    "CANCELLED": 99,
}
