import pytest

SUMMARY_URL = "/api/usage/summary"
HISTORY_URL = "/api/usage/history"
COST_URL = "/api/usage/cost"


@pytest.mark.asyncio
async def test_summary_requires_auth(client):
    response = await client.get(SUMMARY_URL)
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_history_requires_auth(client):
    response = await client.get(HISTORY_URL)
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_cost_requires_auth(client):
    response = await client.get(COST_URL)
    assert response.status_code in (401, 403)
