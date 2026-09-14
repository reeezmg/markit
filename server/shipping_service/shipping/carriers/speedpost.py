"""Speedpost HTTP transport for ecommerce shipping."""

import json
import uuid

import httpx
from fastapi import HTTPException

from .._common import URLS, CancelShipmentRequest, CreateShipmentRequest, _get_shiprocket_token, _item_display_name


def _speedpost_track(gw, awb: str):
    resp = httpx.get(
        f"{URLS['speedpost']['PROD']}/track",
        params={"awbNo": awb},
        timeout=15,
    )
    resp.raise_for_status()
    return {"provider": "speedpost", "awb": awb, "tracking": resp.json()}


# Uniform operation names; unavailable carrier APIs fail explicitly.
track = _speedpost_track


def get_rates(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: get_rates is not implemented")


def serviceability(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: serviceability is not implemented")


def create_shipment(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: create_shipment is not implemented")


def track_bulk(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: track_bulk is not implemented")


def cancel(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: cancel is not implemented")


def update_shipment(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: update_shipment is not implemented")


def generate_label(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: generate_label is not implemented")


def generate_labels_bulk(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: generate_labels_bulk is not implemented")


def label_data(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: label_data is not implemented")


def create_pickup(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: create_pickup is not implemented")


def ndr_action(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: ndr_action is not implemented")


def ndr_status(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: ndr_status is not implemented")


def create_reverse_shipment(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: create_reverse_shipment is not implemented")


def create_exchange_shipment(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: create_exchange_shipment is not implemented")


def register_pickup_location(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: register_pickup_location is not implemented")


def update_pickup_location(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: update_pickup_location is not implemented")


def update_ewaybill(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: update_ewaybill is not implemented")


def fetch_waybills(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: fetch_waybills is not implemented")


def create_mps_shipment(*_args, **_kwargs):
    """Placeholder until speedpost documents this carrier API."""
    raise HTTPException(status_code=501, detail="speedpost: create_mps_shipment is not implemented")
