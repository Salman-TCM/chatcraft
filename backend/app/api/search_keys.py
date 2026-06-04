"""
Search Provider API Keys — per-user keys for web search tools.

GET    /api/settings/search-keys           — list providers + configured status
POST   /api/settings/search-keys           — save/update a key
DELETE /api/settings/search-keys/{provider} — remove a key
POST   /api/settings/search-keys/{provider}/test — verify key works
"""
import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession
from app.models.user_api_key import UserApiKey
from app.services.llm.key_store import decrypt_key, encrypt_key

router = APIRouter(prefix="/api/settings/search-keys", tags=["search-keys"])

SEARCH_PROVIDERS: dict[str, dict] = {
    "tavily": {
        "label": "Tavily",
        "description": "AI-optimised search built for agents. Best results for news and research.",
        "free_tier": "1,000 queries/month free",
        "key_hint": "tvly-...",
        "docs_url": "https://app.tavily.com",
    },
    "serper": {
        "label": "Serper",
        "description": "Real-time Google search results via fast API.",
        "free_tier": "2,500 queries free",
        "key_hint": "...",
        "docs_url": "https://serper.dev",
    },
    "bing": {
        "label": "Bing Web Search",
        "description": "Microsoft Azure Bing Search API. Reliable and fast.",
        "free_tier": "1,000 queries/month free",
        "key_hint": "Azure Cognitive Services key",
        "docs_url": "https://azure.microsoft.com/en-us/products/ai-services/bing-search",
    },
    "brave_search": {
        "label": "Brave Search",
        "description": "Independent web index. No Google dependency.",
        "free_tier": "2,000 queries/month free",
        "key_hint": "BSA...",
        "docs_url": "https://brave.com/search/api/",
    },
    "serpapi": {
        "label": "SerpAPI",
        "description": "Scrapes Google, Bing, DuckDuckGo, Yahoo and more.",
        "free_tier": "100 queries/month free",
        "key_hint": "...",
        "docs_url": "https://serpapi.com",
    },
    "you": {
        "label": "You.com",
        "description": "AI-powered search with structured snippets.",
        "free_tier": "60 queries/hour free",
        "key_hint": "...",
        "docs_url": "https://api.you.com",
    },
    "exa": {
        "label": "Exa (Neural Search)",
        "description": "Semantic/neural search — finds conceptually related content.",
        "free_tier": "1,000 queries/month free",
        "key_hint": "...",
        "docs_url": "https://exa.ai",
    },
}

SEARCH_PROVIDER_KEYS = set(SEARCH_PROVIDERS.keys())


class UpsertSearchKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.get("")
async def list_search_keys(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id,
            UserApiKey.provider.in_(SEARCH_PROVIDER_KEYS),
        )
    )
    configured = {row.provider for row in result.scalars().all()}
    return {
        "success": True,
        "data": [
            {
                "provider": p,
                "configured": p in configured,
                **SEARCH_PROVIDERS[p],
            }
            for p in SEARCH_PROVIDERS
        ],
    }


@router.post("", status_code=status.HTTP_200_OK)
async def upsert_search_key(body: UpsertSearchKeyRequest, user: CurrentUser, db: DBSession) -> dict:
    if body.provider not in SEARCH_PROVIDER_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown search provider '{body.provider}'",
        )
    if not body.api_key.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="API key cannot be empty")

    encrypted = encrypt_key(body.api_key.strip())
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id,
            UserApiKey.provider == body.provider,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        row.api_key_encrypted = encrypted
    else:
        db.add(UserApiKey(user_id=user.id, provider=body.provider, api_key_encrypted=encrypted))
    await db.commit()
    return {"success": True, "data": {"provider": body.provider, "configured": True}}


@router.delete("/{provider}")
async def delete_search_key(provider: str, user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(UserApiKey).where(UserApiKey.user_id == user.id, UserApiKey.provider == provider)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
    await db.delete(row)
    await db.commit()
    return {"success": True}


@router.post("/{provider}/test")
async def test_search_key(provider: str, user: CurrentUser, db: DBSession) -> dict:
    if provider not in SEARCH_PROVIDER_KEYS:
        raise HTTPException(status_code=400, detail="Unknown provider")

    result = await db.execute(
        select(UserApiKey).where(UserApiKey.user_id == user.id, UserApiKey.provider == provider)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No key saved for this provider")

    try:
        key = decrypt_key(row.api_key_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt key")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if provider == "tavily":
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={"api_key": key, "query": "test", "max_results": 1},
                )
                if resp.status_code not in (200, 201):
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

            elif provider == "serper":
                resp = await client.post(
                    "https://google.serper.dev/search",
                    headers={"X-API-KEY": key, "Content-Type": "application/json"},
                    json={"q": "test", "num": 1},
                )
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

            elif provider == "bing":
                resp = await client.get(
                    "https://api.bing.microsoft.com/v7.0/search",
                    params={"q": "test", "count": 1},
                    headers={"Ocp-Apim-Subscription-Key": key},
                )
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

            elif provider == "brave_search":
                resp = await client.get(
                    "https://api.search.brave.com/res/v1/web/search",
                    params={"q": "test", "count": 1},
                    headers={"Accept": "application/json", "X-Subscription-Token": key},
                )
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

            elif provider == "serpapi":
                resp = await client.get(
                    "https://serpapi.com/search.json",
                    params={"q": "test", "num": 1, "api_key": key},
                )
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

            elif provider == "you":
                resp = await client.get(
                    "https://api.ydc-index.io/search",
                    params={"query": "test", "num_web_results": 1},
                    headers={"X-API-Key": key},
                )
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

            elif provider == "exa":
                resp = await client.post(
                    "https://api.exa.ai/search",
                    headers={"x-api-key": key, "Content-Type": "application/json"},
                    json={"query": "test", "numResults": 1},
                )
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

        return {"success": True, "data": {"provider": provider, "valid": True}}

    except Exception as exc:
        return {
            "success": False,
            "data": {"provider": provider, "valid": False},
            "error": str(exc)[:300],
        }
