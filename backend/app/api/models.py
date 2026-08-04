"""
GET /api/v1/models — list all LLM models available to the authenticated user.

A model is "available" when the user has saved a BYOK for that provider
OR the platform has a global key configured in settings.
"""

from fastapi import APIRouter

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.core.plan_limits import is_model_allowed
from app.services.llm.key_store import get_all_keys

router = APIRouter(prefix="/api/v1", tags=["models"])

_PROVIDER_SETTINGS_KEY = {
    "anthropic": "anthropic_api_key",
    "openai": "openai_api_key",
    "google": "google_ai_api_key",
    "groq": "groq_api_key",
    "deepseek": "deepseek_api_key",
    "perplexity": "perplexity_api_key",
    "xai": "xai_api_key",
}

_PROVIDER_META = [
    {
        "provider": "anthropic",
        "label": "Anthropic",
        "models": [
            {"id": "claude-sonnet-5", "name": "Claude Sonnet 5"},
            {"id": "claude-opus-4-8", "name": "Claude Opus 4.8"},
            {"id": "claude-fable-5", "name": "Claude Fable 5"},
            {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6"},
            {"id": "claude-opus-4-7", "name": "Claude Opus 4.7"},
            {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5"},
        ],
    },
    {
        "provider": "openai",
        "label": "OpenAI",
        "models": [
            {"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol"},
            {"id": "gpt-5.6-terra", "name": "GPT-5.6 Terra"},
            {"id": "gpt-5.6-luna", "name": "GPT-5.6 Luna"},
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            {"id": "gpt-5", "name": "GPT-5"},
            {"id": "gpt-5-mini", "name": "GPT-5 Mini"},
        ],
    },
    {
        "provider": "google",
        "label": "Google Gemini",
        "models": [
            {"id": "gemini-3.1-pro", "name": "Gemini 3.1 Pro"},
            {"id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash"},
            {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
            {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
        ],
    },
    {
        "provider": "groq",
        "label": "Groq",
        "models": [
            {"id": "openai/gpt-oss-120b", "name": "GPT-OSS 120B"},
            {"id": "openai/gpt-oss-20b", "name": "GPT-OSS 20B"},
            {"id": "qwen/qwen3.6-27b", "name": "Qwen 3.6 27B"},
            {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B"},
            {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B Instant"},
        ],
    },
    {
        "provider": "deepseek",
        "label": "DeepSeek",
        "models": [
            {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro"},
            {"id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash"},
        ],
    },
    {
        "provider": "perplexity",
        "label": "Perplexity",
        "models": [
            {"id": "sonar-pro", "name": "Sonar Pro"},
            {"id": "sonar", "name": "Sonar"},
            {"id": "sonar-reasoning-pro", "name": "Sonar Reasoning Pro"},
            {"id": "sonar-deep-research", "name": "Sonar Deep Research"},
        ],
    },
    {
        "provider": "xai",
        "label": "xAI (Grok)",
        "models": [
            {"id": "grok-4.5", "name": "Grok 4.5"},
            {"id": "grok-4.3", "name": "Grok 4.3"},
            {"id": "grok-3", "name": "Grok 3"},
            {"id": "grok-3-fast", "name": "Grok 3 Fast"},
            {"id": "grok-3-mini", "name": "Grok 3 Mini"},
            {"id": "grok-3-mini-fast", "name": "Grok 3 Mini Fast"},
        ],
    },
]


@router.get("/models")
async def list_models(user: CurrentUser, db: DBSession) -> dict:
    user_keys = await get_all_keys(user.id, db)

    result = []
    for meta in _PROVIDER_META:
        provider = meta["provider"]
        settings_key = _PROVIDER_SETTINGS_KEY.get(provider, "")
        platform_key = getattr(settings, settings_key, "") if settings_key else ""
        available = bool(user_keys.get(provider)) or bool(platform_key)
        result.append(
            {
                "provider": provider,
                "label": meta["label"],
                "available": available,
                "models": [
                    {**m, "allowed": is_model_allowed(user.role, m["id"])} for m in meta["models"]
                ],
            }
        )

    return {"success": True, "data": result}
