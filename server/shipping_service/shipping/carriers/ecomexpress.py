"""Ecomexpress HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _ecomexpress_create(gw, body: CreateShipmentRequest, pickup_pincode: str):
    env  = gw.get("environment", "PROD")
    base = URLS["ecomexpress"].get(env, URLS["ecomexpress"]["PROD"])
    params = {
        "username": gw.get("username", ""),
        "password": gw.get("password", ""),
        "json_input": json.dumps([{
            "AWB_NUMBER":   "",
            "ORDER_NUMBER": body.orderNumber,
            "PRODUCT":      "PPD" if body.paymentMethod.upper() != "COD" else "COD",
            "CONSIGNEE":    body.customerName,
            "CONSIGNEE_ADDRESS1": body.deliveryAddress,
            "CONSIGNEE_CITY":    body.deliveryCity,
            "CONSIGNEE_STATE":   body.deliveryState,
            "CONSIGNEE_PINCODE": body.deliveryPincode,
            "CONSIGNEE_MOBILE":  body.customerPhone,
            "ITEM_DESCRIPTION":  ", ".join(_item_display_name(i) for i in body.items),
            "PIECES":            sum(int(i.get("quantity", 1)) for i in body.items),
            "WEIGHT":            body.weight * 1000,
            "AMOUNT":            body.codAmount if body.paymentMethod.upper() == "COD" else 0,
        }]),
    }
    resp = httpx.post(f"{base}/services/shipment/v2/awbassign/", params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return {"provider": "ecomexpress", "response": data}

def _ecomexpress_track(gw, awb: str):
    resp = httpx.get(
        "https://clbeta.ecomexpress.in/apiv2/track_me/",
        params={"username": gw.get("username", ""), "password": gw.get("password", ""), "awb": awb},
        timeout=15,
    )
    resp.raise_for_status()
    return {"provider": "ecomexpress", "awb": awb, "tracking": resp.json()}


# Uniform operation names; unavailable carrier APIs fail explicitly.
create_shipment = _ecomexpress_create
track = _ecomexpress_track


def get_rates(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until ecomexpress documents this carrier API."""
    raise HTTPException(status_code=501, detail="ecomexpress: create_mps_shipment is not implemented")
