"""Dunzo HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _dunzo_get_token(gw) -> str:
    env  = gw.get("environment", "PROD")
    base = URLS["dunzo"].get(env, URLS["dunzo"]["PROD"])
    resp = httpx.post(
        f"{base}/token/",
        json={"client_id": gw.get("clientId", ""), "client_secret": gw.get("clientSecret", "")},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("token", {}).get("access_token", "")

def _dunzo_create(gw, body: CreateShipmentRequest):
    token = _dunzo_get_token(gw)
    env   = gw.get("environment", "PROD")
    base  = URLS["dunzo"].get(env, URLS["dunzo"]["PROD"])
    resp = httpx.post(
        f"{base}/task/",
        headers={"Authorization": f"Bearer {token}", "client-id": gw.get("clientId", "")},
        json={
            "request_id":     body.orderNumber,
            "pickup_details": [{"reference_id": body.orderNumber, "address": {"address_line_1": "Store Address"}}],
            "delivery_details": [{"reference_id": body.orderNumber,
                                  "address": {"address_line_1": body.deliveryAddress, "city": body.deliveryCity},
                                  "contact_details": {"name": body.customerName, "phone_number": body.customerPhone}}],
            "payment_method": "CASH" if body.paymentMethod.upper() == "COD" else "ONLINE",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "dunzo", "taskId": data.get("id"), "response": data}

def _dunzo_track(gw, task_id: str):
    token = _dunzo_get_token(gw)
    env   = gw.get("environment", "PROD")
    base  = URLS["dunzo"].get(env, URLS["dunzo"]["PROD"])
    resp = httpx.get(
        f"{base}/task/{task_id}/status/",
        headers={"Authorization": f"Bearer {token}", "client-id": gw.get("clientId", "")},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "dunzo", "taskId": task_id, "status": data.get("state"), "tracking": data}


# Uniform operation names; unavailable carrier APIs fail explicitly.
create_shipment = _dunzo_create
track = _dunzo_track


def get_rates(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until dunzo documents this carrier API."""
    raise HTTPException(status_code=501, detail="dunzo: create_mps_shipment is not implemented")
