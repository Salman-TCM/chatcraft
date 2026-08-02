"""
User AI Model API Keys — BYOK (Bring Your Own Key).

GET    /api/settings/model-keys           — list configured providers (keys masked)
POST   /api/settings/model-keys           — add or update a provider key
DELETE /api/settings/model-keys/{provider} — remove a provider key
POST   /api/settings/model-keys/{provider}/test — verify key works
GET    /api/settings/model-keys/providers  — list all supported providers + their models
"""
import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession
from app.models.user_api_key import UserApiKey, PROVIDERS
from app.services.llm.key_store import encrypt_key, decrypt_key

router = APIRouter(prefix="/api/settings/model-keys", tags=["model-keys"])

PROVIDER_META = {
    "anthropic": {
        "label": "Anthropic",
        "models": ["claude-sonnet-5", "claude-opus-4-8", "claude-fable-5", "claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"],
        "key_hint": "sk-ant-...",
        "docs_url": "https://console.anthropic.com/settings/keys",
    },
    "openai": {
        "label": "OpenAI",
        "models": ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini"],
        "key_hint": "sk-...",
        "docs_url": "https://platform.openai.com/api-keys",
    },
    "google": {
        "label": "Google AI (Gemini)",
        "models": ["gemini-3.1-pro", "gemini-3.6-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
        "key_hint": "AIza...",
        "docs_url": "https://aistudio.google.com/app/apikey",
    },
    "deepseek": {
        "label": "DeepSeek",
        "models": ["deepseek-v4-pro", "deepseek-v4-flash"],
        "key_hint": "sk-...",
        "docs_url": "https://platform.deepseek.com/api_keys",
    },
    "groq": {
        "label": "Groq",
        "models": ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
        "key_hint": "gsk_...",
        "docs_url": "https://console.groq.com/keys",
    },
    "perplexity": {
        "label": "Perplexity",
        "models": ["sonar-pro", "sonar", "sonar-reasoning-pro", "sonar-deep-research"],
        "key_hint": "pplx-...",
        "docs_url": "https://www.perplexity.ai/settings/api",
    },
    "xai": {
        "label": "xAI (Grok)",
        "models": ["grok-4.5", "grok-4.3", "grok-3", "grok-3-fast", "grok-3-mini", "grok-3-mini-fast"],
        "key_hint": "xai-...",
        "docs_url": "https://console.x.ai/",
    },
}


class UpsertKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.get("/providers")
async def list_providers() -> dict:
    return {"success": True, "data": PROVIDER_META}


@router.get("")
async def list_keys(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(UserApiKey).where(UserApiKey.user_id == user.id)
    )
    rows = result.scalars().all()
    configured = {row.provider for row in rows}
    return {
        "success": True,
        "data": [
            {
                "provider": p,
                "configured": p in configured,
                "label": PROVIDER_META.get(p, {}).get("label", p),
            }
            for p in PROVIDERS
        ],
    }


@router.post("", status_code=status.HTTP_200_OK)
async def upsert_key(body: UpsertKeyRequest, user: CurrentUser, db: DBSession) -> dict:
    if body.provider not in PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": f"Unknown provider '{body.provider}'", "code": "INVALID_PROVIDER"},
        )
    if not body.api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": "API key cannot be empty", "code": "EMPTY_KEY"},
        )

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
        row = UserApiKey(
            user_id=user.id,
            provider=body.provider,
            api_key_encrypted=encrypted,
        )
        db.add(row)

    await db.commit()
    return {"success": True, "data": {"provider": body.provider, "configured": True}}


@router.delete("/{provider}")
async def delete_key(provider: str, user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id,
            UserApiKey.provider == provider,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
    await db.delete(row)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/{provider}/test")
async def test_key(provider: str, user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user.id,
            UserApiKey.provider == provider,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "No key saved for this provider", "code": "NOT_FOUND"},
        )

    try:
        api_key = decrypt_key(row.api_key_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt key")

    try:
        if provider == "anthropic":
            import anthropic as _sdk
            client = _sdk.AsyncAnthropic(api_key=api_key)
            await client.models.list()

        elif provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key)
            await client.models.list()

        elif provider == "google":
            from google import genai as _genai
            from google.genai import types as _gtypes
            _client = _genai.Client(api_key=api_key)
            await _client.aio.models.generate_content(
                model="gemini-1.5-flash",
                contents="Hi",
                config=_gtypes.GenerateContentConfig(max_output_tokens=5),
            )

        elif provider in ("deepseek", "groq", "perplexity", "xai"):
            base_urls = {
                "deepseek": "https://api.deepseek.com/v1",
                "groq": "https://api.groq.com/openai/v1",
                "perplexity": "https://api.perplexity.ai",
                "xai": "https://api.x.ai/v1",
            }
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=base_urls[provider])
            await client.models.list()

        return {"success": True, "data": {"provider": provider, "valid": True}}

    except Exception as exc:
        return {
            "success": False,
            "data": {"provider": provider, "valid": False},
            "error": str(exc)[:200],
        }
