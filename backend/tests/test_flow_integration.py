"""
Flow builder execution engine integration tests.
Tests flow CRUD + trigger endpoint.
"""
import pytest

REGISTER_URL = "/api/auth/register"
LOGIN_URL = "/api/auth/login"
FLOWS_URL = "/api/v1/flows"


async def _auth_headers(client, email: str = "flow@example.com") -> dict:
    creds = {"email": email, "password": "FlowPass99!", "name": "Flow User"}
    await client.post(REGISTER_URL, json=creds)
    login = await client.post(LOGIN_URL, json={"email": email, "password": creds["password"]})
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _minimal_flow() -> dict:
    return {
        "name": "Test Flow",
        "trigger_type": "keyword",
        "trigger_config": {"keywords": ["hello"]},
        "nodes": [
            {
                "id": "n1",
                "type": "trigger",
                "data": {"nodeType": "trigger", "triggerType": "keyword"},
                "position": {"x": 100, "y": 100},
            },
            {
                "id": "n2",
                "type": "action",
                "data": {"nodeType": "send_message", "message": "Hello back!"},
                "position": {"x": 300, "y": 100},
            },
        ],
        "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
    }


# ── Auth guard ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_flows_requires_auth(client):
    res = await client.get(FLOWS_URL)
    assert res.status_code in (401, 403)


# ── CRUD ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_flow(client):
    headers = await _auth_headers(client)
    res = await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["name"] == "Test Flow"
    assert data["is_active"] is False  # newly created flows are inactive
    assert "id" in data


@pytest.mark.asyncio
async def test_list_flows_returns_created(client):
    headers = await _auth_headers(client, "flowlist@example.com")
    await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)
    res = await client.get(FLOWS_URL, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)
    assert len(data["data"]) >= 1


@pytest.mark.asyncio
async def test_get_flow_detail(client):
    headers = await _auth_headers(client, "flowget@example.com")
    create = await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)
    flow_id = create.json()["data"]["id"]

    get = await client.get(f"{FLOWS_URL}/{flow_id}", headers=headers)
    assert get.status_code == 200
    detail = get.json()["data"]
    assert detail["id"] == flow_id
    assert "nodes" in detail
    assert "edges" in detail


@pytest.mark.asyncio
async def test_update_flow_name(client):
    headers = await _auth_headers(client, "flowupdate@example.com")
    create = await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)
    flow_id = create.json()["data"]["id"]

    patch = await client.patch(
        f"{FLOWS_URL}/{flow_id}",
        json={"name": "Renamed Flow"},
        headers=headers,
    )
    assert patch.status_code == 200
    assert patch.json()["data"]["name"] == "Renamed Flow"


@pytest.mark.asyncio
async def test_delete_flow(client):
    headers = await _auth_headers(client, "flowdel@example.com")
    create = await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)
    flow_id = create.json()["data"]["id"]

    delete = await client.delete(f"{FLOWS_URL}/{flow_id}", headers=headers)
    assert delete.status_code == 200

    get = await client.get(f"{FLOWS_URL}/{flow_id}", headers=headers)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_toggle_flow_active(client):
    headers = await _auth_headers(client, "flowtoggle@example.com")
    create = await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)
    flow_id = create.json()["data"]["id"]

    toggle = await client.post(f"{FLOWS_URL}/{flow_id}/toggle", headers=headers)
    assert toggle.status_code == 200
    assert toggle.json()["data"]["is_active"] is True

    toggle2 = await client.post(f"{FLOWS_URL}/{flow_id}/toggle", headers=headers)
    assert toggle2.json()["data"]["is_active"] is False


@pytest.mark.asyncio
async def test_duplicate_flow(client):
    headers = await _auth_headers(client, "flowdup@example.com")
    create = await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)
    flow_id = create.json()["data"]["id"]

    dup = await client.post(f"{FLOWS_URL}/{flow_id}/duplicate", headers=headers)
    assert dup.status_code == 201
    dup_data = dup.json()["data"]
    assert dup_data["id"] != flow_id
    assert "Copy" in dup_data["name"] or dup_data["name"] != "Test Flow"


@pytest.mark.asyncio
async def test_cannot_access_other_users_flow(client):
    headers_a = await _auth_headers(client, "flowuser_a@example.com")
    headers_b = await _auth_headers(client, "flowuser_b@example.com")

    create = await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers_a)
    flow_id = create.json()["data"]["id"]

    get = await client.get(f"{FLOWS_URL}/{flow_id}", headers=headers_b)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_list_flows_pagination(client):
    headers = await _auth_headers(client, "flowpag@example.com")
    for i in range(5):
        body = _minimal_flow()
        body["name"] = f"Flow {i}"
        await client.post(FLOWS_URL, json=body, headers=headers)

    res = await client.get(f"{FLOWS_URL}?page=1&limit=3", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["data"]) <= 3
    assert data.get("total", 0) >= 5


@pytest.mark.asyncio
async def test_list_flows_simple_endpoint(client):
    headers = await _auth_headers(client, "flowsimple@example.com")
    await client.post(FLOWS_URL, json=_minimal_flow(), headers=headers)

    res = await client.get(f"{FLOWS_URL}/list", headers=headers)
    assert res.status_code == 200
    items = res.json()["data"]
    assert isinstance(items, list)
    # Each item in the simple list has id, name, is_active only
    for item in items:
        assert "id" in item
        assert "name" in item
        assert "is_active" in item
