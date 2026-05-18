"""
Keyword Matching Engine.

Called by the channel processor before the LLM on every incoming message.
Returns the first matching active Keyword rule (highest priority first).
"""
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import Keyword


async def match(
    text: str,
    user_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    db: AsyncSession,
) -> Optional[Keyword]:
    """Return the first active keyword rule that matches `text`, or None."""
    result = await db.execute(
        select(Keyword)
        .where(
            Keyword.user_id == user_id,
            Keyword.is_active.is_(True),
            # Match rules scoped to this chatbot OR global (chatbot_id IS NULL)
            (Keyword.chatbot_id == chatbot_id) | (Keyword.chatbot_id.is_(None)),
        )
        .order_by(Keyword.priority.desc(), Keyword.created_at)
    )
    rules = result.scalars().all()

    normalized = text.strip().lower()
    for rule in rules:
        for kw in (rule.keywords or []):
            kw_lower = kw.strip().lower()
            match rule.match_type:
                case "exact":
                    matched = normalized == kw_lower
                case "starts_with":
                    matched = normalized.startswith(kw_lower)
                case _:  # contains (default)
                    matched = kw_lower in normalized
            if matched:
                return rule

    return None
