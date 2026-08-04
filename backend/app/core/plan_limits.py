"""
Centralized plan/tier limits — single source of truth for what each
UserRole may do. Keep in sync with the pricing copy in
frontend/app/pricing/page.tsx.

Message caps (free/trial/premium) live in Settings (app/core/config.py)
since they're operationally tunable. Chatbot count and model access are
structural product limits and live here instead.
"""

from app.core.features import ALL_FEATURE_KEYS
from app.models.user import UserRole

# Max chatbots a role may create. Absent from the dict = unlimited.
_CHATBOT_CAPS: dict[UserRole, int] = {
    UserRole.free: 1,
}

# Feature areas available on Free — the baseline CRM/automation toolset
# marketed as included on the landing page's core "Everything you need"
# section. Anything not listed here is Pro+ (see below).
FREE_TIER_FEATURES: frozenset[str] = frozenset(
    {
        "chatbots",
        "inbox",
        "contacts",
        "flows",
        "automations",
        "campaigns",
        "social",
        "forms",
        "landing_pages",
        "wallet",
        "keywords",
        "sequences",
        "pipelines",
        "stores",
    }
)

# Feature areas exclusive to Enterprise (the "creator" role), matching the
# pricing page's "Custom branding & white-label" Enterprise-only bullet.
# Pro (premium/trial) gets every other feature.
ENTERPRISE_ONLY_FEATURES: frozenset[str] = frozenset({"white_label"})

# Models available on the Free plan ("Basic AI models" in pricing copy) —
# the cheapest/fastest model from each provider, so free users still get a
# genuine choice of provider, just not the flagship/expensive tier.
# Every other role (trial, premium, creator, admin, superadmin) gets every
# model in app.services.llm.costs.supported_models().
FREE_TIER_MODELS_BY_PROVIDER: dict[str, str] = {
    "anthropic": "claude-haiku-4-5",
    "openai": "gpt-4o-mini",
    "google": "gemini-2.5-flash",
    "groq": "llama-3.1-8b-instant",
    "deepseek": "deepseek-v4-flash",
    "perplexity": "sonar",
    "xai": "grok-3-mini",
}
FREE_TIER_MODELS: frozenset[str] = frozenset(FREE_TIER_MODELS_BY_PROVIDER.values())

# Safe default for any role — cheap, fast, high quality. Used as the
# schema default for new chatbots and as the fallback when a bot's
# configured model is no longer allowed for its owner's current plan and
# no better provider-matched option is available.
DEFAULT_MODEL: str = "claude-haiku-4-5"


def chatbot_cap(role: UserRole) -> int | None:
    """Max chatbots this role may create. None = unlimited."""
    return _CHATBOT_CAPS.get(role)


def role_default_features(role: UserRole) -> list[str] | None:
    """Effective feature allowlist for a role that has no explicit
    per-user override (User.allowed_features is None).

    None = unrestricted (all features). An explicit per-user override set
    by an admin always takes precedence over this default — see
    app.core.dependencies.require_feature.
    """
    if role == UserRole.free:
        return sorted(FREE_TIER_FEATURES)
    if role in (UserRole.trial, UserRole.premium):
        return sorted(ALL_FEATURE_KEYS - ENTERPRISE_ONLY_FEATURES)
    return None  # creator, admin, superadmin: unrestricted


def is_model_allowed(role: UserRole, model: str) -> bool:
    """Whether this role may use the given model."""
    if role == UserRole.free:
        return model in FREE_TIER_MODELS
    return True


def best_allowed_model(
    role: UserRole, preferred: str, available_providers: frozenset[str] = frozenset()
) -> str:
    """`preferred` if the role may use it, else the best allowed fallback.

    When downgrading, prefers a free-tier model from a provider the caller
    already has a configured key for (`available_providers`), so a plan
    lapse doesn't turn into an avoidable "no API key" error on top of the
    model downgrade.
    """
    if is_model_allowed(role, preferred):
        return preferred
    for provider in available_providers:
        candidate = FREE_TIER_MODELS_BY_PROVIDER.get(provider)
        if candidate:
            return candidate
    return DEFAULT_MODEL
