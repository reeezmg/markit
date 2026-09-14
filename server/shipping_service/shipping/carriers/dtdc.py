"""Dtdc HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _dtdc_create(gw, body: CreateShipmentRequest):
    resp = httpx.post(
        f"{URLS['dtdc']['PROD']}/service_type.json",
        json={
            "customerCode":   gw.get("customerCode", ""),
            "apiKey":         gw.get("apiKey", ""),
            "refNo":          body.orderNumber,
            "addType":        "D",
            "consignee":      body.customerName,
            "address":        body.deliveryAddress,
            "pinCode":        body.deliveryPincode,
            "city":           body.deliveryCity,
            "state":          body.deliveryState,
            "mobile":         body.customerPhone,
            "amt":            body.codAmount,
            "pdtType":        "NON-DOCUMENT",
            "shipType":       "COD" if body.paymentMethod.upper() == "COD" else "PREPAID",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "dtdc", "trackingNo": data.get("trackingNo"), "response": data}

def _dtdc_track(gw, awb: str):
    resp = httpx.get(
        f"{URLS['dtdc']['PROD']}/track.json",
        params={"customerCode": gw.get("customerCode", ""), "trackType": "S", "trackVal": awb},
        timeout=15,
    )
    resp.raise_for_status()
    return {"provider": "dtdc", "awb": awb, "tracking": resp.json()}


# Uniform operation names; unavailable carrier APIs fail explicitly.
create_shipment = _dtdc_create
track = _dtdc_track


def get_rates(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until dtdc documents this carrier API."""
    raise HTTPException(status_code=501, detail="dtdc: create_mps_shipment is not implemented")
