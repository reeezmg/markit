"""Shadowfax HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _shadowfax_create(gw, body: CreateShipmentRequest):
    resp = httpx.post(
        f"{URLS['shadowfax']['PROD']}/order/",
        headers={"Authorization": f"Token {gw.get('apiKey', '')}",
                 "Content-Type": "application/json"},
        json={
            "client_order_id": body.orderNumber,
            "client_code":     gw.get("clientCode", ""),
            "deliver_to":      body.customerName,
            "address":         body.deliveryAddress,
            "city":            body.deliveryCity,
            "state":           body.deliveryState,
            "pincode":         body.deliveryPincode,
            "contact":         body.customerPhone,
            "payment_mode":    "COD" if body.paymentMethod.upper() == "COD" else "PREPAID",
            "amount_to_collect": body.codAmount,
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "shadowfax", "orderId": data.get("id"), "trackingId": data.get("tracking_id"), "response": data}

def _shadowfax_track(gw, tracking_id: str):
    resp = httpx.get(
        f"{URLS['shadowfax']['PROD']}/tracking/",
        headers={"Authorization": f"Token {gw.get('apiKey', '')}"},
        params={"order_id": tracking_id},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "shadowfax", "trackingId": tracking_id, "status": data.get("status"), "tracking": data}


# Uniform operation names; unavailable carrier APIs fail explicitly.
create_shipment = _shadowfax_create
track = _shadowfax_track


def get_rates(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until shadowfax documents this carrier API."""
    raise HTTPException(status_code=501, detail="shadowfax: create_mps_shipment is not implemented")
