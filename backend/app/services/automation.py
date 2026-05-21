"""
Automation Dispatcher — fires matching enabled automations when trigger events occur.

Call dispatch() from API endpoints when the triggering event happens:
  new_contact:            after Contact is created
  tag_added:              after ContactTag is inserted       (context: tag_name)
  field_updated:          after ContactFieldValue changes    (context: field_key, value)
  conversation_opened:    after Conversation created
  conversation_closed:    after Conversation status → closed
  pipeline_stage_changed: after PipelineDeal stage changes  (context: stage_id, stage_name)
  payment_received:       after Payment succeeds

Trigger config matching (all optional — empty config matches any):
  tag_added      → {tag: "VIP"}           — only fire for this tag
  field_updated  → {field_key: "email"}   — only fire for this field
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import Automation, AutomationRun


TRIGGER_TYPES = {
    "new_contact",
    "tag_added",
    "field_updated",
    "conversation_opened",
    "conversation_closed",
    "pipeline_stage_changed",
    "payment_received",
    "form_submitted",
}

ACTION_TYPES = {
    "trigger_flow",
    "send_message",
    "add_tag",
    "set_field",
    "add_to_pipeline",
    "send_webhook",
}


async def dispatch(
    trigger_type: str,
    user_id: uuid.UUID,
    db: AsyncSession,
    context: dict | None = None,
) -> None:
    """Find and execute all enabled automations matching trigger_type for user."""
    context = context or {}

    result = await db.execute(
        select(Automation).where(
            Automation.user_id == user_id,
            Automation.trigger_type == trigger_type,
            Automation.enabled.is_(True),
        )
    )
    automations = result.scalars().all()

    for auto in automations:
        if _config_matches(auto.trigger_config, context):
            run_status = "success"
            run_error = None
            try:
                await _execute_action(auto, context, db)
                auto.execution_count = (auto.execution_count or 0) + 1
                auto.last_executed_at = datetime.now(timezone.utc)
            except Exception as exc:
                run_status = "failed"
                run_error = str(exc)
            db.add(AutomationRun(
                automation_id=auto.id,
                trigger_type=auto.trigger_type,
                action_type=auto.action_type,
                status=run_status,
                error=run_error,
            ))

    await db.commit()


def _config_matches(trigger_config: dict, context: dict) -> bool:
    """Check that all keys in trigger_config match the event context."""
    for key, expected in trigger_config.items():
        if str(context.get(key, "")) != str(expected):
            return False
    return True


async def _execute_action(auto: Automation, context: dict, db: AsyncSession) -> None:
    cfg = auto.action_config
    contact_id = context.get("contact_id")
    conversation_id = context.get("conversation_id")

    match auto.action_type:
        case "trigger_flow":
            flow_id_str = cfg.get("flow_id")
            if flow_id_str:
                from app.models.flow import Flow
                from app.services.flow.executor import start_run
                flow = await db.get(Flow, uuid.UUID(flow_id_str))
                if flow and flow.is_active:
                    await start_run(
                        flow, db,
                        contact_id=uuid.UUID(str(contact_id)) if contact_id else None,
                        conversation_id=uuid.UUID(str(conversation_id)) if conversation_id else None,
                        trigger_data=context,
                    )

        case "send_message":
            text = cfg.get("text", "")
            if text and conversation_id:
                from app.models.conversation import Conversation
                from app.models.message import Message, MessageRole
                conv = await db.get(Conversation, uuid.UUID(str(conversation_id)))
                if conv:
                    db.add(Message(
                        conversation_id=conv.id,
                        role=MessageRole.assistant,
                        content=text,
                    ))
                    conv.last_message_at = datetime.now(timezone.utc)

        case "add_tag":
            tag_name = cfg.get("tag", "")
            if tag_name and contact_id:
                from app.models.crm import Tag, ContactTag
                r = await db.execute(
                    select(Tag).where(Tag.name == tag_name, Tag.user_id == auto.user_id)
                )
                tag = r.scalar_one_or_none()
                if tag:
                    existing = await db.execute(
                        select(ContactTag).where(
                            ContactTag.contact_id == uuid.UUID(str(contact_id)),
                            ContactTag.tag_id == tag.id,
                        )
                    )
                    if not existing.scalar_one_or_none():
                        db.add(ContactTag(
                            contact_id=uuid.UUID(str(contact_id)), tag_id=tag.id
                        ))

        case "set_field":
            field_key = cfg.get("field_key", "")
            value = cfg.get("value", "")
            if field_key and contact_id:
                from app.models.crm import CustomField, ContactFieldValue
                r = await db.execute(
                    select(CustomField).where(
                        CustomField.field_key == field_key,
                        CustomField.user_id == auto.user_id,
                    )
                )
                field = r.scalar_one_or_none()
                if field:
                    fv_r = await db.execute(
                        select(ContactFieldValue).where(
                            ContactFieldValue.contact_id == uuid.UUID(str(contact_id)),
                            ContactFieldValue.field_id == field.id,
                        )
                    )
                    fv = fv_r.scalar_one_or_none()
                    if fv:
                        fv.value = value
                    else:
                        db.add(ContactFieldValue(
                            contact_id=uuid.UUID(str(contact_id)),
                            field_id=field.id,
                            value=value,
                        ))

        case "send_webhook":
            url = cfg.get("url", "")
            if url:
                import httpx
                payload = {"trigger_type": auto.trigger_type, "context": context}
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        await client.post(url, json=payload)
                except Exception:
                    pass
