"""
CRM endpoints integration tests.
Tests contacts CRUD, tags, and custom fields.
"""
import pytest

REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
CONTACTS_URL = "/api/crm/contacts"
TAGS_URL = "/api/crm/tags"
FIELDS_URL = "/api/crm/custom-fields"


async def _auth_headers(client, email: str = "crm@example.com") -> dict:
    creds = {"email": email, "password": "CrmPass99!", "name": "CRM User"}
    await client.post(REGISTER_URL, json=creds)
    login = await client.post(LOGIN_URL, json={"email": creds["email"], "password": creds["password"]})
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Auth guard ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_contacts_requires_auth(client):
    res = await client.get(CONTACTS_URL)
    assert res.status_code in (401, 403)


# ── Contacts CRUD ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_contact(client):
    headers = await _auth_headers(client)
    body = {"first_name": "Alice", "last_name": "Smith", "email": "alice@example.com"}
    res = await client.post(CONTACTS_URL, json=body, headers=headers)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["first_name"] == "Alice"
    assert data["email"] == "alice@example.com"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_contacts_returns_created(client):
    headers = await _auth_headers(client, "crmlist@example.com")
    await client.post(CONTACTS_URL, json={"first_name": "Bob"}, headers=headers)
    res = await client.get(CONTACTS_URL, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)
    assert len(data["data"]) >= 1


@pytest.mark.asyncio
async def test_get_contact_by_id(client):
    headers = await _auth_headers(client, "crmget@example.com")
    create = await client.post(CONTACTS_URL, json={"first_name": "Carol"}, headers=headers)
    contact_id = create.json()["data"]["id"]

    get = await client.get(f"{CONTACTS_URL}/{contact_id}", headers=headers)
    assert get.status_code == 200
    assert get.json()["data"]["id"] == contact_id


@pytest.mark.asyncio
async def test_update_contact(client):
    headers = await _auth_headers(client, "crmupdate@example.com")
    create = await client.post(CONTACTS_URL, json={"first_name": "Dan"}, headers=headers)
    contact_id = create.json()["data"]["id"]

    update = await client.patch(
        f"{CONTACTS_URL}/{contact_id}",
        json={"first_name": "Daniel", "phone": "+15551234"},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["data"]["first_name"] == "Daniel"


@pytest.mark.asyncio
async def test_delete_contact(client):
    headers = await _auth_headers(client, "crmdel@example.com")
    create = await client.post(CONTACTS_URL, json={"first_name": "Eve"}, headers=headers)
    contact_id = create.json()["data"]["id"]

    delete = await client.delete(f"{CONTACTS_URL}/{contact_id}", headers=headers)
    assert delete.status_code == 200

    get = await client.get(f"{CONTACTS_URL}/{contact_id}", headers=headers)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_cannot_access_other_users_contact(client):
    headers_a = await _auth_headers(client, "crma@example.com")
    headers_b = await _auth_headers(client, "crmb@example.com")

    create = await client.post(CONTACTS_URL, json={"first_name": "Private"}, headers=headers_a)
    contact_id = create.json()["data"]["id"]

    get = await client.get(f"{CONTACTS_URL}/{contact_id}", headers=headers_b)
    assert get.status_code == 404


# ── Tags ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_list_tags(client):
    headers = await _auth_headers(client, "crmtag@example.com")
    res = await client.post(TAGS_URL, json={"name": "vip"}, headers=headers)
    assert res.status_code == 201
    assert res.json()["data"]["name"] == "vip"

    list_res = await client.get(TAGS_URL, headers=headers)
    assert list_res.status_code == 200
    names = [t["name"] for t in list_res.json()["data"]]
    assert "vip" in names


@pytest.mark.asyncio
async def test_cannot_create_duplicate_tag(client):
    headers = await _auth_headers(client, "crmtag2@example.com")
    await client.post(TAGS_URL, json={"name": "unique_tag"}, headers=headers)
    res = await client.post(TAGS_URL, json={"name": "unique_tag"}, headers=headers)
    assert res.status_code in (409, 422)


# ── Custom fields ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_custom_field(client):
    headers = await _auth_headers(client, "crmfield@example.com")
    res = await client.post(
        FIELDS_URL,
        json={"name": "Company Size", "key": "company_size", "field_type": "text"},
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["key"] == "company_size"
    assert data["field_type"] == "text"


@pytest.mark.asyncio
async def test_list_custom_fields(client):
    headers = await _auth_headers(client, "crmfield2@example.com")
    await client.post(
        FIELDS_URL,
        json={"name": "Lead Score", "key": "lead_score", "field_type": "number"},
        headers=headers,
    )
    res = await client.get(FIELDS_URL, headers=headers)
    assert res.status_code == 200
    keys = [f["key"] for f in res.json()["data"]]
    assert "lead_score" in keys
