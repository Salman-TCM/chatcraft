from decimal import Decimal

# Cost per 1 000 000 tokens (input, output) in USD.
# Update these when providers change pricing.
_MODEL_COSTS: dict[str, tuple[Decimal, Decimal]] = {
    # Anthropic
    "claude-opus-4-7":       (Decimal("15.00"),  Decimal("75.00")),
    "claude-sonnet-4-6":     (Decimal("3.00"),   Decimal("15.00")),
    "claude-haiku-4-5":      (Decimal("0.80"),   Decimal("4.00")),
    # OpenAI
    "gpt-4o":                (Decimal("5.00"),   Decimal("15.00")),
    "gpt-4o-mini":           (Decimal("0.15"),   Decimal("0.60")),
    # Google
    "gemini-1.5-pro":        (Decimal("3.50"),   Decimal("10.50")),
    "gemini-1.5-flash":      (Decimal("0.075"),  Decimal("0.30")),
    "gemini-2.0-flash":      (Decimal("0.10"),   Decimal("0.40")),
    "gemini-2.5-pro":        (Decimal("7.00"),   Decimal("21.00")),
    "gemini-2.5-flash":      (Decimal("0.15"),   Decimal("0.60")),
    # OpenAI (new)
    "gpt-5":                 (Decimal("10.00"),  Decimal("30.00")),
    "gpt-5-mini":            (Decimal("0.40"),   Decimal("1.60")),
    # DeepSeek
    "deepseek-chat":         (Decimal("0.27"),   Decimal("1.10")),
    "deepseek-reasoner":     (Decimal("0.55"),   Decimal("2.19")),
    # Groq
    "llama-3.3-70b-versatile":  (Decimal("0.59"), Decimal("0.79")),
    "llama-3.1-8b-instant":     (Decimal("0.05"), Decimal("0.08")),
    "mixtral-8x7b-32768":       (Decimal("0.24"), Decimal("0.24")),
    # Perplexity
    "sonar":                 (Decimal("1.00"),   Decimal("1.00")),
    "sonar-pro":             (Decimal("3.00"),   Decimal("15.00")),
    "sonar-reasoning":       (Decimal("1.00"),   Decimal("5.00")),
    # xAI Grok
    "grok-3":                (Decimal("3.00"),   Decimal("15.00")),
    "grok-3-fast":           (Decimal("5.00"),   Decimal("25.00")),
    "grok-3-mini":           (Decimal("0.30"),   Decimal("0.50")),
    "grok-3-mini-fast":      (Decimal("0.60"),   Decimal("4.00")),
}

_FALLBACK_COST = (Decimal("5.00"), Decimal("15.00"))


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """Return cost in USD for the given token counts."""
    input_rate, output_rate = _MODEL_COSTS.get(model, _FALLBACK_COST)
    return (
        input_rate  * Decimal(input_tokens)  / Decimal("1_000_000") +
        output_rate * Decimal(output_tokens) / Decimal("1_000_000")
    )


def supported_models() -> list[str]:
    return list(_MODEL_COSTS.keys())
