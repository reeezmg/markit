"""Ekart HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _ekart_create(gw, body: CreateShipmentRequest):
    resp = httpx.post(
        f"{URLS['ekart']['PROD']}/shipments",
        headers={"x-api-key": gw.get("apiKey", ""), "x-seller-code": gw.get("sellerCode", "")},
        json={
            "orderNumber":    body.orderNumber,
            "consignee":      {"name": body.customerName, "phone": body.customerPhone,
                               "address": body.deliveryAddress, "city": body.deliveryCity,
                               "state": body.deliveryState, "pincode": body.deliveryPincode},
            "paymentMode":    "COD" if body.paymentMethod.upper() == "COD" else "PREPAID",
            "codAmount":      body.codAmount,
            "declaredValue":  body.totalAmount,
            "weight":         body.weight * 1000,
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "ekart", "awb": data.get("awb"), "response": data}

def _ekart_track(gw, awb: str):
    resp = httpx.get(
        f"{URLS['ekart']['PROD']}/shipments/{awb}/track",
        headers={"x-api-key": gw.get("apiKey", "")},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "ekart", "awb": awb, "status": data.get("status"), "tracking": data}


# Uniform operation names; unavailable carrier APIs fail explicitly.
create_shipment = _ekart_create
track = _ekart_track


def get_rates(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until ekart documents this carrier API."""
    raise HTTPException(status_code=501, detail="ekart: create_mps_shipment is not implemented")
