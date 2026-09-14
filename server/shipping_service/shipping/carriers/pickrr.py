"""Pickrr HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _pickrr_create(gw, body: CreateShipmentRequest):
    resp = httpx.post(
        f"{URLS['pickrr']['PROD']}/shipment/create/",
        json={
            "auth_token":    gw.get("authToken", ""),
            "item_name":     ", ".join(_item_display_name(i) for i in body.items),
            "from_name":     "Store",
            "from_pincode":  gw.get("facilityCode", ""),
            "to_name":       body.customerName,
            "to_pincode":    body.deliveryPincode,
            "to_city":       body.deliveryCity,
            "to_state":      body.deliveryState,
            "to_address":    body.deliveryAddress,
            "to_phone_number": body.customerPhone,
            "quantity":      sum(int(i.get("quantity", 1)) for i in body.items),
            "invoice_value": body.totalAmount,
            "payment_mode":  "COD" if body.paymentMethod.upper() == "COD" else "PREPAID",
            "cod_amount":    body.codAmount,
            "weight":        body.weight,
            "client_order_id": body.orderNumber,
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "pickrr", "trackingId": data.get("tracking_id"), "awb": data.get("awb"), "response": data}

def _pickrr_track(gw, tracking_id: str):
    resp = httpx.get(
        f"{URLS['pickrr']['PROD']}/shipment/track/",
        params={"p_token": gw.get("authToken", ""), "tracking_id": tracking_id},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "pickrr", "trackingId": tracking_id, "status": data.get("current_status"), "tracking": data}


# Uniform operation names; unavailable carrier APIs fail explicitly.
create_shipment = _pickrr_create
track = _pickrr_track


def get_rates(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until pickrr documents this carrier API."""
    raise HTTPException(status_code=501, detail="pickrr: create_mps_shipment is not implemented")
