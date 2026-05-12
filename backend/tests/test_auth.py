import pytest


REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"

VALID_USER = {
    "email": "testuser@example.com",
    "password": "SecurePass123!",
    "name": "Test User",
}


@pytest.mark.asyncio
async def test_register_success(client):
    response = await client.post(REGISTER_URL, json=VALID_USER)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {
        "email": "duplicate@example.com",
        "password": "SecurePass123!",
        "name": "Dup User",
    }
    first = await client.post(REGISTER_URL, json=payload)
    assert first.status_code == 201

    second = await client.post(REGISTER_URL, json=payload)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_login_invalid_credentials(client):
    # Register first so the account exists.
    payload = {
        "email": "logintest@example.com",
        "password": "CorrectPass123!",
        "name": "Login Test",
    }
    await client.post(REGISTER_URL, json=payload)

    response = await client.post(
        LOGIN_URL,
        json={"email": "logintest@example.com", "password": "WrongPass999!"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_success(client):
    payload = {
        "email": "successlogin@example.com",
        "password": "GoodPass456!",
        "name": "Success User",
    }
    reg = await client.post(REGISTER_URL, json=payload)
    assert reg.status_code == 201

    login = await client.post(
        LOGIN_URL,
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == 200
    body = login.json()
    assert "access_token" in body.get("data", body)


@pytest.mark.asyncio
@pytest.mark.skip(reason="Brute-force lockout requires a live Redis instance")
async def test_login_brute_force_lockout(client):
    for _ in range(10):
        await client.post(
            LOGIN_URL,
            json={"email": "victim@example.com", "password": "wrong"},
        )
    response = await client.post(
        LOGIN_URL,
        json={"email": "victim@example.com", "password": "wrong"},
    )
    assert response.status_code == 429
