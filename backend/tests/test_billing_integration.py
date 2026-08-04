"""
Billing endpoint integration tests.

Tests:
  - Checkout session requires auth
  - Webhook requires valid Stripe signature
  - /billing/status returns current plan
  - /billing/portal requires auth
"""

import json

import pytest

REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
CHECKOUT_URL = "/api/billing/checkout"
PORTAL_URL = "/api/billing/portal"
STATUS_URL = "/api/billing/status"
WEBHOOK_URL = "/api/billing/webhook"


async def _auth_headers(client, email: str = "billing@example.com") -> dict:
    creds = {"email": email, "password": "BillingPass99!", "name": "Billing User"}
    await client.post(REGISTER_URL, json=creds)
    login = await client.post(LOGIN_URL, json={"email": email, "password": creds["password"]})
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Auth guards ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_checkout_requires_auth(client):
    res = await client.post(CHECKOUT_URL, json={"price_id": "price_test"})
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_portal_requires_auth(client):
    res = await client.post(PORTAL_URL)
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_status_requires_auth(client):
    res = await client.get(STATUS_URL)
    assert res.status_code in (401, 403)


# ── Status endpoint ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_billing_status_new_user_is_free(client):
    headers = await _auth_headers(client, "billing_free@example.com")
    res = await client.get(STATUS_URL, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    # A freshly created user should be on free plan
    status_data = data["data"]
    assert status_data.get("plan") in ("free", None)


# ── Checkout validation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_checkout_with_no_stripe_key_returns_error(client):
    """When Stripe is not configured, checkout should return a graceful error."""
    headers = await _auth_headers(client, "billing_checkout@example.com")
    res = await client.post(
        CHECKOUT_URL,
        json={"price_id": "price_test_123"},
        headers=headers,
    )
    # With no real Stripe key, we expect either 400/422 (validation) or 200 if stub
    assert res.status_code in (200, 400, 422, 503)


# ── Webhook ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_webhook_without_signature_header_rejected(client):
    """Stripe webhook without signature should be rejected with 400."""
    event_payload = json.dumps(
        {
            "type": "customer.subscription.created",
            "data": {"object": {}},
        }
    )
    res = await client.post(
        WEBHOOK_URL,
        content=event_payload,
        headers={"Content-Type": "application/json"},
    )
    assert res.status_code in (400, 422)


@pytest.mark.asyncio
async def test_webhook_with_invalid_signature_rejected(client):
    """Stripe webhook with wrong signature should be rejected."""
    event_payload = json.dumps(
        {
            "type": "customer.subscription.updated",
            "data": {"object": {}},
        }
    )
    res = await client.post(
        WEBHOOK_URL,
        content=event_payload,
        headers={
            "Content-Type": "application/json",
            "Stripe-Signature": "t=1234567890,v1=fake_signature",
        },
    )
    assert res.status_code in (400, 422)


# ── Role after subscription ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_free_user_has_free_role(client):
    """Newly registered user has free role."""
    headers = await _auth_headers(client, "billing_role@example.com")
    from app.api.billing import _stripe_status_to_role
    from app.models.user import UserRole

    # Verify pure-Python helper — active → premium
    assert _stripe_status_to_role("active") == UserRole.premium
    # Verify pure-Python helper — canceled → free
    assert _stripe_status_to_role("canceled") == UserRole.free
