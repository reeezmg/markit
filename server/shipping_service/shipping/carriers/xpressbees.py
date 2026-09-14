"""Xpressbees HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _xpressbees_get_token(gw) -> str:
    resp = httpx.post(
        "https://ship.xpressbees.com/api/users/login",
        json={"email": gw.get("clientId", ""), "password": gw.get("clientSecret", "")},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("data", {}).get("token", "")

def _xpressbees_create(gw, body: CreateShipmentRequest):
    token = _xpressbees_get_token(gw)
    payload = {
        "order_number":    body.orderNumber,
        "shipping_charges": 0,
        "discount":        0,
        "cash_on_delivery": body.codAmount,
        "payment_type":    "cod" if body.paymentMethod.upper() == "COD" else "prepaid",
        "package_weight":  body.weight * 1000,
        "package_length":  body.length,
        "package_breadth": body.width,
        "package_height":  body.height,
        "consignee": {
            "name":    body.customerName,
            "address": body.deliveryAddress,
            "city":    body.deliveryCity,
            "state":   body.deliveryState,
            "pincode": body.deliveryPincode,
            "phone":   body.customerPhone,
        },
        "order_items": [{"name": _item_display_name(i), "qty": i.get("quantity", 1), "price": i.get("price", 0)} for i in body.items],
    }
    resp = httpx.post(
        "https://ship.xpressbees.com/api/shipments2",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "xpressbees", "awb": data.get("data", {}).get("awb_number"), "response": data}

def _xpressbees_track(gw, awb: str):
    token = _xpressbees_get_token(gw)
    resp = httpx.get(
        f"https://ship.xpressbees.com/api/shipments2/track/{awb}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "xpressbees", "awb": awb, "status": data.get("data", {}).get("status"), "tracking": data}


# Uniform operation names; unavailable carrier APIs fail explicitly.
create_shipment = _xpressbees_create
track = _xpressbees_track


def get_rates(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until xpressbees documents this carrier API."""
    raise HTTPException(status_code=501, detail="xpressbees: create_mps_shipment is not implemented")
