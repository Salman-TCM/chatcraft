"""
Integration tests: chatbot CRUD — requires auth.
"""

import pytest

REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
CHATBOTS_URL = "/api/chatbots"


async def _auth_headers(client) -> dict:
    creds = {"email": "botowner@example.com", "password": "BotPass99!", "name": "Bot Owner"}
    await client.post(REGISTER_URL, json=creds)
    login = await client.post(
        LOGIN_URL, json={"email": creds["email"], "password": creds["password"]}
    )
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_list_chatbots_requires_auth(client):
    res = await client.get(CHATBOTS_URL)
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_and_get_chatbot(client):
    headers = await _auth_headers(client)
    body = {"name": "Test Bot", "default_model": "claude-sonnet-4-6"}

    create = await client.post(CHATBOTS_URL, json=body, headers=headers)
    assert create.status_code == 201
    bot = create.json()["data"]
    assert bot["name"] == "Test Bot"
    assert bot["published"] is False

    get = await client.get(f"{CHATBOTS_URL}/{bot['id']}", headers=headers)
    assert get.status_code == 200
    assert get.json()["data"]["id"] == bot["id"]


@pytest.mark.asyncio
async def test_update_chatbot(client):
    headers = await _auth_headers(client)
    create = await client.post(CHATBOTS_URL, json={"name": "Update Me"}, headers=headers)
    bot_id = create.json()["data"]["id"]

    update = await client.put(
        f"{CHATBOTS_URL}/{bot_id}",
        json={"name": "Updated Name", "primary_colour": "#ff0000"},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["data"]["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_delete_chatbot(client):
    headers = await _auth_headers(client)
    create = await client.post(CHATBOTS_URL, json={"name": "Delete Me"}, headers=headers)
    bot_id = create.json()["data"]["id"]

    delete = await client.delete(f"{CHATBOTS_URL}/{bot_id}", headers=headers)
    assert delete.status_code == 200

    get = await client.get(f"{CHATBOTS_URL}/{bot_id}", headers=headers)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_cannot_access_other_users_chatbot(client):
    # Create bot as user 1
    h1 = await _auth_headers(client)
    create = await client.post(CHATBOTS_URL, json={"name": "Private Bot"}, headers=h1)
    bot_id = create.json()["data"]["id"]

    # Register user 2 and try to access
    creds2 = {"email": "attacker@example.com", "password": "AtkPass99!", "name": "Attacker"}
    await client.post(REGISTER_URL, json=creds2)
    login2 = await client.post(
        LOGIN_URL, json={"email": creds2["email"], "password": creds2["password"]}
    )
    h2 = {"Authorization": f"Bearer {login2.json()['data']['access_token']}"}

    res = await client.get(f"{CHATBOTS_URL}/{bot_id}", headers=h2)
    assert res.status_code == 404
