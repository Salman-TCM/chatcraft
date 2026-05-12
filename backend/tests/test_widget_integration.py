"""
Integration tests: widget endpoints.
- GET /api/widget/{id}/config — returns 404 for non-existent chatbot
- POST /api/widget/{id}/chat — requires X-Widget-Token header
- Domain whitelist check via origin header
"""
import pytest

WIDGET_CONFIG_URL = "/api/widget/{chatbot_id}/config"
WIDGET_CHAT_URL = "/api/widget/{chatbot_id}/chat"
FAKE_ID = "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_widget_config_not_found(client):
    """Unpublished / missing chatbot returns 404."""
    res = await client.get(WIDGET_CONFIG_URL.format(chatbot_id=FAKE_ID))
    assert res.status_code == 404
    assert res.json()["success"] is False


@pytest.mark.asyncio
async def test_widget_chat_missing_token(client):
    """Widget chat without X-Widget-Token header returns 401."""
    res = await client.post(
        WIDGET_CHAT_URL.format(chatbot_id=FAKE_ID),
        json={"message": "Hello"},
    )
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "MISSING_TOKEN"


@pytest.mark.asyncio
async def test_widget_chat_invalid_token(client):
    """Widget chat with a bogus token returns 401."""
    res = await client.post(
        WIDGET_CHAT_URL.format(chatbot_id=FAKE_ID),
        json={"message": "Hello"},
        headers={"X-Widget-Token": "completely-invalid-token"},
    )
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "INVALID_TOKEN"


@pytest.mark.asyncio
async def test_widget_manage_requires_auth(client):
    """Widget manage endpoint requires authentication."""
    res = await client.get(f"/api/widget/manage/{FAKE_ID}")
    assert res.status_code in (401, 403)
