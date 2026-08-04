import re

# Patterns that suggest prompt injection attempts in user content.
# We log and strip rather than hard-block so legitimate users aren't affected.
_INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|context)", re.I
    ),
    re.compile(r"you\s+are\s+now\s+(a\s+)?(?!an?\s+AI|an?\s+assistant)", re.I),
    re.compile(r"disregard\s+(all\s+)?(previous|prior|above)", re.I),
    re.compile(r"forget\s+(everything|all)\s+(above|previous|prior)", re.I),
    re.compile(r"new\s+instructions?\s*:", re.I),
    re.compile(r"system\s+prompt\s*:", re.I),
    re.compile(r"<\s*/?system\s*>", re.I),
    re.compile(r"\[INST\]|\[\/INST\]", re.I),
]

# Hard length cap — prevents context-stuffing via absurdly long messages.
MAX_USER_MESSAGE_CHARS = 32_000


def sanitize(text: str) -> str:
    """
    Strip prompt-injection patterns and enforce length cap.
    Applied to every user message before it reaches the LLM.
    """
    text = text[:MAX_USER_MESSAGE_CHARS]
    for pattern in _INJECTION_PATTERNS:
        text = pattern.sub("[removed]", text)
    return text
