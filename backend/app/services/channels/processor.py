"""
Unified incoming-message processor.

Flow:
  receive(chatbot_id, channel, sender_id, text, sender_name?)
    → find/create Contact
    → find/create Conversation (open one per sender+chatbot+channel)
    → persist user Message
    → load history + RAG
    → LLM complete (non-streaming)
    → persist assistant Message
    → send reply via ChannelSender
    → log usage
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation
from app.models.crm import Contact
from app.models.message import Message, MessageRole
from app.services import usage as usage_svc
from app.services.channels import get_sender
from app.services.kb.rag import RAGService
from app.services.llm import (
    ChatMessage,
    LLMRouter,
    SystemPromptContext,
    build_system_prompt,
    sanitize,
)


async def process_incoming(
    chatbot_id: uuid.UUID,
    channel: str,
    sender_id: str,        # e.g. Telegram chat_id, WhatsApp phone, FB PSID
    text: str,
    sender_name: str | None = None,
    sender_phone: str | None = None,
) -> None:
    """Process one incoming channel message end-to-end."""
    async with AsyncSessionLocal() as db:
        # ── load chatbot ──────────────────────────────────────────────────────
        bot: ChatbotConfig | None = await db.get(ChatbotConfig, chatbot_id)
        if not bot:
            return

        # ── find/create contact ───────────────────────────────────────────────
        contact = await _get_or_create_contact(
            db, bot.user_id, sender_id, sender_name, sender_phone
        )

        # ── find/create conversation ──────────────────────────────────────────
        conv = await _get_or_create_conversation(
            db, chatbot_id, channel, contact.id, sender_id
        )

        # ── persist user message ──────────────────────────────────────────────
        sanitized = sanitize(text)
        user_msg = Message(
            conversation_id=conv.id,
            role=MessageRole.user,
            content=sanitized,
        )
        db.add(user_msg)
        conv.last_message_at = datetime.now(timezone.utc)
        conv.unread_count = (conv.unread_count or 0) + 1
        await db.commit()

        # ── skip AI reply if agent has taken over ────────────────────────────
        if conv.status == "human_takeover":
            return

        # ── build LLM context ─────────────────────────────────────────────────
        history = await _load_history(db, conv.id, limit=20)
        rag = RAGService(db)
        knowledge_context, _ = await rag.query(chatbot_id=chatbot_id, user_message=sanitized)

        sys_ctx = SystemPromptContext(
            chatbot_name=bot.name,
            custom_instructions=bot.system_prompt,
            knowledge_context=knowledge_context,
        )
        system_prompt = build_system_prompt(sys_ctx)

        llm_messages: list[ChatMessage] = [ChatMessage(role="system", content=system_prompt)]
        llm_messages.extend(history)

        # ── call LLM (non-streaming) ──────────────────────────────────────────
        llm_router = LLMRouter(model=bot.default_model)
        try:
            response = await llm_router.complete(llm_messages)
        except Exception:
            return  # don't crash the webhook; message is still saved

        reply_text = response.content.strip()

        # ── persist assistant message ─────────────────────────────────────────
        asst_msg = Message(
            conversation_id=conv.id,
            role=MessageRole.assistant,
            content=reply_text,
            model=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            cost_usd=response.cost_usd,
        )
        db.add(asst_msg)
        conv.last_message_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(asst_msg)

        # ── log usage ─────────────────────────────────────────────────────────
        await usage_svc.log_llm(
            user_id=bot.user_id,
            chatbot_id=chatbot_id,
            conversation_id=conv.id,
            model=response.model or bot.default_model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            cost_usd=response.cost_usd,
        )

        # ── send reply via channel ────────────────────────────────────────────
        from app.models.channel_integration import ChannelIntegration
        result = await db.execute(
            select(ChannelIntegration).where(
                ChannelIntegration.chatbot_id == chatbot_id,
                ChannelIntegration.channel == channel,
                ChannelIntegration.is_active.is_(True),
            )
        )
        integration = result.scalar_one_or_none()
        if integration:
            sender = get_sender(channel, integration.config)
            try:
                await sender.send(sender_id, reply_text)
            except Exception:
                pass  # delivery failure doesn't roll back the saved message


async def _get_or_create_contact(
    db: AsyncSession,
    owner_user_id: uuid.UUID,
    channel_sender_id: str,
    name: str | None,
    phone: str | None,
) -> Contact:
    """Look up contact by channel sender ID; create if absent."""
    result = await db.execute(
        select(Contact).where(
            Contact.user_id == owner_user_id,
            Contact.contact_id == channel_sender_id,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        first, _, last = (name or "").partition(" ")
        contact = Contact(
            user_id=owner_user_id,
            contact_id=channel_sender_id,
            first_name=first or None,
            last_name=last or None,
            phone=phone,
            source="channel",
        )
        db.add(contact)
        await db.flush()
    return contact


async def _get_or_create_conversation(
    db: AsyncSession,
    chatbot_id: uuid.UUID,
    channel: str,
    contact_id: uuid.UUID,
    sender_id: str,
) -> Conversation:
    """Return the latest open conversation for this sender, or start a new one."""
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.chatbot_id == chatbot_id,
            Conversation.channel == channel,
            Conversation.contact_id == contact_id,
            Conversation.status == "active",
        )
        .order_by(Conversation.created_at.desc())
        .limit(1)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        conv = Conversation(
            chatbot_id=chatbot_id,
            channel=channel,
            contact_id=contact_id,
            guest_id=sender_id,
            status="active",
        )
        db.add(conv)
        await db.flush()
    return conv


async def _load_history(
    db: AsyncSession, conversation_id: uuid.UUID, limit: int = 20
) -> list[ChatMessage]:
    result = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.role != MessageRole.system,
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    msgs = list(reversed(result.scalars().all()))
    return [ChatMessage(role=m.role.value, content=m.content) for m in msgs]
