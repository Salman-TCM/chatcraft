"""
Integration tests: full auth flow — register → login → refresh → logout.
These hit the full FastAPI stack with an in-memory SQLite DB (no Redis).
Redis-dependent steps (brute-force, refresh JTI) are marked skip.
"""
import pytest

REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
REFRESH_URL = "/api/auth/refresh"
LOGOUT_URL = "/api/auth/logout"
ME_URL = "/api/auth/me"


@pytest.mark.asyncio
async def test_full_auth_flow(client):
    """register → login → /me → logout."""
    creds = {"email": "flow@example.com", "password": "FlowPass99!", "name": "Flow User"}

    reg = await client.post(REGISTER_URL, json=creds)
    assert reg.status_code == 201

    login = await client.post(LOGIN_URL, json={"email": creds["email"], "password": creds["password"]})
    assert login.status_code == 200
    token = login.json()["data"]["access_token"]

    me = await client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["data"]["email"] == creds["email"]

    logout = await client.post(LOGOUT_URL)
    assert logout.status_code == 200


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    res = await client.get(ME_URL)
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_register_validates_email(client):
    res = await client.post(REGISTER_URL, json={"email": "not-an-email", "password": "Pass123!", "name": "X"})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_validates_password_length(client):
    res = await client.post(REGISTER_URL, json={"email": "short@example.com", "password": "abc", "name": "X"})
    assert res.status_code == 422


@pytest.mark.asyncio
@pytest.mark.skip(reason="Refresh token rotation requires Redis JTI storage")
async def test_refresh_issues_new_token(client):
    creds = {"email": "refresh@example.com", "password": "RefPass99!", "name": "Refresh User"}
    await client.post(REGISTER_URL, json=creds)
    await client.post(LOGIN_URL, json={"email": creds["email"], "password": creds["password"]})

    res = await client.post(REFRESH_URL)
    assert res.status_code == 200
    assert "access_token" in res.json().get("data", {})
