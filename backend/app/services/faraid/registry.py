"""
Madhhab registry — the extension point for adding another school.

To add a new madhhab: implement `RuleSet` (see base.py) in its own module,
add one line here, and it's available to both the API and the agent tool.
No other file needs to change. See docs/FARAID.md, "Adding another madhhab".
"""

from app.services.faraid.base import RuleSet
from app.services.faraid.hanafi import HanafiRuleSet

_REGISTRY: dict[str, RuleSet] = {
    "hanafi": HanafiRuleSet(),
}

SUPPORTED_MADHHABS: tuple[str, ...] = tuple(_REGISTRY.keys())


def get_ruleset(madhhab: str) -> RuleSet:
    try:
        return _REGISTRY[madhhab]
    except KeyError:
        raise ValueError(
            f"Unsupported madhhab: {madhhab!r}. Supported: {', '.join(SUPPORTED_MADHHABS)}."
        ) from None
