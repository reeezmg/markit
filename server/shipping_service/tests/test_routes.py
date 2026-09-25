"""Seller routing and authentication smoke tests for the moved shipping API."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from shipping_service.app import app
from shipping_service import deps
from shipping_service.shipping import _common
from shipping_service.shipping.carriers import delhivery
from shipping_service.shipping.carriers import shiprocket
from fastapi import HTTPException


def response(data):
    result = MagicMock()
    result.status_code = 200
    result.json.return_value = data
    result.raise_for_status.return_value = None
    return result


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SHIPPING_SERVICE_TOKEN", "testtoken")
    monkeypatch.setattr(_common, "_get_config", lambda *_: {
        "primary": "delhivery",
        "providers": {"delhivery": {"enabled": True, "apiToken": "token"}},
    })
    app.dependency_overrides[deps.db] = lambda: None
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


BASE = "/api/seller/company-1/shipping"
HEADERS = {"X-Service-Token": "testtoken"}


def test_seller_routes_require_service_token(client):
    assert client.get(f"{BASE}/providers").status_code == 401
    assert client.get(f"{BASE}/track/AWB1").status_code == 401
    assert client.post(f"{BASE}/pickup", json={}).status_code == 401


def test_selected_provider_is_used_for_seller_operations(client):
    providers = client.get(f"{BASE}/providers", headers=HEADERS)
    assert providers.status_code == 200
    assert providers.json()["primary"] == "delhivery"

    with patch.object(delhivery.httpx, "get", return_value=response({"ShipmentData": [
        {"Shipment": {"Status": {"Status": "In Transit"}}},
    ]})) as request:
        tracked = client.get(f"{BASE}/track/AWB1", headers=HEADERS)
    assert tracked.status_code == 200
    assert tracked.json()["provider"] == "delhivery"
    assert request.call_args.kwargs["params"] == {"waybill": "AWB1"}


def test_storetools_shared_routes_are_present(client):
    paths = {(method, route.path) for route in app.routes for method in getattr(route, "methods", [])}
    for method, path in (
        ("GET", "/api/seller/{company_id}/shipping/serviceability"),
        ("GET", "/api/seller/{company_id}/shipping/track/{tracking_id}"),
        ("GET", "/api/seller/{company_id}/shipping/track-bulk"),
        ("POST", "/api/seller/{company_id}/shipping/bulk-create"),
        ("POST", "/api/seller/{company_id}/shipping/cancel"),
        ("POST", "/api/seller/{company_id}/shipping/webhook/{provider}"),
    ):
        assert (method, path) in paths


def test_seller_bulk_delivery_settles_cod_in_same_status_transaction():
    from shipping_service.shipping import shared

    class Conn:
        def transaction(self):
            from contextlib import nullcontext
            return nullcontext()

        def execute(self, *_args, **_kwargs):
            result = MagicMock()
            result.fetchone.return_value = {"id": "order-1"}
            return result

    conn = Conn()
    with patch.object(_common, "_settle_delivered_cod") as settle:
        updated = shared._sync_tracked_statuses(
            conn, "company-1", {"AWB1": {"status": "DELIVERED", "rawStatus": "Delivered"}},
        )
    assert updated == 1
    settle.assert_called_once_with(conn, "company-1", "order-1")


def test_delhivery_bulk_tracking_ignores_delivered_eod38(client):
    payload = {"ShipmentData": [
        {"Shipment": {"AWB": "AWB1", "Status": {
            "Status": "Delivered", "StatusType": "DL", "StatusCode": "EOD-38"},
            "Scans": [
                {"ScanDetail": {"StatusCode": "X-DDD3FD"}},
                {"ScanDetail": {"StatusCode": "EOD-38"}},
            ]}},
    ]}
    with patch.object(delhivery.httpx, "get", return_value=response(payload)):
        result = client.get(f"{BASE}/track-bulk", params={"waybills": "AWB1"}, headers=HEADERS)
    assert result.status_code == 200
    status = result.json()["statuses"]["AWB1"]
    assert status["status"] == "DELIVERED"
    assert status["nslCode"] is None
    assert status["ndrAttempts"] == 0


def test_storetools_webhook_requires_configured_secret(client):
    response = client.post(f"{BASE}/webhook/delhivery", json={"waybill": "AWB1", "status": "Delivered"})
    assert response.status_code == 503


def test_storetools_webhook_verifies_and_forwards_once(client, monkeypatch):
    from shipping_service.shipping import webhooks

    monkeypatch.setattr(_common, "_get_config", lambda *_: {
        "providers": {"delhivery": {"enabled": True, "webhookToken": "carrier-secret"}},
    })
    monkeypatch.setenv("CUSTOM_API_URL", "http://custom-api.test")
    monkeypatch.setenv("CUSTOM_API_SERVICE_TOKEN", "internal-secret")
    payload = {"waybill": "AWB1", "status": "Delivered"}
    with patch.object(webhooks.httpx, "post", return_value=response({"ok": True, "matched": True})) as forwarded:
        denied = client.post(f"{BASE}/webhook/delhivery", json=payload,
                             headers={"X-Carrier-Webhook-Token": "wrong"})
        accepted = client.post(f"{BASE}/webhook/delhivery", json=payload,
                               headers={"X-Carrier-Webhook-Token": "carrier-secret"})
    assert denied.status_code == 401
    assert accepted.status_code == 200
    assert accepted.json() == {"ok": True, "matched": True}
    forwarded.assert_called_once()
    assert forwarded.call_args.args[0] == "http://custom-api.test/api/custom/company-1/shipping/internal/webhook/delhivery"
    assert forwarded.call_args.kwargs["json"] == payload
    assert forwarded.call_args.kwargs["headers"] == {"X-Service-Token": "internal-secret"}


def test_delhivery_creation_writes_awb_without_changing_order_status(client):
    class Conn:
        def __init__(self):
            self.sql = []

        def transaction(self):
            from contextlib import nullcontext
            return nullcontext()

        def execute(self, sql, params=None):
            self.sql.append((sql, params))
            return MagicMock()

    conn = Conn()
    app.dependency_overrides[deps.db] = lambda: conn
    body = {
        "orderId": "order-1", "orderNumber": "1001",
        "customerName": "Asha", "customerPhone": "9876543210",
        "deliveryAddress": "12 MG Road", "deliveryCity": "Bengaluru",
        "deliveryState": "KA", "deliveryPincode": "560001",
        "items": [{"name": "Tee", "quantity": 2}],
        "paymentMethod": "Prepaid", "totalAmount": 999.0,
        "pickupLocation": "WH1",
    }
    with patch.object(delhivery.httpx, "post", return_value=response({
        "packages": [{"waybill": "AWB123", "status": "Manifested"}],
    })):
        created = client.post(f"{BASE}/create", json=body, headers=HEADERS)
    assert created.status_code == 200
    assert created.json()["awb"] == "AWB123"
    writes = " ".join(sql for sql, _ in conn.sql)
    assert "UPDATE ecomm_orders" in writes
    assert "SET status" not in writes


def test_missing_carrier_operation_fails_explicitly():
    with pytest.raises(HTTPException) as error:
        shiprocket.create_pickup()
    assert error.value.status_code == 501
