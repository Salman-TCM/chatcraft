"""Celery tasks for drip sequence step delivery."""

import uuid
from datetime import UTC

from app.workers.celery_app import celery_app


@celery_app.task(name="sequence.advance_enrollment", bind=True, max_retries=3)
def advance_enrollment(self, enrollment_id: str) -> None:
    """Deliver the current step's message and schedule the next one."""
    import asyncio

    async def _advance() -> None:
        from datetime import datetime

        from sqlalchemy import select

        from app.db.session import AsyncSessionLocal
        from app.models.automation import Sequence, SequenceEnrollment
        from app.models.conversation import Conversation
        from app.models.message import Message, MessageRole

        async with AsyncSessionLocal() as db:
            enrollment = await db.get(SequenceEnrollment, uuid.UUID(enrollment_id))
            if not enrollment or enrollment.status != "active":
                return

            sequence = await db.get(Sequence, enrollment.sequence_id)
            if not sequence:
                return

            steps = sequence.steps or []
            step_idx = enrollment.current_step

            if step_idx >= len(steps):
                enrollment.status = "completed"
                enrollment.completed_at = datetime.now(UTC)
                await db.commit()
                return

            step = steps[step_idx]

            # Send message for this step (if it has text)
            msg_text = step.get("message_text", "")
            if msg_text:
                # Find the contact's most recent active conversation
                result = await db.execute(
                    select(Conversation)
                    .join(
                        __import__(
                            "app.models.chatbot_config", fromlist=["ChatbotConfig"]
                        ).ChatbotConfig,
                        Conversation.chatbot_id
                        == __import__(
                            "app.models.chatbot_config", fromlist=["ChatbotConfig"]
                        ).ChatbotConfig.id,
                    )
                    .where(
                        Conversation.contact_id == enrollment.contact_id,
                        Conversation.status == "active",
                    )
                    .order_by(Conversation.last_message_at.desc().nulls_last())
                    .limit(1)
                )
                conv = result.scalar_one_or_none()

                if conv:
                    db.add(
                        Message(
                            conversation_id=conv.id,
                            role=MessageRole.assistant,
                            content=msg_text,
                        )
                    )
                    conv.last_message_at = datetime.now(UTC)

            # Advance to next step
            enrollment.current_step = step_idx + 1

            if enrollment.current_step >= len(steps):
                enrollment.status = "completed"
                enrollment.completed_at = datetime.now(UTC)
                await db.commit()
                return

            await db.commit()

            # Schedule next step
            next_step = steps[enrollment.current_step]
            delay_s = _step_delay_seconds(next_step)
            advance_enrollment.apply_async(args=[enrollment_id], countdown=delay_s)

    asyncio.run(_advance())


def _step_delay_seconds(step: dict) -> int:
    amount = int(step.get("delay_amount", 1))
    unit = step.get("delay_unit", "hours")
    return amount * {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}.get(unit, 3600)
