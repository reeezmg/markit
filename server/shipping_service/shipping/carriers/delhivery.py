"""
Delhivery carrier integration.

Production API only; Delhivery does not expose a usable sandbox, so there is no
environment toggle. Implements the full capability set: rates, create, track,
cancel, serviceability, update, label, pickup, pickup_location, ndr
(webhook is implemented but disabled for now — see `capabilities`).

NOTE: a few endpoint paths (packing_slip / pickup / clientwarehouse / NDR status
get_bulk_upl) should be confirmed against the seller's Delhivery API contract —
they are all isolated to this file so a path change is a one-line edit.
"""
import json
import re
from typing import Any, Optional

import httpx
from fastapi import HTTPException

import sys

from ._registry import ConfigField, register

BASE = "https://track.delhivery.com"


def _carrier_error(resp: Any, data: Any, fallback: str) -> str:
    """Best-effort human-readable error string from a Delhivery response.

    The storetools proxy only forwards a *string* `detail` cleanly (a dict/list
    becomes a generic "Shipping request failed"), and Delhivery sometimes returns
    `error` as a list — so coerce to a string here or the seller never sees why.
    """
    candidate: Any = None
    if isinstance(data, dict):
        candidate = data.get("error") or data.get("data") or data
    elif data:
        candidate = data
    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip()
    if candidate:
        try:
            return json.dumps(candidate)
        except (TypeError, ValueError):
            return str(candidate)
    return (getattr(resp, "text", "") or "").strip() or fallback


def _edit_result(resp: Any, data: Any, action: str) -> dict:
    """Validate an /api/p/edit response.

    The endpoint answers HTTP 200 even when it refuses the request — the outcome
    is in the body ("status": "Failure" plus an "error" string). Checking only
    the HTTP status reports a failed cancel as a successful one.
    """
    if isinstance(data, dict):
        failed = str(data.get("status", "")).strip().lower() == "failure"
        error = data.get("error") or data.get("remarks")
        if failed or error:
            detail = error if isinstance(error, str) and error.strip() else f"{action} was refused by Delhivery"
            raise HTTPException(status_code=400, detail=detail)
    return {"provider": "delhivery", "success": True, "response": data}


def _form_body(payload: Any) -> str:
    """Delhivery's `format=json&data=<json>` body, unencoded — cmu/create.json ONLY.

    create.json is documented with exactly this shape: the raw string posted
    under Content-Type: application/json.

    Do NOT use it for /api/p/edit (cancel / update) — that endpoint takes a
    plain JSON object. Verified against a fake waybill: this shape returns
    "Enter Waybill/OrderID" (the waybill never reaches the parser), while plain
    JSON returns "Incorrect Waybill/OrderID" and echoes the waybill back.
    """
    return "format=json&data=" + json.dumps(payload)


# Delhivery's own examples post the body above under this content type.
_FORM_HEADERS = {"Content-Type": "application/json"}


# Delhivery wraps real validation failures in stack-trace-ish text and pairs
# them with a generic top-level rmk. Both are unhelpful in front of a seller.
_CRASH_WRAPPER = re.compile(r"Crashing while saving package due to exception\s*'?(?P<inner>.+?)'?\.?\s*(Package might have been partially saved\.?)?$", re.I)
_NON_SERVICEABLE = re.compile(r"(?P<pin>\d{6})\s+is non serviceable pincode", re.I)
_GENERIC_RMK = re.compile(r"internal error has occurred", re.I)


def _humanise(remark: str) -> str:
    """Turn one carrier remark into something a shop operator can act on."""
    text = str(remark or "").strip()
    m = _CRASH_WRAPPER.match(text)
    if m:
        text = m.group("inner").strip()
    m = _NON_SERVICEABLE.search(text)
    if m:
        return f"Pincode {m.group('pin')} is not serviceable by Delhivery"
    return text


def _create_error(resp: Any, data: Any, fallback: str) -> str:
    """Why create.json rejected a shipment.

    create.json answers HTTP 200 even when it rejects every shipment — the
    reason sits in packages[].remarks and the top-level `rmk`, not in the status
    code, and neither is where `_carrier_error` looks.
    """
    parts: list[str] = []
    if isinstance(data, dict):
        for pkg in (data.get("packages") or []):
            if not isinstance(pkg, dict):
                continue
            remarks = pkg.get("remarks")
            if not isinstance(remarks, (list, tuple)):
                remarks = [remarks] if str(remarks or "").strip() else []
            parts += [h for h in (_humanise(r) for r in remarks) if h]
        rmk = str(data.get("rmk") or "").strip()
        # The generic "contact support" rmk only adds noise next to a real remark.
        if rmk and not (parts and _GENERIC_RMK.search(rmk)):
            parts.append(rmk)
    seen: set[str] = set()
    unique = [p for p in parts if not (p in seen or seen.add(p))]
    if unique:
        return "; ".join(unique)
    return _carrier_error(resp, data, fallback)


id = "delhivery"

label = "Delhivery"

type = "Direct Carrier"

capabilities = {"rates", "create", "track", "cancel",
                "serviceability", "update", "label", "pickup",
                "pickup_location", "ndr", "mps", "reverse", "exchange",
                "ewaybill"}

config_fields = [
    ConfigField("apiToken", "API Token", type="password",
                help="Merchant portal → API Access"),
    ConfigField("warehouseCode", "Warehouse Code",
                placeholder="Optional — multi-warehouse only"),
]

WAYBILL_BATCH = 50

EDITABLE_STATUSES = ("manifested", "in transit", "pending", "scheduled")

NDR_ACTIONS = ("RE-ATTEMPT", "PICKUP_RESCHEDULE")

NDR_REATTEMPT_NSL = ("EOD-74", "EOD-15", "EOD-104", "EOD-43",
                     "EOD-86", "EOD-11", "EOD-69", "EOD-6")

NDR_RESCHEDULE_NSL = ("EOD-777", "EOD-21")


def _auth(creds: dict) -> dict:
    return {"Authorization": f"Token {creds.get('apiToken', '')}"}


def test_connection(creds: dict) -> dict:
    resp = httpx.get(
        f"{BASE}/api/p/edit/",
        headers={**_auth(creds), "Accept": "application/json"},
        timeout=15,
    )
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=400, detail="Invalid Delhivery API token")
    return {"ok": True, "message": "Delhivery token verified"}


def get_rates(creds: dict, pickup: str, delivery: str,
              weight: float, cod: float) -> dict:
    # Delhivery "Invoice Charges" API. cgm = chargeable weight in grams,
    # md = mode (S surface / E express), pt = payment type.
    resp = httpx.get(
        f"{BASE}/api/kinko/v1/invoice/charges/.json",
        headers=_auth(creds),
        params={"md": "S", "cgm": int(weight * 1000), "o_pin": pickup,
                "d_pin": delivery, "ss": "Delivered",
                "pt": "COD" if cod and float(cod) > 0 else "Pre-paid",
                "cod": cod},
        timeout=15,
    )
    resp.raise_for_status()
    return {"provider": id, "rates": resp.json()}


def create_shipment(creds: dict, body: Any, pickup_pincode: str) -> dict:
    # Prefer the registered pickup-location name passed from storetools; fall
    # back to the legacy warehouseCode config for backward compatibility.
    # The registered warehouse name is matched exactly by Delhivery, and a
    # stray space is enough to miss it ("ClientWarehouse matching query does
    # not exist"), so never send an untrimmed name.
    pickup_name = (getattr(body, "pickupLocation", "") or creds.get("warehouseCode", "")).strip()
    shipment = {
        "name":          _clean(body.customerName),
        "phone":         body.customerPhone,
        "add":           _clean(body.deliveryAddress),
        "city":          _clean(body.deliveryCity),
        "state":         _clean(body.deliveryState),
        "pin":           body.deliveryPincode,
        "country":       body.deliveryCountry,
        "payment_mode":  "COD" if body.paymentMethod.upper() == "COD" else "Prepaid",
        "cod_amount":    body.codAmount,
        "order":         body.orderNumber,
        "total_amount":  body.totalAmount,
        # Delhivery weights are grams; cartonization works in kg.
        "weight":        int(round(float(body.weight or 0) * 1000)) or 1,
        "seller_inv":    body.orderNumber,
        "quantity":      sum(int(i.get("quantity", 1)) for i in body.items),
        "pickup_location": pickup_name,
    }
    # Printed on the label so whoever packs or carries the parcel can see
    # what is in it.
    desc = _clean(getattr(body, "productsDesc", "") or "")[:200]
    if desc:
        shipment["products_desc"] = desc
    # Without these the label's Seller block shows the raw client code.
    seller_name = _clean(getattr(body, "sellerName", "") or "")
    if seller_name:
        shipment["seller_name"] = seller_name
    seller_add = _clean(getattr(body, "sellerAddress", "") or "")
    if seller_add:
        shipment["seller_add"] = seller_add
    # Documented optional fields — cartonization already knows the box, so
    # send its dimensions rather than letting the carrier guess.
    for src, dst in (("length", "shipment_length"), ("width", "shipment_width"),
                     ("height", "shipment_height")):
        val = getattr(body, src, None)
        if val not in (None, ""):
            shipment[dst] = val
    # Consignments over Rs 50,000 need an e-way bill. Sending it with the
    # manifest is cleaner than patching it on afterwards.
    ewbn = getattr(body, "ewaybillNumber", None)
    if ewbn:
        shipment["ewbn"] = str(ewbn)
    hsn = getattr(body, "hsnCode", None)
    if hsn:
        shipment["hsn_code"] = str(hsn)
    # An empty `client` makes Delhivery drop the shipment silently and answer
    # "shipment list contains no data" — omit it unless it is actually set.
    client = (creds.get("warehouseCode") or "").strip()
    if client:
        shipment["client"] = client
    payload = {
        "shipments": [shipment],
        "pickup_location": {"name": pickup_name} if pickup_name else {},
    }
    resp = httpx.post(
        f"{BASE}/api/cmu/create.json",
        headers={**_auth(creds), **_FORM_HEADERS},
        content=_form_body(payload),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    packages = data.get("packages", [{}])
    pkg = packages[0] if packages else {}
    if not pkg.get("waybill"):
        raise HTTPException(status_code=400,
                            detail=_create_error(resp, data, "Delhivery rejected the shipment"))
    return {
        "provider":   id,
        "awb":        pkg.get("waybill"),
        "refNumber":  pkg.get("refnum"),
        "status":     pkg.get("status"),
        "remarks":    pkg.get("remarks"),
    }


def _clean(value) -> str:
    # The create.json payload rejects these special characters outright.
    s = str(value or "")
    for ch in '&#%;\\':
        s = s.replace(ch, " ")
    return " ".join(s.split())


def create_reverse_shipment(creds: dict, body: Any) -> dict:
    """Reverse pickup (RVP) — same create.json API with payment_mode 'Pickup'.

    With 'Pickup', the consignee fields are treated as the PICKUP point (the
    customer returning the goods) and the return_* fields define the drop /
    delivery address (the seller's warehouse). pickup_location must still be
    a registered warehouse name.
    """
    return _create_customer_flow_shipment(creds, body, "Pickup")


def create_exchange_shipment(creds: dict, body: Any) -> dict:
    """Exchange (REPL) — one waybill for the whole journey: the replacement
    is picked from pickup_location, delivered to the customer (the consignee
    = exchange location), the old item is collected there, and finally
    delivered to return_* (falls back to pickup_location if omitted)."""
    return _create_customer_flow_shipment(creds, body, "REPL")


def _create_customer_flow_shipment(creds: dict, body: Any, payment_mode: str) -> dict:
    pickup_name = (getattr(body, "pickupLocation", "") or creds.get("warehouseCode", "")).strip()
    shipment = {
        "name":          _clean(body.customerName),
        "phone":         body.customerPhone,
        "add":           _clean(body.customerAddress),
        "city":          _clean(body.customerCity),
        "state":         _clean(body.customerState),
        "pin":           body.customerPincode,
        "country":       body.customerCountry or "India",
        "order":         body.orderNumber,       # must be unique per shipment
        "payment_mode":  payment_mode,           # "Pickup" (RVP) / "REPL" (exchange)
        "cod_amount":    0,
        "total_amount":  body.totalAmount,
        "products_desc": _clean(body.productsDesc)[:200],
        "quantity":      body.quantity,
        "return_name":    _clean(body.returnName),
        "return_phone":   body.returnPhone,
        "return_add":     _clean(body.returnAddress),
        "return_city":    _clean(body.returnCity),
        "return_state":   _clean(body.returnState),
        "return_country": body.returnCountry or "India",
        "return_pin":     body.returnPincode,
        "pickup_location": pickup_name,
    }
    client = (creds.get("warehouseCode") or "").strip()
    if client:
        shipment["client"] = client
    if getattr(body, "weight", None):
        shipment["weight"] = body.weight          # grams
    payload = {
        "shipments": [shipment],
        "pickup_location": {"name": pickup_name} if pickup_name else {},
    }
    resp = httpx.post(
        f"{BASE}/api/cmu/create.json",
        headers={**_auth(creds), **_FORM_HEADERS},
        content=_form_body(payload),
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    packages = data.get("packages", [{}])
    pkg = packages[0] if packages else {}
    if not pkg.get("waybill"):
        label = "Reverse" if payment_mode == "Pickup" else "Exchange"
        raise HTTPException(status_code=400,
                            detail=_carrier_error(resp, data, f"{label} shipment creation failed"))
    return {
        "provider":  id,
        "awb":       pkg.get("waybill"),
        "refNumber": pkg.get("refnum"),
        "status":    pkg.get("status"),
        "remarks":   pkg.get("remarks"),
    }


def fetch_waybills(creds: dict, count: int = 1) -> list[str]:
    """Fetch `count` waybills from the carrier.

    Delhivery documents the token as a query parameter here (unlike every
    other endpoint, which uses the Authorization header) — send both so it
    works either way. Max 10,000 per call; 5 calls per 5 minutes.
    """
    resp = httpx.get(
        f"{BASE}/waybill/api/bulk/json/",
        headers={**_auth(creds), "Accept": "application/json"},
        params={"count": count, "token": creds.get("apiToken", "")},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, str):
        return [w.strip() for w in data.split(",") if w.strip()]
    if isinstance(data, list):
        return [str(w).strip() for w in data if str(w).strip()]
    return []


def create_mps_shipment(creds: dict, body: Any, boxes: list[dict], pickup_pincode: str,
                        waybills: Optional[list[str]] = None) -> dict:
    """Multi-Piece Shipment: one order across N boxes, each its own waybill,
    the first designated as master. `body.weight` is the total (product+box) kg.

    `waybills` should come from the caller's pool — Delhivery advises against
    using freshly fetched waybills straight away. Fetching here is only a
    fallback for callers that have no pool.
    """
    pickup_name = (getattr(body, "pickupLocation", "") or creds.get("warehouseCode", "")).strip()
    client = (creds.get("warehouseCode") or "").strip()
    n = len(boxes)
    waybills = list(waybills or []) or fetch_waybills(creds, n)
    if len(waybills) < n:
        raise HTTPException(status_code=400, detail="Could not fetch enough waybills for MPS")
    waybills = waybills[:n]
    master = waybills[0]
    is_cod = str(body.paymentMethod).upper() == "COD"
    box_tare = sum(float(b.get("weight") or 0) for b in boxes)
    product_weight = max(float(getattr(body, "weight", 0) or 0) - box_tare, 0)
    per_box_product = product_weight / n if n else 0
    qty = sum(int(i.get("quantity", 1)) for i in body.items) if body.items else n
    desc = ", ".join(i.get("name", "Item") for i in body.items)[:200]
    shipments = []
    for idx, box in enumerate(boxes):
        box_g = int(round(((float(box.get("weight") or 0)) + per_box_product) * 1000)) or 1
        shipments.append({
            "name": body.customerName, "add": body.deliveryAddress, "pin": body.deliveryPincode,
            "city": body.deliveryCity, "state": body.deliveryState, "country": body.deliveryCountry,
            "phone": body.customerPhone, "order": str(body.orderNumber),
            "payment_mode": "COD" if is_cod else "Prepaid",
            "cod_amount": body.codAmount if (is_cod and idx == 0) else 0,
            "total_amount": body.totalAmount,
            "waybill": waybills[idx], "master_id": master,
            "mps_children": n, "mps_amount": (body.codAmount if is_cod else 0),
            "shipment_type": "MPS", "weight": box_g,
            "shipment_length": box.get("length"), "shipment_width": box.get("width"),
            "shipment_height": box.get("height"),
            "products_desc": desc, "quantity": qty, "shipping_mode": "Surface",
            "seller_inv": str(body.orderNumber),
            "seller_name": _clean(getattr(body, "sellerName", "") or "") or pickup_name,
            "pickup_location": pickup_name,
            **({"client": client} if client else {}),
        })
    payload = {"pickup_location": {"name": pickup_name} if pickup_name else {}, "shipments": shipments}
    resp = httpx.post(
        f"{BASE}/api/cmu/create.json",
        headers={**_auth(creds), **_FORM_HEADERS},
        content=_form_body(payload),
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    # The waybills were prefetched, so they exist regardless of the outcome —
    # only the echoed packages tell us whether Delhivery accepted them.
    accepted = {str(p.get("waybill")) for p in (data.get("packages") or [])
                if isinstance(p, dict) and p.get("waybill")}
    if master not in accepted:
        raise HTTPException(status_code=400,
                            detail=_create_error(resp, data, "Delhivery rejected the MPS shipment"))
    return {"provider": id, "awb": master,
            "childAwbs": [w for w in waybills[1:] if w in accepted],
            "waybills": waybills, "boxCount": n, "status": "Manifested", "response": data}


def track(creds: dict, tracking_id: str) -> dict:
    resp = httpx.get(
        f"{BASE}/api/v1/packages/json/",
        headers=_auth(creds),
        params={"waybill": tracking_id},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    pkg = (data.get("ShipmentData") or [{}])[0].get("Shipment", {})
    return {
        "provider": id,
        "awb":      tracking_id,
        "status":   pkg.get("Status", {}).get("Status"),
        "tracking": data,
    }


def track_bulk(creds: dict, tracking_ids: list[str]) -> dict:
    # Delhivery's track API accepts up to 50 comma-separated waybills in one
    # call and returns a ShipmentData entry per waybill. Besides the forward
    # status, each entry's Status carries the NSL StatusCode — the NDR
    # signal (EOD-* = failed attempt / cancelled pickup) that drives the
    # re-attempt / pickup-reschedule actions in the orders page. NOTE:
    # StatusType 'UD' alone is NOT an NDR indicator (a freshly manifested
    # shipment is also 'UD'); only the NSL code is.
    if not tracking_ids:
        return {}
    resp = httpx.get(
        f"{BASE}/api/v1/packages/json/",
        headers=_auth(creds),
        params={"waybill": ",".join(tracking_ids)},
        timeout=25,
    )
    resp.raise_for_status()
    data = resp.json()
    out: dict[str, dict] = {}
    for entry in data.get("ShipmentData") or []:
        shipment = entry.get("Shipment", {}) or {}
        awb = str(shipment.get("AWB") or shipment.get("Waybill") or "")
        if not awb:
            continue
        status = shipment.get("Status") or {}
        raw = status.get("Status")
        stype = str(status.get("StatusType") or "").upper()
        nsl = str(status.get("StatusCode") or status.get("NSLCode") or "").upper()
        # EOD-38 means delivered to consignee, not a failed delivery attempt.
        if nsl == "EOD-38":
            nsl = ""
        eod_scans = [
            code for s in (shipment.get("Scans") or [])
            if (code := str((s.get("ScanDetail") or {}).get("StatusCode") or "").upper()).startswith("EOD-")
            and code != "EOD-38"
        ]
        # Failed delivery attempts so far — one EOD-* scan per attempt.
        attempts = len(eod_scans)
        # Fallback: some responses keep a non-EOD code in Status while the
        # shipment sits undelivered — take the NSL from the latest EOD scan
        # then. Guarded to undelivered/pending states so a shipment back out
        # for delivery after an NDR is not re-flagged from old scans.
        if not nsl.startswith("EOD-") and eod_scans and any(
                k in str(raw or "").lower() for k in ("pending", "undelivered", "not delivered")):
            nsl = eod_scans[-1]
        canonical = canonical_status(raw, stype) if raw else None
        # Belt-and-braces: shipments flagged as reversing whose StatusType
        # didn't say so (e.g. RT missing on an old scan shape).
        if canonical in (None, "SHIPPED") and (
                shipment.get("ReverseInTransit") or shipment.get("RTOStartedDate")):
            canonical = "RTO"
        out[awb] = {
            "status": canonical,
            "rawStatus": raw,
            "statusType": stype or None,
            "nslCode": nsl or None,
            "instructions": status.get("Instructions"),
            "ndrAttempts": attempts,
        }
    return out


def cancel(creds: dict, body: Any) -> dict:
    resp = httpx.post(
        f"{BASE}/api/p/edit",
        headers={**_auth(creds), "Accept": "application/json",
                 "Content-Type": "application/json"},
        # Plain JSON — NOT the `format=json&data=` shape create.json uses.
        # Wrapped that way, Delhivery parses the form, finds no `waybill` key
        # and answers "Enter Waybill/OrderID". The docs' own example is a
        # bare JSON object, and `cancellation` is documented as a string.
        json={"waybill": str(body.awb), "cancellation": "true"},
        timeout=15,
    )
    resp.raise_for_status()
    return _edit_result(resp, resp.json() if resp.content else {}, "Cancellation")


def _yn(value) -> bool:
    return str(value).strip().upper() in ("Y", "YES", "TRUE", "1")


def serviceability(creds: dict, pincode: str) -> dict:
    resp = httpx.get(
        f"{BASE}/c/api/pin-codes/json/",
        headers=_auth(creds),
        params={"filter_codes": pincode},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    codes = data.get("delivery_codes") or []
    info = (codes[0].get("postal_code") if codes else {}) or {}
    serviceable = bool(codes)
    return {
        "provider":    id,
        "pincode":     str(pincode),
        "serviceable": serviceable,
        "prepaid":     _yn(info.get("pre_paid")),
        "cod":         _yn(info.get("cod")),
        "pickup":      _yn(info.get("pickup")),
        "remarks":     info.get("remarks") or ("" if serviceable else "Pincode not serviceable"),
    }


def update_shipment(creds: dict, body: Any) -> dict:
    # Only the parameters below are editable. Notably `pin` is NOT among
    # them — a pincode correction needs a cancel + recreate.
    fields = {"waybill": body.awb}
    for src, dst in (("name", "name"), ("phone", "phone"),
                     ("address", "add"), ("productsDesc", "products_desc"),
                     ("length", "shipment_length"), ("width", "shipment_width"),
                     ("height", "shipment_height")):
        val = getattr(body, src, None)
        if val not in (None, ""):
            fields[dst] = val
    # Delhivery takes the edited weight in grams, under `gm`.
    weight = getattr(body, "weight", None)
    if weight not in (None, ""):
        fields["gm"] = int(round(float(weight) * 1000)) or 1
    # Payment-mode switch. COD needs an amount; the carrier rejects same-to-same.
    mode = (getattr(body, "paymentMode", None) or "").strip()
    if mode:
        fields["pt"] = "COD" if mode.upper() == "COD" else "Pre-paid"
        if fields["pt"] == "COD":
            cod = getattr(body, "codAmount", None)
            if cod in (None, ""):
                raise HTTPException(status_code=400,
                                    detail="Switching to COD requires a COD amount")
            fields["cod"] = cod
    if len(fields) == 1:
        raise HTTPException(status_code=400, detail="Nothing to update")
    resp = httpx.post(
        f"{BASE}/api/p/edit",
        headers={**_auth(creds), "Accept": "application/json",
                 "Content-Type": "application/json"},
        json=fields,          # plain JSON, same as cancellation above
        timeout=15,
    )
    resp.raise_for_status()
    return _edit_result(resp, resp.json() if resp.content else {}, "Update")


def update_ewaybill(creds: dict, awb: str, dcn: str, ewbn: str) -> dict:
    """Attach an e-waybill number to an existing shipment.

    Indian law requires an e-way bill for consignments over Rs 50,000. The
    number is issued by the government GST portal, not by us or the carrier —
    the seller generates it there and it is recorded against the waybill here.

    Delhivery updates the forward e-waybill while the shipment is on its way
    out, and the return e-waybill once it is coming back.
    """
    resp = httpx.put(
        f"{BASE}/api/rest/ewaybill/{awb}/",
        headers={**_auth(creds), "Content-Type": "application/json",
                 "Accept": "application/json"},
        json={"data": [{"dcn": str(dcn), "ewbn": str(ewbn)}]},
        timeout=20,
    )
    data = resp.json() if resp.content else {}
    # Like the rest of Delhivery's API, a refusal can arrive as HTTP 200 with
    # an error in the body — never report that as a success.
    failed = isinstance(data, dict) and (
        data.get("success") is False
        or str(data.get("status", "")).strip().lower() == "failure"
        or data.get("error"))
    if resp.status_code >= 300 or failed:
        raise HTTPException(status_code=400,
                            detail=_carrier_error(resp, data, "Failed to update the e-waybill"))
    return {"provider": id, "awb": str(awb), "ewbn": str(ewbn),
            "dcn": str(dcn), "success": True, "response": data}


def generate_label(creds: dict, awb: str, pdf_size: str = "A4") -> dict:
    resp = httpx.get(
        f"{BASE}/api/p/packing_slip",
        headers={**_auth(creds), "Accept": "application/json"},
        params={"wbns": awb, "pdf": "true", "pdf_size": pdf_size or "A4"},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    pkgs = data.get("packages") or []
    pkg = pkgs[0] if pkgs else {}
    label_url = pkg.get("pdf_download_link") or data.get("pdf_download_link")
    return {"provider": id, "awb": str(awb), "labelUrl": label_url, "raw": data}


def label_data(creds: dict, awbs: list[str], pdf_size: str = "A4") -> list[dict]:
    """Raw label data (pdf=false) so the label can be laid out by us.

    Delhivery's own PDF cannot be customised — it prints the client code
    ("8e7348-TheHijabCart-do") rather than the trading name, and its layout
    is fixed. With pdf=false the same endpoint returns the underlying data,
    including a ready-made base64 Code-128 barcode image, so the label can
    be rendered however we like.
    """
    if not awbs:
        return []
    resp = httpx.get(
        f"{BASE}/api/p/packing_slip",
        headers={**_auth(creds), "Accept": "application/json"},
        params={"wbns": ",".join(str(a) for a in awbs), "pdf": "false",
                "pdf_size": pdf_size or "A4"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    packages = data.get("packages") or []
    if not packages:
        raise HTTPException(status_code=404,
                            detail=_carrier_error(resp, data, "No label data for that waybill"))
    return packages


def generate_labels_bulk(creds: dict, awbs: list[str], pdf_size: str = "A4") -> dict:
    """{awb: labelUrl} for many waybills in one call (packing_slip accepts
    comma-separated wbns)."""
    if not awbs:
        return {}
    resp = httpx.get(
        f"{BASE}/api/p/packing_slip",
        headers={**_auth(creds), "Accept": "application/json"},
        params={"wbns": ",".join(str(a) for a in awbs), "pdf": "true", "pdf_size": pdf_size or "A4"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    out: dict[str, str] = {}
    for pkg in data.get("packages") or []:
        wbn = str(pkg.get("wbn") or pkg.get("waybill") or "")
        link = pkg.get("pdf_download_link")
        if wbn and link:
            out[wbn] = link
    if not out and len(awbs) == 1 and data.get("pdf_download_link"):
        out[str(awbs[0])] = data["pdf_download_link"]
    return out


def create_pickup(creds: dict, body: Any) -> dict:
    resp = httpx.post(
        f"{BASE}/fm/request/new/",
        headers={**_auth(creds), "Content-Type": "application/json"},
        json={
            # Matched exactly against the registered warehouse name — a stray
            # space is enough to miss it, same as on create.json.
            "pickup_location":        (body.pickupLocation or "").strip(),
            "pickup_date":            body.pickupDate,
            "pickup_time":            body.pickupTime,
            "expected_package_count": body.expectedPackageCount,
        },
        timeout=20,
    )
    data = resp.json() if resp.content else {}
    # Delhivery rejects with a 4xx (or 200 carrying an error payload) when the
    # pickup_location is not a registered warehouse name, the date is invalid,
    # or a request already exists for that slot. Surface that reason instead of
    # letting raise_for_status() bubble up as an opaque 500.
    ok = resp.status_code < 300 and not (isinstance(data, dict) and data.get("success") is False)
    if not ok:
        raise HTTPException(status_code=400,
                            detail=_carrier_error(resp, data, "Failed to create pickup request"))
    return {"provider": id, "success": True,
            "pickupId": data.get("pickup_id"), "response": data}


def register_pickup_location(creds: dict, body: Any) -> dict:
    payload = {
        "name":           (body.name or "").strip(),
        "email":          body.email or "",
        "phone":          body.phone or "",
        "address":        body.address or "",
        "city":           body.city or "",
        "country":        body.country or "India",
        "pin":            body.pincode or "",
        "return_address": body.returnAddress or body.address or "",
        "return_pin":     body.returnPincode or body.pincode or "",
        "return_city":    body.returnCity or body.city or "",
        "return_state":   body.returnState or body.state or "",
        "return_country": body.returnCountry or body.country or "India",
    }
    resp = httpx.post(
        f"{BASE}/api/backend/clientwarehouse/create/",
        headers={**_auth(creds), "Accept": "application/json",
                 "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    data = resp.json() if resp.content else {}
    # Delhivery's create endpoint always returns {"success": true, ...} on a
    # real registration. Treat anything else (non-2xx, missing/false success,
    # empty body) as a failure — otherwise the location is marked registered
    # locally while no warehouse actually exists on Delhivery.
    ok = resp.status_code < 300 and isinstance(data, dict) and data.get("success") is True
    if not ok:
        raise HTTPException(status_code=400,
                            detail=_carrier_error(resp, data, "Failed to register pickup location"))
    return {"provider": id, "registered": True, "carrierMeta": data}


def update_pickup_location(creds: dict, body: Any) -> dict:
    # The edit endpoint accepts ONLY name, address, pin, phone and rejects any
    # other key ("random key-value pairs are not allowed"). The warehouse name
    # itself cannot be changed — it only identifies which warehouse to edit.
    payload = {
        "name":    (body.name or "").strip(),
        "address": body.address or "",
        "pin":     body.pincode or "",
        "phone":   body.phone or "",
    }
    resp = httpx.post(
        f"{BASE}/api/backend/clientwarehouse/edit/",
        headers={**_auth(creds), "Accept": "application/json",
                 "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    data = resp.json() if resp.content else {}
    ok = resp.status_code < 300 and not (isinstance(data, dict) and data.get("success") is False)
    if not ok:
        raise HTTPException(status_code=400,
                            detail=_carrier_error(resp, data, "Failed to update pickup location"))
    return {"provider": id, "registered": True, "carrierMeta": data}


def ndr_action(creds: dict, body: Any) -> dict:
    action = (body.action or "").strip().upper()
    if action not in NDR_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Delhivery NDR supports only: {', '.join(NDR_ACTIONS)}")
    # The NDR API accepts ONLY waybill + act — no address/remarks fields.
    item = {"waybill": body.awb, "act": action}
    if getattr(body, "extra", None):
        item.update(body.extra)
    resp = httpx.post(
        f"{BASE}/api/p/update",
        headers={**_auth(creds), "Accept": "application/json",
                 "Content-Type": "application/json"},
        json={"data": [item]},
        timeout=20,
    )
    data = resp.json() if resp.content else {}
    if resp.status_code >= 300:
        raise HTTPException(status_code=400,
                            detail=_carrier_error(resp, data, "NDR action failed"))
    upl = None
    if isinstance(data, dict):
        upl = data.get("request_id") or data.get("upl_id") or data.get("UPL")
    return {"provider": id, "success": True, "uplId": upl, "response": data}


def ndr_status(creds: dict, upl_id: str) -> dict:
    # Status of an async NDR request by its UPL ID.
    resp = httpx.get(
        f"{BASE}/api/cmu/get_bulk_upl/{upl_id}",
        params={"verbose": "true"},
        headers={**_auth(creds), "Accept": "application/json"},
        timeout=20,
    )
    data = resp.json() if resp.content else {}
    if resp.status_code >= 300:
        raise HTTPException(status_code=400,
                            detail=_carrier_error(resp, data, "NDR status lookup failed"))
    return {"provider": id, "uplId": upl_id, "response": data}


def verify_webhook(creds: dict, payload: dict) -> bool:
    # Delhivery does not sign webhooks. If the seller configured a shared
    # secret (stored as `webhookToken`), require the carrier to echo it back
    # in the registered URL/payload; otherwise accept.
    secret = creds.get("webhookToken")
    if not secret:
        return True
    return payload.get("token") == secret


def normalize_status(raw_status: str) -> Optional[str]:
    """Text-only fallback mapping onto the Markit vocabulary. Prefer
    canonical_status() with the StatusType — several words are ambiguous
    without it ("In Transit" runs on both the forward and the return leg)."""
    s = (raw_status or "").strip().lower()
    if not s:
        return None
    # RTO first: "RTO Delivered" must not read as customer-DELIVERED.
    if "rto" in s:
        return "RTO_DELIVERED" if "delivered" in s else "RTO"
    # DTO = the reverse shipment reached the seller.
    if "dto" in s:
        return "RETURNED"
    # Check before "delivered" — "undelivered" contains it.
    if any(k in s for k in ("undelivered", "not delivered", "failed delivery")):
        return "UNDELIVERED"
    if "delivered" in s:
        return "DELIVERED"
    if "out for delivery" in s:
        return "OUT_FOR_DELIVERY"
    # Official vocabulary: "Dispatched" = handed to the field executive for
    # the final leg (delivery / customer pickup), not mid-transit.
    if "dispatched" in s:
        return "OUT_FOR_DELIVERY"
    # Manifested and Not Picked are different situations: the first is
    # waiting for its first pickup, the second was missed by one.
    if "not picked" in s:
        return "NOT_PICKED"
    if "manifested" in s:
        return "MANIFESTED"
    if any(k in s for k in ("in transit", "in-transit")):
        return "SHIPPED"
    if any(k in s for k in ("picked up", "pickup complete", "out for pickup picked")):
        return "PICKED"
    if "cancel" in s:
        return "CANCELLED"
    return None     # unknown carrier wording — the caller keeps the raw text


def canonical_status(raw_status: str, status_type: str = "") -> Optional[str]:
    """Official Delhivery vocabulary — StatusType is the leg, Status the step.

    UD forward (Manifested/Not Picked/In Transit/Pending/Dispatched)
    RT return-to-origin leg (In Transit/Pending/Dispatched)
    PP reverse, before pickup (Open/Scheduled/Dispatched)
    PU reverse, picked up (In Transit/Pending/Dispatched)
    DL terminal: Delivered (forward) / RTO (back at origin) / DTO (reverse done)
    CN cancelled (reverse pickup cancelled before collection)
    """
    s = (raw_status or "").strip().lower()
    st = (status_type or "").strip().upper()
    if st == "DL":
        if "rto" in s:
            return "RTO_DELIVERED"          # forward shipment back at origin
        if "dto" in s:
            return "RETURNED"               # reverse shipment received by the seller
        return "DELIVERED"
    if st == "RT":
        return "RTO_DELIVERED" if ("delivered" in s and "undelivered" not in s) else "RTO"
    if st == "PP":
        return "OUT_FOR_PICKUP" if "dispatched" in s else "PICKUP_SCHEDULED"
    if st == "PU":
        return "RETURNING"                  # collected from the customer, heading back
    if st == "CN":
        return "CANCELLED"
    if st == "UD":
        # A failed attempt is the one state we must never let fall through to
        # a stale local status — it is the one that needs the seller to act.
        if any(k in s for k in ("undelivered", "not delivered", "failed delivery")):
            return "UNDELIVERED"
        if "pending" in s:
            return "SHIPPED"                # reached destination city, awaiting dispatch
    return normalize_status(raw_status)


def _extract(payload: dict):
    """(awb, raw_status, status_obj) from either webhook payload shape."""
    shipment = payload.get("Shipment") or {}
    if not shipment:
        data = payload.get("ShipmentData") or []
        if data:
            shipment = data[0].get("Shipment", {}) or {}
    awb = (payload.get("waybill") or payload.get("Waybill") or payload.get("awb")
           or shipment.get("AWB") or shipment.get("Waybill"))
    status_obj = shipment.get("Status")
    if isinstance(status_obj, dict):
        raw_status = status_obj.get("Status")
    else:
        raw_status = payload.get("status") or payload.get("Status") or status_obj
        status_obj = {}
    return awb, raw_status, (status_obj or {})


def parse_webhook(payload: dict) -> Optional[dict]:
    awb, raw_status, status_obj = _extract(payload)
    if not awb or not raw_status:
        return None
    canonical = canonical_status(raw_status, status_obj.get("StatusType"))
    if not canonical:
        return None
    return {"provider": id, "trackingId": str(awb),
            "status": canonical, "rawStatus": str(raw_status)}


def parse_ndr(payload: dict) -> Optional[dict]:
    # Delhivery flags a failed delivery with StatusType 'UD' (undelivered) and
    # carries a human reason in Instructions / NSLCode. Detect it so the seller
    # can re-attempt, defer, or RTO.
    awb, raw_status, status_obj = _extract(payload)
    if not awb:
        return None
    status_type = str(status_obj.get("StatusType") or payload.get("StatusType") or "").upper()
    text = str(raw_status or "").lower()
    is_ndr = status_type == "UD" or any(
        k in text for k in ("undelivered", "not delivered", "ndr", "failed delivery"))
    if not is_ndr:
        return None
    nsl = (status_obj.get("NSLCode") or status_obj.get("StatusCode")
           or payload.get("NSLCode") or "")
    reason = (status_obj.get("Instructions") or nsl
              or payload.get("Instructions") or raw_status or "Delivery attempt failed")
    return {"provider": id, "trackingId": str(awb),
            "reason": str(reason), "statusType": status_type or "UD",
            "nslCode": str(nsl) if nsl else None}


register(sys.modules[__name__])
