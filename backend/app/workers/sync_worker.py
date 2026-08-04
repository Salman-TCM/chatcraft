"""
Celery tasks for periodic sync operations.
"""

import asyncio
from datetime import UTC

from app.workers.celery_app import celery_app


@celery_app.task(
    name="workers.sync_docs_system_prompts",
    bind=True,
    max_retries=1,
    default_retry_delay=120,
    queue="default",
    acks_late=True,
)
def sync_docs_system_prompts(self) -> dict:
    """Sync Google Docs → system prompt for all chatbots with a linked doc."""
    return asyncio.get_event_loop().run_until_complete(_sync_all())


async def _sync_all() -> dict:
    """Fetch all chatbots with docs_system_prompt_doc_id and sync each."""
    from datetime import datetime, timedelta

    from sqlalchemy import select

    from app.api.chatbots import _sync_doc_to_prompt
    from app.db.session import AsyncSessionLocal
    from app.models.chatbot_config import ChatbotConfig

    synced = failed = 0
    cutoff = datetime.now(UTC) - timedelta(minutes=10)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ChatbotConfig).where(
                ChatbotConfig.docs_system_prompt_doc_id.isnot(None),
            )
        )
        bots = result.scalars().all()
        for bot in bots:
            # Skip if synced within last 10 minutes
            if bot.docs_system_prompt_synced_at and bot.docs_system_prompt_synced_at > cutoff:
                continue
            try:
                content = await _sync_doc_to_prompt(bot, db)
                if content:
                    synced += 1
                else:
                    failed += 1
            except Exception:
                failed += 1

    return {"synced": synced, "failed": failed}
