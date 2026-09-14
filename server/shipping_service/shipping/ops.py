"""
Seller-facing shipping operations — every route requires the service token and
is proxied by storetools server-side, never called from a browser.

Manifesting, labels, pickups, NDR handling, reverse/exchange pickups and pickup
location registration.
"""

import io
import json
import uuid
import zipfile
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Response
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from shipping_service.deps import db, require_service
from .carriers._registry import get_carrier
from shipping_service.cartonization import pick_boxes, resolve_order_lines
from shipping_service.utils import money

from . import _carriers, _common

router = APIRouter()


@router.get("/{company_id}/shipping/providers")
def list_providers(company_id: str, conn=Depends(db), _svc: bool = Depends(require_service)):
    cfg = _common._get_config(conn, company_id)
    primary = cfg.get("primary", "")
    priority = [p for p in (cfg.get("priority") or []) if p] or ([primary] if primary else [])
    out = []
    for pid, gw in _common._ordered_providers(cfg):
        adapter = get_carrier(pid)
        caps = sorted(adapter.capabilities) if adapter else []
        out.append({
            "id":             pid,
            "label":          getattr(adapter, "label", pid) if adapter else pid,
            "capabilities":   caps,
            "supportsPickup": "pickup" in caps,
            "isPrimary":      pid == primary,
        })
    return {"providers": out, "priority": priority, "primary": primary}


@router.post("/{company_id}/shipping/create")
def create_shipment(
    company_id: str,
    body: _common.CreateShipmentRequest,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    cfg = _common._get_config(conn, company_id)
    provider, gw = _common._active_provider(cfg)
    pickup_pincode = body.pickupPincode or gw.get("pickupPincode", "")

    adapter = get_carrier(provider)
    if adapter and "create" in adapter.capabilities:
        result = adapter.create_shipment(gw, body, pickup_pincode)
        _common._persist_shipment(conn, company_id, body, provider, result)
        return result

    if provider == "shiprocket":
        return _carriers._shiprocket_create(gw, body, pickup_pincode)
    elif provider == "ecomexpress":
        return _carriers._ecomexpress_create(gw, body, pickup_pincode)
    elif provider == "xpressbees":
        return _carriers._xpressbees_create(gw, body)
    elif provider == "shadowfax":
        return _carriers._shadowfax_create(gw, body)
    elif provider == "dtdc":
        return _carriers._dtdc_create(gw, body)
    elif provider == "pickrr":
        return _carriers._pickrr_create(gw, body)
    elif provider == "dunzo":
        return _carriers._dunzo_create(gw, body)
    elif provider == "ekart":
        return _carriers._ekart_create(gw, body)
    elif provider == "speedpost":
        raise HTTPException(status_code=400, detail="SpeedPost does not support programmatic shipment creation. Use their portal.")
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


class _BulkBody:
    """Attribute view the adapters expect, built from an ecomm_orders row."""
    def __init__(self, order: dict, addr: dict, pickup_name: str, total_weight: float,
                 seller: Optional[dict] = None):
        self.orderId       = order["id"]
        self.orderNumber   = str(order.get("orderNumber") or order["id"])
        self.customerName  = (f"{addr.get('firstName','')} {addr.get('lastName','')}".strip()) or "Customer"
        self.customerPhone = addr.get("phoneNo") or addr.get("phone") or ""
        self.customerEmail = ""
        self.deliveryAddress = (addr.get("formattedAddress")
                                or ", ".join(p for p in [addr.get("street"), addr.get("locality"),
                                                          addr.get("landmark")] if p))
        self.deliveryCity    = addr.get("city") or ""
        self.deliveryState   = addr.get("state") or ""
        self.deliveryPincode = str(addr.get("pincode") or "")
        self.deliveryCountry = addr.get("country") or "India"
        self.items           = order.get("items") or []
        self.weight          = total_weight
        self.paymentMethod   = "COD" if str(order.get("paymentMethod", "")).upper() == "COD" else "Prepaid"
        self.totalAmount     = money(order.get("grandTotal"))
        self.codAmount       = self.totalAmount if self.paymentMethod == "COD" else 0
        self.pickupPincode   = None
        self.pickupLocation  = pickup_name
        self.length = self.width = self.height = 10.0
        # What the carrier prints on the label's Product line. Without it
        # Delhivery falls back to the client code ("8e7348-...-do package"),
        # which tells the packer and the courier nothing.
        seller = seller or {}
        self.sellerName    = seller.get("name") or ""
        self.sellerAddress = seller.get("address") or ""
        self.productsDesc = ", ".join(
            str(i.get("name") or i.get("variantName") or "").strip()
            for i in self.items if (i.get("name") or i.get("variantName"))
        )[:200] or "Merchandise"
        # Rs 50,000+ consignments need an e-way bill; both are optional below that.
        meta = order.get("meta") or {}
        self.ewaybillNumber  = (meta.get("shipping") or {}).get("ewbn") or meta.get("ewbn")
        self.hsnCode         = order.get("hsnCode")


def _seller_info(conn, company_id: str) -> dict:
    """Trading name + address to print in the label's Seller block.

    Without a seller_name Delhivery falls back to the raw client code
    ("8e7348-TheHijabCart-do"), which means nothing to a courier or a customer.
    The company's own name is the one buyers recognise; the default pickup
    location supplies the address.
    """
    row = conn.execute("SELECT name FROM companies WHERE id = %s LIMIT 1", [company_id]).fetchone()
    name = ((row or {}).get("name") or "").strip()
    loc = conn.execute(
        """SELECT address, city, state, pincode FROM ecomm_pickup_locations
           WHERE company_id = %s AND active = true
           ORDER BY is_default DESC, created_at ASC LIMIT 1""",
        [company_id],
    ).fetchone() or {}
    address = ", ".join(str(p).strip() for p in
                        [loc.get("address"), loc.get("city"), loc.get("state"), loc.get("pincode")]
                        if p)
    return {"name": name, "address": address}


def _default_pickup_name(conn, company_id: str) -> str:
    for extra in ("AND registered_with_carrier = true", ""):
        row = conn.execute(
            f"""SELECT name FROM ecomm_pickup_locations
                WHERE company_id = %s AND active = true {extra}
                ORDER BY is_default DESC, created_at ASC LIMIT 1""",
            [company_id],
        ).fetchone()
        if row:
            # Delhivery matches this name exactly; older rows may carry a stray
            # space from before it was trimmed on save.
            return (row["name"] or "").strip()
    return ""


def _company_boxes(conn, company_id: str) -> list[dict]:
    return conn.execute(
        "SELECT name, weight, length, width, height FROM shipping_boxes WHERE company_id = %s AND type = 'box'",
        [company_id],
    ).fetchall()


def _unshipped_orders(conn, company_id: str, order_ids: Optional[list[str]]):
    params: list = [company_id]
    id_clause = ""
    if order_ids is not None:
        id_clause = "AND (eo.id = ANY(%s) OR eo.order_number::text = ANY(%s))"
        params += [order_ids, order_ids]
    return conn.execute(
        f"""
        SELECT eo.id, eo.order_number AS "orderNumber", eo.status, eo.meta,
               eo.payment_method AS "paymentMethod", eo.grand_total AS "grandTotal", eo.items,
               COALESCE(NULLIF(eo.shipping_address, '{{}}'::jsonb),
                        NULLIF(ec.shipping_address, '{{}}'::jsonb)) AS "shippingAddress"
        FROM ecomm_orders eo
        LEFT JOIN ecomm_checkouts ec ON ec.id = eo.checkout_id
        WHERE eo.company_id = %s
          AND (eo.meta->>'awb') IS NULL
          AND eo.status NOT IN ('CANCELLED', 'DELIVERED')
          {id_clause}
        ORDER BY eo.created_at DESC
        """,
        params,
    ).fetchall()


def _preview_order(conn, company_id: str, order: dict, boxes: list[dict], pickup_name: str) -> dict:
    lines, all_resolved = resolve_order_lines(conn, company_id, order.get("items") or [])
    addr = order.get("shippingAddress") or {}
    reasons = []
    if not all_resolved:
        reasons.append("Missing weight/dimensions on some items")
    if not (addr.get("pincode") and (addr.get("phoneNo") or addr.get("phone"))):
        reasons.append("Incomplete delivery address")
    if not pickup_name:
        reasons.append("No registered pickup location")
    cart = pick_boxes(lines, boxes) if all_resolved else {
        "boxes": [], "boxCount": 0, "productWeight": 0, "boxWeight": 0, "totalWeight": 0, "hasBox": False}
    # Cartonization can fail on its own terms (item too big, too many boxes) —
    # that must block the shipment, not just be reported alongside it.
    if cart.get("error"):
        reasons.append(cart["error"])
    already_shipped = bool((order.get("meta") or {}).get("awb"))
    if already_shipped:
        reasons.append(f"Already shipped (AWB {(order.get('meta') or {}).get('awb')})")

    # Over Rs 50,000 an e-way bill is a legal requirement, not a preference —
    # shipping without one exposes the consignment to seizure in transit.
    ewbn = ((order.get("meta") or {}).get("shipping") or {}).get("ewbn")
    ewaybill_required = _ewaybill_required(order.get("grandTotal"))
    if ewaybill_required and not ewbn:
        reasons.append(f"E-way bill required for orders over Rs {EWAYBILL_THRESHOLD:,.0f} "
                       f"— generate it on the GST portal and enter the number")
    has_phone = bool(addr.get("phoneNo") or addr.get("phone"))
    can_ship = (all_resolved and bool(addr.get("pincode")) and has_phone and bool(pickup_name)
                and not cart.get("error") and not already_shipped
                and not (ewaybill_required and not ewbn))
    return {
        "orderId": order["id"],
        "orderNumber": order.get("orderNumber"),
        "canShip": can_ship,
        "alreadyShipped": already_shipped,
        "ewaybillRequired": ewaybill_required,
        "ewaybill": ewbn,
        "reason": "; ".join(reasons) if reasons else None,
        "totalWeight": cart["totalWeight"],
        "boxCount": cart["boxCount"],
        "boxes": [b["name"] for b in cart["boxes"]],
        "productWeight": cart.get("productWeight"),
        "boxWeight": cart.get("boxWeight"),
        "lines": [{"name": l["name"], "qty": l["qty"], "resolved": l["resolved"], "source": l["source"],
                   "weight": l["weight"], "length": l["length"], "width": l["width"], "height": l["height"]}
                  for l in lines],
    }


# ---------------------------------------------------------------------------
# Waybill pool (multi-piece shipments)
#
# Delhivery generates waybills in batches of 25 in the background and warns:
# "Using them immediately after fetching may occasionally result in errors — we
# recommend storing them on your end and using them later." The fetch endpoint
# also allows only 5 requests per 5 minutes.
#
# So waybills are fetched in batches, kept in a pool, and consumed oldest-first:
# by the time one is used it has had time to settle, and a burst of multi-box
# orders does not hammer a 5-per-5-minute endpoint.
# ---------------------------------------------------------------------------

WAYBILL_POOL_KEY = "waybill_pool"


def _pool_read(conn, company_id: str) -> dict:
    row = conn.execute(
        """SELECT preference_value AS v FROM general_preferences
           WHERE company_id = %s AND page_name = 'ecomm_shipping' AND preference_key = %s
           LIMIT 1""",
        [company_id, WAYBILL_POOL_KEY],
    ).fetchone()
    if not row:
        return {}
    value = row["v"]
    if not isinstance(value, dict):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return {}
    return value or {}


def _pool_write(conn, company_id: str, pool: dict) -> None:
    conn.execute(
        """
        INSERT INTO general_preferences (id, company_id, page_name, preference_key, preference_value, active)
        VALUES (gen_random_uuid(), %s, 'ecomm_shipping', %s, %s::jsonb, true)
        ON CONFLICT (company_id, page_name, preference_key)
        DO UPDATE SET preference_value = EXCLUDED.preference_value, active = true
        """,
        [company_id, WAYBILL_POOL_KEY, Jsonb(pool)],
    )


def _take_waybills(conn, company_id: str, provider: str, adapter, gw, count: int) -> list[str]:
    """`count` waybills for a multi-piece shipment, oldest first.

    Refills from the carrier in batches when the pool cannot cover the request.
    """
    if count <= 0:
        return []
    pool = _pool_read(conn, company_id)
    available = [w for w in (pool.get(provider) or []) if w]

    if len(available) < count:
        batch = max(getattr(adapter, "WAYBILL_BATCH", 50), count)
        try:
            fetched = adapter.fetch_waybills(gw, batch)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not fetch waybills: {exc}")
        # Append, so anything already pooled is still used first.
        seen = set(available)
        available += [w for w in fetched if w and w not in seen]

    if len(available) < count:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(available)} waybill(s) available for a {count}-box shipment. "
                   f"Delhivery limits waybill fetches to 5 per 5 minutes — try again shortly.")

    taken, rest = available[:count], available[count:]
    pool[provider] = rest
    with conn.transaction():
        _pool_write(conn, company_id, pool)
    return taken


def _release_waybills(conn, company_id: str, provider: str, waybills: list[str]) -> None:
    """Put unused waybills back at the FRONT of the pool.

    A waybill taken for a shipment that then failed is still perfectly good —
    dropping it would leak a real, finite carrier resource on every failure.
    """
    if not waybills:
        return
    try:
        pool = _pool_read(conn, company_id)
        existing = [w for w in (pool.get(provider) or []) if w]
        pool[provider] = list(dict.fromkeys([*waybills, *existing]))
        with conn.transaction():
            _pool_write(conn, company_id, pool)
    except Exception:
        pass


def _order_by_id(conn, company_id: str, order_id: str):
    return conn.execute(
        """
        SELECT eo.id, eo.order_number AS "orderNumber", eo.status, eo.meta,
               eo.payment_method AS "paymentMethod", eo.grand_total AS "grandTotal", eo.items,
               COALESCE(NULLIF(eo.shipping_address, '{}'::jsonb),
                        NULLIF(ec.shipping_address, '{}'::jsonb)) AS "shippingAddress"
        FROM ecomm_orders eo
        LEFT JOIN ecomm_checkouts ec ON ec.id = eo.checkout_id
        WHERE eo.company_id = %s AND (eo.id = %s OR eo.order_number::text = %s)
        LIMIT 1
        """,
        [company_id, order_id, order_id],
    ).fetchone()


def _ship_one(conn, company_id, provider, gw, adapter, boxes, pickup_name, pickup_pincode, order,
              seller: Optional[dict] = None) -> dict:
    """Create the shipment (SPS/MPS) for one order. Returns a result dict; never raises."""
    base = {"orderId": order["id"], "orderNumber": order.get("orderNumber")}
    lines, all_resolved = resolve_order_lines(conn, company_id, order.get("items") or [])
    addr = order.get("shippingAddress") or {}
    if not (all_resolved and addr.get("pincode") and pickup_name):
        missing = []
        if not all_resolved:
            missing.append("item weight/dimensions")
        if not addr.get("pincode"):
            missing.append("delivery pincode")
        if not pickup_name:
            missing.append("a registered pickup location")
        return {**base, "ok": False, "error": "Not shippable — missing " + ", ".join(missing)}
    cart = pick_boxes(lines, boxes)
    if cart.get("error"):
        return {**base, "ok": False, "error": cart["error"]}
    ship_body = _BulkBody(order, addr, pickup_name, cart["totalWeight"],
                          seller if seller is not None else _seller_info(conn, company_id))
    is_mps = cart["boxCount"] > 1 and "mps" in adapter.capabilities
    waybills: list[str] = []
    try:
        if is_mps:
            # Drawn from the pool so they are not used the instant they are minted.
            waybills = _take_waybills(conn, company_id, provider, adapter, gw, cart["boxCount"])
            result = adapter.create_mps_shipment(gw, ship_body, cart["boxes"], pickup_pincode, waybills)
        else:
            result = adapter.create_shipment(gw, ship_body, pickup_pincode)
        # Belt and braces: without a waybill there is nothing to persist, track or
        # label, so never report such a result as a created shipment.
        if not result.get("awb"):
            _release_waybills(conn, company_id, provider, waybills)
            return {**base, "ok": False, "error": "Carrier did not return a waybill"}
        _persist_bulk_shipment(conn, company_id, order["id"], provider, result, cart)
        return {**base, "ok": True, "awb": result.get("awb"), "boxCount": cart["boxCount"],
                "boxes": [b["name"] for b in cart["boxes"]], "totalWeight": cart["totalWeight"]}
    except HTTPException as exc:
        _release_waybills(conn, company_id, provider, waybills)
        return {**base, "ok": False, "error": str(exc.detail)}
    except Exception as exc:
        _release_waybills(conn, company_id, provider, waybills)
        return {**base, "ok": False, "error": str(exc)}


class BulkShipRequest(BaseModel):
    orderIds: Optional[list[str]] = None


@router.get("/{company_id}/shipping/order/{order_id}/preview")
def order_preview(company_id: str, order_id: str, conn=Depends(db), _svc: bool = Depends(require_service)):
    order = _order_by_id(conn, company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    boxes = _company_boxes(conn, company_id)
    pickup_name = _default_pickup_name(conn, company_id)
    return {
        "pickupLocation": pickup_name,
        "boxesConfigured": len(boxes),
        "order": _preview_order(conn, company_id, order, boxes, pickup_name),
    }


@router.post("/{company_id}/shipping/order/{order_id}/create")
def order_create(company_id: str, order_id: str, conn=Depends(db), _svc: bool = Depends(require_service)):
    cfg = _common._get_config(conn, company_id)
    provider, gw = _common._active_provider(cfg)
    adapter = get_carrier(provider)
    if not adapter or "create" not in adapter.capabilities:
        raise HTTPException(status_code=400, detail=f"Create not supported for provider: {provider}")

    order = _order_by_id(conn, company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (order.get("meta") or {}).get("awb"):
        raise HTTPException(status_code=400, detail="Order already has a shipment")

    boxes = _company_boxes(conn, company_id)
    pickup_name = _default_pickup_name(conn, company_id)
    pickup_pincode = gw.get("pickupPincode", "") or _common._origin_pincode(conn, company_id)
    result = _ship_one(conn, company_id, provider, gw, adapter, boxes, pickup_name, pickup_pincode, order)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "Could not create shipment")

    # Generate the label (not printed here — the client decides).
    label_url = None
    awb = result.get("awb")
    if awb and "label" in adapter.capabilities:
        try:
            label_url = adapter.generate_label(gw, awb, _common._label_size(conn, company_id)).get("labelUrl")
            if label_url:
                _common._persist_label(conn, company_id, awb, label_url)
        except Exception:
            label_url = None
    result["labelUrl"] = label_url
    return result


@router.post("/{company_id}/shipping/bulk-preview")
def bulk_preview(company_id: str, body: BulkShipRequest = Body(default=BulkShipRequest()),
                 conn=Depends(db), _svc: bool = Depends(require_service)):
    boxes = _company_boxes(conn, company_id)
    pickup_name = _default_pickup_name(conn, company_id)
    orders = _unshipped_orders(conn, company_id, body.orderIds)
    previews = [_preview_order(conn, company_id, o, boxes, pickup_name) for o in orders]
    return {
        "pickupLocation": pickup_name,
        "boxesConfigured": len(boxes),
        "total": len(previews),
        "shippable": sum(1 for p in previews if p["canShip"]),
        "orders": previews,
    }


@router.post("/{company_id}/shipping/bulk-create")
def bulk_create(company_id: str, body: BulkShipRequest = Body(default=BulkShipRequest()),
                conn=Depends(db), _svc: bool = Depends(require_service)):
    cfg = _common._get_config(conn, company_id)
    provider, gw = _common._active_provider(cfg)
    adapter = get_carrier(provider)
    if not adapter or "create" not in adapter.capabilities:
        raise HTTPException(status_code=400, detail=f"Create not supported for provider: {provider}")

    boxes = _company_boxes(conn, company_id)
    pickup_name = _default_pickup_name(conn, company_id)
    pickup_pincode = gw.get("pickupPincode", "") or _common._origin_pincode(conn, company_id)
    orders = _unshipped_orders(conn, company_id, body.orderIds)

    seller = _seller_info(conn, company_id)
    results = [_ship_one(conn, company_id, provider, gw, adapter, boxes, pickup_name, pickup_pincode, order, seller)
               for order in orders]

    # Generate labels for everything just created (do NOT print — the client asks
    # to print afterwards). Attach labelUrl to each created result.
    created_awbs = [r["awb"] for r in results if r.get("ok") and r.get("awb")]
    if created_awbs and "label" in adapter.capabilities:
        size = _common._label_size(conn, company_id)
        url_map: dict = {}
        try:
            if hasattr(adapter, "generate_labels_bulk"):
                url_map = adapter.generate_labels_bulk(gw, created_awbs, size)
        except Exception:
            url_map = {}
        for awb in created_awbs:
            if not url_map.get(awb):
                try:
                    url_map[awb] = adapter.generate_label(gw, awb, size).get("labelUrl")
                except Exception:
                    url_map[awb] = None
        for r in results:
            if r.get("ok") and r.get("awb"):
                url = url_map.get(r["awb"])
                r["labelUrl"] = url
                if url:
                    _common._persist_label(conn, company_id, r["awb"], url)

    labels = [{"orderNumber": r.get("orderNumber"), "awb": r.get("awb"), "labelUrl": r.get("labelUrl")}
              for r in results if r.get("ok") and r.get("labelUrl")]
    return {"created": sum(1 for r in results if r["ok"]), "failed": sum(1 for r in results if not r["ok"]),
            "results": results, "labels": labels, "labelCount": len(labels)}


def _persist_bulk_shipment(conn, company_id: str, order_id: str, provider: str, result: dict, cart: dict) -> None:
    awb = result.get("awb")
    if not awb:
        return
    meta = {
        "awb": str(awb),
        "shipping": {
            "provider":   provider,
            "awb":        str(awb),
            "trackingId": str(awb),
            "childAwbs":  result.get("childAwbs") or [],
            "status":     result.get("status"),
            "location":   None,
            "boxCount":   cart.get("boxCount"),
            "boxes":      [b["name"] for b in cart.get("boxes", [])],
            "totalWeight": cart.get("totalWeight"),
        },
    }
    with conn.transaction():
        conn.execute(
            """
            UPDATE ecomm_orders
            SET meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb, updated_at = now()
            WHERE company_id = %s AND id = %s
            """,
            [Jsonb(meta), company_id, order_id],
        )


def _assert_editable(adapter, gw, awb: str, action: str) -> dict:
    """Refuse an edit/cancel the carrier would reject anyway.

    Delhivery allows both only while a shipment is Manifested, In Transit or
    Pending (Scheduled for a reverse pickup). Once it is Dispatched or terminal
    (Delivered / RTO / DTO / Lost / Closed) the request fails, so check first
    and give the seller the real reason.

    A tracking failure is not treated as a block — the carrier stays the final
    authority; we only stop on a status we can positively read as ineligible.
    """
    allowed = getattr(adapter, "EDITABLE_STATUSES", ())
    if not allowed or "track" not in getattr(adapter, "capabilities", ()):
        return {}
    try:
        info = adapter.track(gw, awb) or {}
    except Exception:
        return {}
    raw = str(info.get("status") or info.get("rawStatus") or "").strip()
    if not raw:
        return {}
    if raw.lower() not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{action} is not allowed once the shipment is '{raw}' — "
                   f"the carrier permits it only while it is "
                   f"{', '.join(w.title() for w in allowed)}.")
    return info


def _release_shipment(conn, company_id: str, order_id: Optional[str], awb: str) -> None:
    """Detach a cancelled shipment from its order so a new one can be created.

    Delhivery does not always change the shipment's status on cancellation (a
    manifested parcel stays "Manifested"), so the order would otherwise keep
    showing as shipped forever, and `order_create` would keep refusing with
    "Order already has a shipment".

    The AWB is not thrown away — it moves into meta.shipping.cancelled[] so the
    history survives — and the order drops back to PACKED, ready to ship again.
    """
    where = "id = %s" if order_id else "meta->>'awb' = %s"
    key = order_id or str(awb)
    row = conn.execute(
        f"SELECT id, meta FROM ecomm_orders WHERE company_id = %s AND {where} LIMIT 1",
        [company_id, key],
    ).fetchone()
    if not row:
        return
    meta = dict(row.get("meta") or {})
    shipping = dict(meta.get("shipping") or {})
    history = list(shipping.get("cancelled") or [])
    history.append({
        "awb": str(awb),
        "provider": shipping.get("provider"),
        "labelUrl": shipping.get("labelUrl"),
        "at": datetime.now(timezone.utc).isoformat(),
    })
    # Drop the live shipment, keep the audit trail.
    meta.pop("awb", None)
    meta["shipping"] = {"cancelled": history}
    with conn.transaction():
        conn.execute(
            "UPDATE ecomm_orders SET meta = %s::jsonb, status = 'PACKED', updated_at = now() "
            "WHERE company_id = %s AND id = %s",
            [Jsonb(meta), company_id, row["id"]],
        )
        _common._record_history(conn, company_id, row["id"], "PACKED", "shipment-cancelled",
                                note=f"Shipment {awb} cancelled", awb=str(awb))


# ---------------------------------------------------------------------------
# E-way bill
#
# Indian law requires an e-way bill for consignments over Rs 50,000. The number
# is issued by the government GST portal — neither we nor the carrier can
# generate it; the seller enters it and it is recorded against the waybill.
# ---------------------------------------------------------------------------

EWAYBILL_THRESHOLD = 50000.0


class EwaybillRequest(BaseModel):
    orderId: str
    ewbn: str
    invoiceNumber: Optional[str] = None       # defaults to the order's own invoice


def _ewaybill_required(grand_total) -> bool:
    try:
        return float(grand_total or 0) > EWAYBILL_THRESHOLD
    except (TypeError, ValueError):
        return False


@router.post("/{company_id}/shipping/ewaybill")
def set_ewaybill(company_id: str, body: EwaybillRequest,
                 conn=Depends(db), _svc: bool = Depends(require_service)):
    """Record an e-way bill number against an order, and push it to the carrier
    if the shipment already exists."""
    ewbn = (body.ewbn or "").strip()
    if not ewbn:
        raise HTTPException(status_code=400, detail="E-waybill number is required")

    row = conn.execute(
        """
        SELECT eo.id, eo.order_number AS "orderNumber", eo.meta, eo.grand_total AS "grandTotal",
               b.invoice_number AS "invoiceNumber"
        FROM ecomm_orders eo
        LEFT JOIN bills b ON b.id = eo.bill_id
        WHERE eo.company_id = %s AND (eo.id = %s OR eo.order_number::text = %s)
        LIMIT 1
        """,
        [company_id, body.orderId, body.orderId],
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")

    dcn = (body.invoiceNumber or row.get("invoiceNumber")
           or (f"ORD-{row['orderNumber']}" if row.get("orderNumber") else None))
    if not dcn:
        raise HTTPException(status_code=400,
                            detail="No invoice number for this order — Delhivery requires one with the e-waybill")

    awb = (row.get("meta") or {}).get("awb")
    pushed = False
    if awb:
        _provider, gw, adapter = _common._require_capability(conn, company_id, "ewaybill")
        adapter.update_ewaybill(gw, awb, dcn, ewbn)
        pushed = True

    # Stored either way: before a shipment exists it is sent with the manifest.
    with conn.transaction():
        conn.execute(
            """
            UPDATE ecomm_orders
            SET meta = jsonb_set(
                  jsonb_set(COALESCE(meta, '{}'::jsonb), '{shipping}',
                            COALESCE(meta->'shipping', '{}'::jsonb), true),
                  '{shipping,ewbn}', %s::jsonb, true),
                updated_at = now()
            WHERE company_id = %s AND id = %s
            """,
            [Jsonb(ewbn), company_id, row["id"]],
        )
    return {"ok": True, "ewbn": ewbn, "dcn": dcn, "awb": awb,
            "pushedToCarrier": pushed,
            "required": _ewaybill_required(row.get("grandTotal"))}


@router.post("/{company_id}/shipping/cancel")
def cancel_shipment(
    company_id: str,
    body: _common.CancelShipmentRequest,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    cfg = _common._get_config(conn, company_id)
    provider, gw = _common._active_provider(cfg)

    adapter = get_carrier(provider)
    if adapter and "cancel" in adapter.capabilities:
        if body.awb:
            _assert_editable(adapter, gw, body.awb, "Cancellation")
        result = adapter.cancel(gw, body)
        # Free the order so it can be shipped again.
        if body.awb:
            _release_shipment(conn, company_id, body.orderId, body.awb)
        return {**result, "released": True}

    if provider == "shiprocket":
        return _carriers._shiprocket_cancel(gw, body)
    raise HTTPException(status_code=400, detail=f"Cancel not yet implemented for provider: {provider}")


@router.post("/{company_id}/shipping/update")
def update_shipment(
    company_id: str,
    body: _common.UpdateShipmentRequest,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    _provider, gw, adapter = _common._require_capability(conn, company_id, "update")
    _assert_editable(adapter, gw, body.awb, "Editing")
    return adapter.update_shipment(gw, body)


@router.get("/{company_id}/shipping/label-size")
def get_label_size(company_id: str, conn=Depends(db), _svc: bool = Depends(require_service)):
    return {"size": _common._label_size(conn, company_id)}


@router.post("/{company_id}/shipping/label-size")
def set_label_size(company_id: str, size: str = Body(..., embed=True),
                   conn=Depends(db), _svc: bool = Depends(require_service)):
    size = size if size in ("A4", "4R") else "A4"
    with conn.transaction():
        conn.execute(
            """
            INSERT INTO general_preferences (id, company_id, page_name, preference_key, preference_value, active)
            VALUES (gen_random_uuid(), %s, 'ecomm_shipping', 'label_size', %s::jsonb, true)
            ON CONFLICT (company_id, page_name, preference_key)
            DO UPDATE SET preference_value = EXCLUDED.preference_value, active = true
            """,
            [company_id, Jsonb(size)],
        )
    return {"size": size}


@router.get("/{company_id}/shipping/label/{tracking_id}")
def generate_label(
    company_id: str,
    tracking_id: str,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    _provider, gw, adapter = _common._require_capability(conn, company_id, "label")
    result = adapter.generate_label(gw, tracking_id, _common._label_size(conn, company_id))
    if result.get("labelUrl"):
        _common._persist_label(conn, company_id, tracking_id, result["labelUrl"])
    return result


class BulkLabelRequest(BaseModel):
    orderIds: Optional[list[str]] = None


@router.post("/{company_id}/shipping/bulk-label")
def bulk_label(company_id: str, body: BulkLabelRequest = Body(default=BulkLabelRequest()),
               conn=Depends(db), _svc: bool = Depends(require_service)):
    """Generate labels for shipped orders (all with an AWB but no label, or the
    given orderIds), store each labelUrl on the order, and return them."""
    _provider, gw, adapter = _common._require_capability(conn, company_id, "label")
    size = _common._label_size(conn, company_id)

    params: list = [company_id]
    id_clause = ""
    if body.orderIds is not None:
        id_clause = "AND (id = ANY(%s) OR order_number::text = ANY(%s))"
        params += [body.orderIds, body.orderIds]
    rows = conn.execute(
        f"""
        SELECT id, order_number AS "orderNumber", meta->>'awb' AS awb,
               meta->'shipping'->>'labelUrl' AS "labelUrl"
        FROM ecomm_orders
        WHERE company_id = %s AND (meta->>'awb') IS NOT NULL {id_clause}
        ORDER BY created_at DESC
        """,
        params,
    ).fetchall()

    awb_to_order = {r["awb"]: r for r in rows if r["awb"]}
    awbs = list(awb_to_order.keys())
    if not awbs:
        return {"labels": [], "count": 0, "size": size}

    if hasattr(adapter, "generate_labels_bulk"):
        try:
            url_map = adapter.generate_labels_bulk(gw, awbs, size)
        except Exception:
            url_map = {}
    else:
        url_map = {}
    # Fill any misses one-by-one so a single bad waybill doesn't drop the batch.
    for awb in awbs:
        if not url_map.get(awb):
            try:
                url_map[awb] = adapter.generate_label(gw, awb, size).get("labelUrl")
            except Exception:
                url_map[awb] = None

    labels = []
    for awb, url in url_map.items():
        order = awb_to_order.get(awb, {})
        if url:
            _common._persist_label(conn, company_id, awb, url)
        labels.append({"orderId": order.get("id"), "orderNumber": order.get("orderNumber"),
                       "awb": awb, "labelUrl": url})
    return {"labels": labels, "count": sum(1 for l in labels if l["labelUrl"]), "size": size}


@router.post("/{company_id}/shipping/pickup")
def create_pickup(
    company_id: str,
    body: _common.PickupRequest,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    # Pickup is a per-warehouse/day batch op — the seller chooses which carrier
    # to call (defaults to primary). Only pickup-capable carriers are valid.
    cfg = _common._get_config(conn, company_id)
    provider = body.provider or cfg.get("primary", "")
    gw = cfg.get("providers", {}).get(provider, {})
    if not gw.get("enabled"):
        raise HTTPException(status_code=400, detail=f"Provider '{provider}' is not connected")
    adapter = get_carrier(provider)
    if not adapter or "pickup" not in adapter.capabilities:
        raise HTTPException(status_code=400, detail=f"Pickup not supported for provider: {provider}")
    return adapter.create_pickup(gw, body)


@router.post("/{company_id}/shipping/ndr")
def ndr_action(
    company_id: str,
    body: _common.NdrActionRequest,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    _provider, gw, adapter = _common._require_capability(conn, company_id, "ndr")
    result = adapter.ndr_action(gw, body)

    # Async carriers (Delhivery) return a UPL ID for the queued request —
    # persist it on the order so the seller can poll its status later. NDR is
    # detected live from the track API (no stored flag), so create the
    # intermediate meta objects rather than requiring them to exist.
    upl = result.get("uplId") if isinstance(result, dict) else None
    if upl:
        with conn.transaction():
            conn.execute(
                """
                UPDATE ecomm_orders
                SET meta = jsonb_set(
                      jsonb_set(
                        jsonb_set(COALESCE(meta, '{}'::jsonb), '{shipping}',
                                  COALESCE(meta->'shipping', '{}'::jsonb), true),
                        '{shipping,ndr}', COALESCE(meta#>'{shipping,ndr}', '{}'::jsonb), true),
                      '{shipping,ndr,upl}',
                      jsonb_build_object('id', %s::text, 'action', %s::text, 'at', now()::text),
                      true),
                    updated_at = now()
                WHERE company_id = %s
                  AND (meta->>'awb' = %s OR meta#>>'{shipping,awb}' = %s
                       OR meta#>>'{shipping,reverse,awb}' = %s
                       OR meta#>>'{shipping,exchange,awb}' = %s)
                """,
                [str(upl), body.action, company_id, body.awb, body.awb, body.awb, body.awb],
            )
    return result


@router.get("/{company_id}/shipping/ndr-status")
def ndr_status(
    company_id: str,
    uplId: str,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    _provider, gw, adapter = _common._require_capability(conn, company_id, "ndr")
    return adapter.ndr_status(gw, uplId)


def _build_customer_flow(conn, company_id: str, request_id: str, expected_type: str,
                         weight: Optional[float], suffix: str, awb_meta_key: str):
    """Load an approved return/exchange request + its order + the registered
    warehouse and build the adapter body for a customer-flow shipment
    (RVP 'Pickup' or exchange 'REPL'). Returns (request_row, order_row, body)."""
    req = conn.execute(
        """SELECT id, order_id, type, status, items, meta
           FROM ecomm_order_requests WHERE id = %s AND company_id = %s""",
        [request_id, company_id],
    ).fetchone()
    if not req:
        raise HTTPException(status_code=404, detail=f"{expected_type.capitalize()} request not found")
    if req["type"] != expected_type:
        raise HTTPException(status_code=400, detail=f"This endpoint is only for {expected_type} requests")
    if (req["status"] or "").upper() != "APPROVED":
        raise HTTPException(status_code=400, detail=f"Approve the {expected_type} request first")
    if (req.get("meta") or {}).get(awb_meta_key):
        raise HTTPException(status_code=400, detail="A shipment already exists for this request")

    order = conn.execute(
        """SELECT id, order_number AS "orderNumber", shipping_address AS "shippingAddress",
                  items, grand_total AS "grandTotal", meta
           FROM ecomm_orders WHERE id = %s AND company_id = %s""",
        [req["order_id"], company_id],
    ).fetchone()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # The registered warehouse: pickup_location name is required by the carrier,
    # and its address is the return/final-delivery leg of the journey.
    wh = conn.execute(
        """SELECT name, contact_name, phone, address, city, state, pincode, country
           FROM ecomm_pickup_locations
           WHERE company_id = %s AND active = true AND registered_with_carrier = true
           ORDER BY is_default DESC, created_at ASC LIMIT 1""",
        [company_id],
    ).fetchone()
    if not wh:
        raise HTTPException(status_code=400, detail="No carrier-registered pickup location — register a warehouse first")

    addr = order["shippingAddress"] or {}
    items = req["items"] or order["items"] or []
    desc = ", ".join(str(i.get("name") or i.get("variantName") or "Item") for i in items)
    qty = sum(int(i.get("quantity") or i.get("qty") or 1) for i in items) or 1
    ship_meta = (order.get("meta") or {}).get("shipping") or {}
    weight_kg = ship_meta.get("totalWeight")

    body = SimpleNamespace(
        # Unique order id: one request → one shipment; suffix keeps it distinct
        # from the forward shipment's order id.
        orderNumber=f"{order['orderNumber']}-{suffix}-{str(req['id'])[:8]}",
        customerName=" ".join(filter(None, [addr.get("firstName"), addr.get("lastName")])) or addr.get("name") or "Customer",
        customerPhone=addr.get("phoneNo") or addr.get("phone") or "",
        customerAddress=", ".join(filter(None, [addr.get("houseDetails"), addr.get("street"),
                                                addr.get("locality"), addr.get("landmark")]))
                        or addr.get("formattedAddress") or "",
        customerCity=addr.get("city") or "",
        customerState=addr.get("state") or "",
        customerPincode=addr.get("pincode") or "",
        customerCountry=addr.get("country") or "India",
        returnName=wh["contact_name"] or wh["name"],
        returnPhone=wh["phone"] or "",
        returnAddress=wh["address"] or "",
        returnCity=wh["city"] or "",
        returnState=wh["state"] or "",
        returnCountry=wh["country"] or "India",
        returnPincode=wh["pincode"] or "",
        pickupLocation=wh["name"],
        totalAmount=order["grandTotal"],
        productsDesc=desc,
        quantity=qty,
        weight=weight or (int(round(float(weight_kg) * 1000)) if weight_kg else None),
    )
    return req, order, body


def _persist_customer_flow_awb(conn, company_id: str, req, order, result,
                               order_meta_key: str, request_meta_key: str):
    awb = result.get("awb")
    with conn.transaction():
        conn.execute(
            f"""
            UPDATE ecomm_orders
            SET meta = jsonb_set(
                  jsonb_set(COALESCE(meta, '{{}}'::jsonb), '{{shipping}}',
                            COALESCE(meta->'shipping', '{{}}'::jsonb), true),
                  '{{shipping,{order_meta_key}}}', %s::jsonb, true),
                updated_at = now()
            WHERE id = %s AND company_id = %s
            """,
            [Jsonb({"awb": awb, "requestId": str(req["id"]),
                    "at": datetime.now(timezone.utc).isoformat(),
                    "status": result.get("status")}), order["id"], company_id],
        )
        conn.execute(
            """
            UPDATE ecomm_order_requests
            SET meta = COALESCE(meta, '{}'::jsonb) || %s::jsonb, updated_at = now()
            WHERE id = %s AND company_id = %s
            """,
            [Jsonb({request_meta_key: awb}), req["id"], company_id],
        )


@router.post("/{company_id}/shipping/reverse")
def create_reverse(
    company_id: str,
    body: _common.ReverseShipmentRequest,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    _provider, gw, adapter = _common._require_capability(conn, company_id, "reverse")
    req, order, rvp = _build_customer_flow(
        conn, company_id, body.requestId, "return", body.weight, "RVP", "reverseAwb")
    result = adapter.create_reverse_shipment(gw, rvp)
    _persist_customer_flow_awb(conn, company_id, req, order, result, "reverse", "reverseAwb")
    return result


@router.post("/{company_id}/shipping/exchange")
def create_exchange(
    company_id: str,
    body: _common.ReverseShipmentRequest,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    # REPL: one waybill — replacement delivered to the customer, old item
    # collected there and returned to the warehouse.
    _provider, gw, adapter = _common._require_capability(conn, company_id, "exchange")
    req, order, repl = _build_customer_flow(
        conn, company_id, body.requestId, "exchange", body.weight, "REPL", "exchangeAwb")
    result = adapter.create_exchange_shipment(gw, repl)
    _persist_customer_flow_awb(conn, company_id, req, order, result, "exchange", "exchangeAwb")
    return result


class _PickupLocationRow:
    """Lightweight attribute view over the DB row for the adapter methods."""
    def __init__(self, row: dict):
        self.name          = row.get("name")
        self.contactName   = row.get("contact_name")
        self.phone         = row.get("phone")
        self.email         = row.get("email")
        self.address       = row.get("address")
        self.city          = row.get("city")
        self.state         = row.get("state")
        self.pincode       = row.get("pincode")
        self.country       = row.get("country") or "India"
        self.returnAddress = row.get("return_address")
        self.returnPincode = row.get("return_pincode")
        self.returnCity    = row.get("return_city")
        self.returnState   = row.get("return_state")
        self.returnCountry = row.get("return_country")
        self.registeredName = row.get("name")


@router.post("/{company_id}/shipping/pickup-locations/{location_id}/register")
def register_pickup_location(
    company_id: str,
    location_id: str,
    conn=Depends(db),
    _svc: bool = Depends(require_service),
):
    cfg = _common._get_config(conn, company_id)
    provider, gw = _common._active_provider(cfg)
    adapter = get_carrier(provider)
    if not adapter or "pickup_location" not in adapter.capabilities:
        raise HTTPException(status_code=400, detail=f"Pickup-location registration not supported for provider: {provider}")

    row = conn.execute(
        """
        SELECT id, name, contact_name, phone, email, address, city, state, pincode,
               country, return_address, return_pincode, return_city, return_state,
               return_country, registered_with_carrier, carrier_meta
        FROM ecomm_pickup_locations
        WHERE company_id = %s AND id = %s
        LIMIT 1
        """,
        [company_id, location_id],
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pickup location not found")

    body = _PickupLocationRow(row)
    name = (row.get("name") or "").strip()

    if row.get("registered_with_carrier"):
        # Delhivery cannot rename a warehouse — the name only identifies which one
        # to edit. If the local name has drifted, every shipment and pickup that
        # quotes it will fail with "ClientWarehouse matching query does not exist",
        # so refuse rather than silently editing nothing.
        meta = row.get("carrier_meta") if isinstance(row.get("carrier_meta"), dict) else {}
        # Prefer the name we recorded at registration; fall back to the one
        # Delhivery echoed back in its own response, which covers rows created
        # before we started recording it.
        registered_name = (meta.get("registeredName")
                           or ((meta.get("data") or {}) if isinstance(meta.get("data"), dict) else {}).get("name"))
        if registered_name and registered_name != name:
            raise HTTPException(
                status_code=400,
                detail=f"This warehouse is registered with Delhivery as '{registered_name}'. "
                       f"Delhivery cannot rename a warehouse — revert the name, or add a new "
                       f"pickup location under the new name.")
        result = adapter.update_pickup_location(gw, body)
    else:
        result = adapter.register_pickup_location(gw, body)

    # Remember the exact name the carrier holds, so a later rename is detectable.
    carrier_meta = dict(result.get("carrierMeta") or {})
    carrier_meta["registeredName"] = name

    with conn.transaction():
        conn.execute(
            """
            UPDATE ecomm_pickup_locations
            SET registered_with_carrier = true,
                carrier = %s,
                carrier_meta = %s::jsonb,
                name = %s,
                updated_at = now()
            WHERE company_id = %s AND id = %s
            """,
            [provider, Jsonb(carrier_meta), name, company_id, location_id],
        )
    return {"ok": True, "registered": True, "provider": provider, "carrierMeta": carrier_meta}


# ---------------------------------------------------------------------------
# Label PDFs — raw bytes
#
# The carrier hands back a `labelUrl` (Delhivery: a packing-slip PDF link).
# storetools cannot fetch that from the browser (cross-origin, and the link may
# need carrier auth), so these endpoints resolve the URL, fetch the PDF here,
# and return the bytes. storetools then streams them to the seller as either a
# download or an inline print preview.
# ---------------------------------------------------------------------------

def _stored_label_url(conn, company_id: str, awb: str) -> Optional[str]:
    row = conn.execute(
        """
        SELECT meta->'shipping'->>'labelUrl' AS "labelUrl"
        FROM ecomm_orders
        WHERE company_id = %s AND meta->>'awb' = %s
        LIMIT 1
        """,
        [company_id, str(awb)],
    ).fetchone()
    return (row or {}).get("labelUrl")


def _fetch_pdf(url: str, auth_headers: dict) -> bytes:
    """GET the label PDF. The carrier may hand back either a presigned public
    link (which rejects an extra Authorization header) or an authenticated
    endpoint, so try unauthenticated first and fall back to carrier auth."""
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        resp = client.get(url, headers={"Accept": "application/pdf"})
        if resp.status_code in (401, 403):
            resp = client.get(url, headers={**auth_headers, "Accept": "application/pdf"})
    resp.raise_for_status()
    body = resp.content
    if not body[:5] == b"%PDF-":
        raise HTTPException(status_code=502, detail="Carrier did not return a PDF label")
    return body


def _label_pdf_bytes(conn, company_id: str, awb: str) -> bytes:
    """PDF bytes for one AWB, regenerating the label whenever needed.

    The stored labelUrl is a CACHE, not a permanent address: Delhivery hands back
    a presigned S3 link that expires after 24 hours. Treat any failure to fetch
    it as "stale" and ask the carrier for a fresh one — otherwise every label
    older than a day becomes undownloadable.
    """
    _provider, gw, adapter = _common._require_capability(conn, company_id, "label")
    size = _common._label_size(conn, company_id)

    stored = _stored_label_url(conn, company_id, awb)
    if stored:
        try:
            return _fetch_pdf(stored, adapter._auth(gw))
        except Exception:
            pass        # expired or revoked — fall through and regenerate

    try:
        fresh = (adapter.generate_label(gw, awb, size) or {}).get("labelUrl")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not generate label for AWB {awb}: {exc}")
    if not fresh:
        raise HTTPException(status_code=404, detail=f"No label available for AWB {awb}")
    _common._persist_label(conn, company_id, awb, fresh)

    try:
        return _fetch_pdf(fresh, adapter._auth(gw))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not download label for AWB {awb}: {exc}")


@router.get("/{company_id}/shipping/label-data")
def label_data(company_id: str, waybills: str,
               conn=Depends(db), _svc: bool = Depends(require_service)):
    """Label data for one or more waybills, for rendering our own label."""
    _provider, gw, adapter = _common._require_capability(conn, company_id, "label")
    awbs = [w.strip() for w in (waybills or "").split(",") if w.strip()][:50]
    if not awbs:
        raise HTTPException(status_code=400, detail="waybills is required")
    if not hasattr(adapter, "label_data"):
        raise HTTPException(status_code=400, detail="Custom labels are not supported for this carrier")
    size = _common._label_size(conn, company_id)
    seller = _seller_info(conn, company_id)
    packages = adapter.label_data(gw, awbs, size)
    # The carrier leaves the seller name blank on shipments created before we
    # started sending it — fall back to the company's own name so an older
    # label still prints something a human recognises.
    for pkg in packages:
        if not (pkg.get("snm") or "").strip():
            pkg["snm"] = seller.get("name") or ""
        if not (pkg.get("sadd") or "").strip():
            pkg["sadd"] = seller.get("address") or ""
    return {"size": size, "seller": seller, "packages": packages}


@router.get("/{company_id}/shipping/label/{tracking_id}/pdf")
def label_pdf(company_id: str, tracking_id: str, conn=Depends(db), _svc: bool = Depends(require_service)):
    pdf = _label_pdf_bytes(conn, company_id, tracking_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="label-{tracking_id}.pdf"'},
    )


@router.post("/{company_id}/shipping/labels/zip")
def labels_zip(company_id: str, body: BulkLabelRequest = Body(default=BulkLabelRequest()),
               conn=Depends(db), _svc: bool = Depends(require_service)):
    """One ZIP of label PDFs for the given orders (default: every shipped order
    that has an AWB). Orders whose label cannot be fetched are skipped and
    listed in errors.txt inside the archive rather than failing the whole run."""
    params: list = [company_id]
    id_clause = ""
    if body.orderIds is not None:
        id_clause = "AND (id = ANY(%s) OR order_number::text = ANY(%s))"
        params += [body.orderIds, body.orderIds]
    rows = conn.execute(
        f"""
        SELECT order_number AS "orderNumber", meta->>'awb' AS awb
        FROM ecomm_orders
        WHERE company_id = %s AND (meta->>'awb') IS NOT NULL {id_clause}
        ORDER BY created_at DESC
        """,
        params,
    ).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No shipped orders with a label")

    buf = io.BytesIO()
    errors: list[str] = []
    written = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for r in rows:
            awb = r["awb"]
            name = f"order-{r['orderNumber']}-{awb}.pdf" if r.get("orderNumber") else f"label-{awb}.pdf"
            try:
                zf.writestr(name, _label_pdf_bytes(conn, company_id, awb))
                written += 1
            except HTTPException as exc:
                errors.append(f"{name}: {exc.detail}")
            except Exception as exc:
                errors.append(f"{name}: {exc}")
        if errors:
            zf.writestr("errors.txt", "\n".join(errors))

    if not written:
        raise HTTPException(status_code=502, detail="; ".join(errors) or "No labels could be downloaded")
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="shipping-labels.zip"'},
    )
