"""
Usage logging — fire-and-forget helpers called after each LLM/TTS/STT request.
All writes use a fresh session so they never block or fail the request path.
"""
from __future__ import annotations

import uuid
from decimal import Decimal


async def log_llm(
    *,
    user_id: uuid.UUID | None,
    chatbot_id: uuid.UUID | None,
    conversation_id: uuid.UUID | None,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: Decimal,
) -> None:
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.usage_log import UsageLog
        async with AsyncSessionLocal() as session:
            session.add(UsageLog(
                user_id=user_id,
                chatbot_id=chatbot_id,
                conversation_id=conversation_id,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
            ))
            await session.commit()
    except Exception:
        pass  # usage logging must never crash the request


async def log_tts(
    *,
    user_id: uuid.UUID | None,
    chatbot_id: uuid.UUID | None,
    chars: int,
) -> None:
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.usage_log import UsageLog
        async with AsyncSessionLocal() as session:
            session.add(UsageLog(user_id=user_id, chatbot_id=chatbot_id, tts_chars=chars))
            await session.commit()
    except Exception:
        pass


async def log_stt(
    *,
    user_id: uuid.UUID | None,
    chatbot_id: uuid.UUID | None,
    stt_secs: float,
) -> None:
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.usage_log import UsageLog
        from decimal import Decimal
        async with AsyncSessionLocal() as session:
            session.add(UsageLog(user_id=user_id, chatbot_id=chatbot_id, stt_secs=Decimal(str(round(stt_secs, 2)))))
            await session.commit()
    except Exception:
        pass


async def log_embeddings(
    *,
    user_id: uuid.UUID | None,
    chatbot_id: uuid.UUID | None,
    tokens: int,
) -> None:
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.usage_log import UsageLog
        async with AsyncSessionLocal() as session:
            session.add(UsageLog(user_id=user_id, chatbot_id=chatbot_id, embedding_tokens=tokens))
            await session.commit()
    except Exception:
        pass
