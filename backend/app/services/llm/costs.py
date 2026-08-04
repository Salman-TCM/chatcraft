from decimal import Decimal

# Cost per 1 000 000 tokens (input, output) in USD.
# Update these when providers change pricing.
_MODEL_COSTS: dict[str, tuple[Decimal, Decimal]] = {
    # Anthropic
    "claude-opus-4-8": (Decimal("5.00"), Decimal("25.00")),
    "claude-opus-4-7": (Decimal("5.00"), Decimal("25.00")),
    "claude-sonnet-5": (
        Decimal("2.00"),
        Decimal("10.00"),
    ),  # introductory price thru 2026-08-31, then 3.00/15.00
    "claude-sonnet-4-6": (Decimal("3.00"), Decimal("15.00")),
    "claude-haiku-4-5": (Decimal("1.00"), Decimal("5.00")),
    "claude-fable-5": (Decimal("10.00"), Decimal("50.00")),
    # OpenAI
    "gpt-5.6-sol": (Decimal("5.00"), Decimal("30.00")),
    "gpt-5.6-terra": (Decimal("2.50"), Decimal("15.00")),
    "gpt-5.6-luna": (Decimal("1.00"), Decimal("6.00")),
    "gpt-4o": (Decimal("5.00"), Decimal("15.00")),
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.60")),
    # Google
    "gemini-1.5-pro": (Decimal("3.50"), Decimal("10.50")),
    "gemini-1.5-flash": (Decimal("0.075"), Decimal("0.30")),
    "gemini-2.0-flash": (Decimal("0.10"), Decimal("0.40")),
    "gemini-2.5-pro": (Decimal("7.00"), Decimal("21.00")),
    "gemini-2.5-flash": (Decimal("0.15"), Decimal("0.60")),
    "gemini-3.1-pro": (Decimal("2.00"), Decimal("12.00")),  # doubles above 200K context
    "gemini-3.6-flash": (Decimal("1.50"), Decimal("7.50")),
    # OpenAI (new)
    "gpt-5": (Decimal("10.00"), Decimal("30.00")),
    "gpt-5-mini": (Decimal("0.40"), Decimal("1.60")),
    # DeepSeek
    "deepseek-v4-flash": (Decimal("0.14"), Decimal("0.28")),
    "deepseek-v4-pro": (Decimal("0.435"), Decimal("0.87")),
    "deepseek-chat": (Decimal("0.27"), Decimal("1.10")),  # legacy alias, deprecates 2026-07-24
    "deepseek-reasoner": (Decimal("0.55"), Decimal("2.19")),  # legacy alias, deprecates 2026-07-24
    # Groq
    "openai/gpt-oss-120b": (Decimal("0.15"), Decimal("0.60")),
    "openai/gpt-oss-20b": (Decimal("0.075"), Decimal("0.30")),
    "qwen/qwen3.6-27b": (Decimal("0.60"), Decimal("3.00")),
    "llama-3.3-70b-versatile": (Decimal("0.59"), Decimal("0.79")),
    "llama-3.1-8b-instant": (Decimal("0.05"), Decimal("0.08")),
    "mixtral-8x7b-32768": (
        Decimal("0.24"),
        Decimal("0.24"),
    ),  # retired by Groq; kept for existing saved configs
    # Perplexity
    "sonar": (Decimal("1.00"), Decimal("1.00")),
    "sonar-pro": (Decimal("3.00"), Decimal("15.00")),
    "sonar-reasoning-pro": (Decimal("2.00"), Decimal("8.00")),
    "sonar-deep-research": (
        Decimal("2.00"),
        Decimal("8.00"),
    ),  # excludes citation/reasoning token surcharges
    "sonar-reasoning": (Decimal("1.00"), Decimal("5.00")),  # legacy alias
    # xAI Grok
    "grok-4.5": (Decimal("2.00"), Decimal("6.00")),
    "grok-4.3": (Decimal("1.25"), Decimal("2.50")),
    "grok-3": (Decimal("3.00"), Decimal("15.00")),
    "grok-3-fast": (Decimal("5.00"), Decimal("25.00")),
    "grok-3-mini": (Decimal("0.30"), Decimal("0.50")),
    "grok-3-mini-fast": (Decimal("0.60"), Decimal("4.00")),
}

_FALLBACK_COST = (Decimal("5.00"), Decimal("15.00"))


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """Return cost in USD for the given token counts."""
    input_rate, output_rate = _MODEL_COSTS.get(model, _FALLBACK_COST)
    return input_rate * Decimal(input_tokens) / Decimal("1_000_000") + output_rate * Decimal(
        output_tokens
    ) / Decimal("1_000_000")


def supported_models() -> list[str]:
    return list(_MODEL_COSTS.keys())
