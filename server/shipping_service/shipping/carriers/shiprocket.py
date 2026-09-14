"""Shiprocket HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _shiprocket_rates(gw, pickup, delivery, weight, cod):
    token = _get_shiprocket_token(gw)
    resp = httpx.get(
        "https://apiv2.shiprocket.in/v1/external/courier/serviceability/",
        headers={"Authorization": f"Bearer {token}"},
        params={"pickup_postcode": pickup, "delivery_postcode": delivery,
                "weight": weight, "cod": 1 if cod > 0 else 0},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    couriers = data.get("data", {}).get("available_courier_companies", [])
    return {
        "provider": "shiprocket",
        "rates": [
            {
                "courier":      c.get("courier_name"),
                "courierId":    c.get("courier_company_id"),
                "rate":         c.get("rate"),
                "etd":          c.get("etd"),
                "codCharges":   c.get("cod_charges"),
                "minWeight":    c.get("min_weight"),
            }
            for c in couriers
        ],
    }

def _shiprocket_create(gw, body: CreateShipmentRequest, pickup_pincode: str):
    token = _get_shiprocket_token(gw)
    items = [
        {
            "name":     _item_display_name(i),
            "sku":      i.get("sku", str(uuid.uuid4())[:8]),
            "units":    i.get("quantity", 1),
            "selling_price": i.get("price", 0),
        }
        for i in body.items
    ]
    payload = {
        "order_id":            body.orderNumber,
        "order_date":          __import__("datetime").datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        "pickup_location":     "Primary",
        "billing_customer_name": body.customerName,
        "billing_phone":       body.customerPhone,
        "billing_email":       body.customerEmail,
        "billing_address":     body.deliveryAddress,
        "billing_city":        body.deliveryCity,
        "billing_state":       body.deliveryState,
        "billing_pincode":     body.deliveryPincode,
        "billing_country":     body.deliveryCountry,
        "shipping_is_billing": True,
        "payment_method":      "Prepaid" if body.paymentMethod.upper() != "COD" else "COD",
        "sub_total":           body.totalAmount,
        "length":              body.length,
        "breadth":             body.width,
        "height":              body.height,
        "weight":              body.weight,
        "order_items":         items,
    }
    resp = httpx.post(
        "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "provider":   "shiprocket",
        "shipmentId": data.get("shipment_id"),
        "orderId":    data.get("order_id"),
        "awb":        data.get("awb_code"),
        "courierName": data.get("courier_name"),
        "label":      data.get("label_url"),
    }

def _shiprocket_track(gw, awb: str):
    token = _get_shiprocket_token(gw)
    resp = httpx.get(
        f"https://apiv2.shiprocket.in/v1/external/courier/track/awb/{awb}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json().get("tracking_data", {})
    return {"provider": "shiprocket", "awb": awb, "status": data.get("shipment_status"), "tracking": data}

def _shiprocket_cancel(gw, body: CancelShipmentRequest):
    token = _get_shiprocket_token(gw)
    ids = [body.shipmentId] if body.shipmentId else []
    resp = httpx.post(
        "https://apiv2.shiprocket.in/v1/external/orders/cancel",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"ids": [body.orderId]} if body.orderId else {"awbs": [body.awb]},
        timeout=15,
    )
    resp.raise_for_status()
    return {"provider": "shiprocket", "success": True, "response": resp.json()}


# Uniform operation names; unavailable carrier APIs fail explicitly.
get_rates = _shiprocket_rates
create_shipment = _shiprocket_create
track = _shiprocket_track
cancel = _shiprocket_cancel


def serviceability(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: serviceability is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: track_bulk is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until shiprocket documents this carrier API."""
    raise HTTPException(status_code=501, detail="shiprocket: create_mps_shipment is not implemented")
