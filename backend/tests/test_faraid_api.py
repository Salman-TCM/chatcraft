"""
POST /api/v1/faraid/calculate integration tests — exercises the real FastAPI
route (auth, request validation, response envelope) against the test DB.
"""

import pytest

REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
CALCULATE_URL = "/api/v1/faraid/calculate"


async def _auth_headers(client, email: str = "faraid@example.com") -> dict:
    creds = {"email": email, "password": "FaraidPass99!", "name": "Faraid Tester"}
    await client.post(REGISTER_URL, json=creds)
    login = await client.post(
        LOGIN_URL, json={"email": creds["email"], "password": creds["password"]}
    )
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_calculate_requires_auth(client):
    res = await client.post(
        CALCULATE_URL,
        json={"decedent_gender": "male", "gross_estate": "1000", "heirs": {"sons": 1}},
    )
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_calculate_valid_request(client):
    headers = await _auth_headers(client)
    body = {
        "decedent_gender": "male",
        "gross_estate": "120000.00",
        "heirs": {"father": True, "mother": True, "sons": 2, "daughters": 1},
    }
    res = await client.post(CALCULATE_URL, json=body, headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["net_estate"] == "120000.00"
    assert data["madhhab"] == "hanafi"
    heir_types = {h["heir_type"] for h in data["eligible_heirs"]}
    assert {"mother", "father", "sons", "daughters"} <= heir_types
    assert "disclaimer" in data and "not a fatwa" in data["disclaimer"]
    assert data["reconciliation"]["difference"] == "0.00"


@pytest.mark.asyncio
async def test_calculate_no_heirs_returns_error(client):
    headers = await _auth_headers(client, email="faraid2@example.com")
    body = {"decedent_gender": "male", "gross_estate": "1000", "heirs": {}}
    res = await client.post(CALCULATE_URL, json=body, headers=headers)
    assert res.status_code in (400, 422)


@pytest.mark.asyncio
async def test_calculate_inconsistent_gender_heir_returns_error(client):
    headers = await _auth_headers(client, email="faraid3@example.com")
    body = {"decedent_gender": "male", "gross_estate": "1000", "heirs": {"husband": True}}
    res = await client.post(CALCULATE_URL, json=body, headers=headers)
    assert res.status_code in (400, 422)


@pytest.mark.asyncio
async def test_calculate_unsupported_madhhab_returns_error(client):
    headers = await _auth_headers(client, email="faraid4@example.com")
    body = {
        "decedent_gender": "male",
        "gross_estate": "1000",
        "madhhab": "shafii",
        "heirs": {"sons": 1},
    }
    res = await client.post(CALCULATE_URL, json=body, headers=headers)
    assert res.status_code in (400, 422)
