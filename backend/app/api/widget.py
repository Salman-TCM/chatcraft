"""
Widget API
  GET  /api/widget/{chatbot_id}/config          — public config (no auth)
  POST /api/widget/{chatbot_id}/chat            — widget chat (embed-token + domain check)
  GET  /api/widget/manage/{chatbot_id}          — owner: get/create widget config
  PUT  /api/widget/manage/{chatbot_id}          — owner: update widget config
  POST /api/widget/manage/{chatbot_id}/rotate-token — owner: regenerate embed token
"""
import json
import secrets
import uuid
from calendar import monthrange
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession, RedisClient
from app.core.security import decode_token
from app.db.session import get_db
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation
from app.models.message import Message, MessageFeedback, MessageRole
from app.models.user import User, UserRole
from app.models.widget_config import WidgetConfig
from app.schemas.chat import ChatRequest
from app.schemas.widget import WidgetConfigResponse, WidgetConfigUpdate, WidgetPublicConfig
from app.services.kb.rag import RAGService
from app.services.llm import (
    ChatMessage,
    LLMRouter,
    SystemPromptContext,
    build_system_prompt,
    sanitize,
)

router = APIRouter(prefix="/api/widget", tags=["widget"])

_optional_bearer = HTTPBearer(auto_error=False)

_GUEST_CAP = settings.free_tier_message_cap


# ── Public config ──────────────────────────────────────────────────────────────

@router.get("/{chatbot_id}/config", response_model=dict)
async def get_widget_config(chatbot_id: uuid.UUID, db: DBSession) -> dict:
    """Return public branding + widget config for widget.js to consume."""
    bot = await db.get(ChatbotConfig, chatbot_id)
    if not bot or not bot.published:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Chatbot not found", "code": "NOT_FOUND"},
        )

    wc = await _get_or_create_widget_config(bot, db)

    cfg = WidgetPublicConfig(
        id=bot.id,
        name=bot.name,
        primary_colour=bot.primary_colour,
        secondary_colour=bot.secondary_colour,
        background_colour=bot.background_colour,
        font_family=bot.font_family,
        welcome_message=bot.welcome_message,
        placeholder_text=bot.placeholder_text,
        bubble_style=bot.bubble_style,
        dark_mode=bot.dark_mode,
        logo_url=bot.logo_url,
        tts_enabled=bot.tts_enabled,
        stt_enabled=bot.stt_enabled,
        position=wc.position,
        show_branding=wc.show_branding,
    )
    return {"success": True, "data": cfg.model_dump()}


# ── Widget chat ────────────────────────────────────────────────────────────────

@router.post("/{chatbot_id}/chat")
async def widget_chat(
    chatbot_id: uuid.UUID,
    body: ChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: DBSession,
    redis: RedisClient,
    x_widget_token: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> StreamingResponse:
    # ── validate embed token ──────────────────────────────────────────────────
    if not x_widget_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "error": "Missing widget token", "code": "MISSING_TOKEN"},
        )

    wc_result = await db.execute(
        select(WidgetConfig).where(WidgetConfig.embed_token == x_widget_token)
    )
    wc = wc_result.scalar_one_or_none()
    if not wc or wc.chatbot_id != chatbot_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "error": "Invalid widget token", "code": "INVALID_TOKEN"},
        )

    # ── domain whitelist check ────────────────────────────────────────────────
    if wc.allowed_domains:
        allowed = [d.strip().lower() for d in wc.allowed_domains.split(",") if d.strip()]
        if "*" not in allowed and allowed:
            req_host = _origin_host(origin or "")
            if req_host not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"success": False, "error": "Domain not allowed", "code": "DOMAIN_NOT_ALLOWED"},
                )

    # ── load chatbot ──────────────────────────────────────────────────────────
    bot = await db.get(ChatbotConfig, chatbot_id)
    if not bot or not bot.published:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Chatbot not found", "code": "NOT_FOUND"},
        )

    # ── guest cap ─────────────────────────────────────────────────────────────
    guest_id = x_guest_id or str(uuid.uuid4())
    count = await _guest_count(redis, guest_id)
    if count >= _GUEST_CAP:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "success": False,
                "error": "Message limit reached",
                "code": "MESSAGE_CAP_REACHED",
                "cap": _GUEST_CAP,
            },
        )

    # ── conversation ──────────────────────────────────────────────────────────
    conv: Conversation | None = None
    if body.conversation_id:
        conv = await db.get(Conversation, body.conversation_id)
        if conv and conv.chatbot_id != chatbot_id:
            conv = None

    if not conv:
        conv = Conversation(chatbot_id=chatbot_id, guest_id=guest_id)
        db.add(conv)
        await db.flush()

    from sqlalchemy import func
    is_first = (await db.execute(
        select(func.count()).select_from(Message).where(
            Message.conversation_id == conv.id, Message.role == MessageRole.user
        )
    )).scalar_one() == 0

    sanitized = sanitize(body.message)
    db.add(Message(conversation_id=conv.id, role=MessageRole.user, content=sanitized))
    await db.commit()
    await db.refresh(conv)

    await _increment_guest(redis, guest_id)

    model_id = bot.default_model
    llm_router = LLMRouter(
        model=model_id,
        fallback_model=bot.fallback_model or settings.default_fallback_model,
    )

    rag = RAGService(db)
    knowledge_context, _ = await rag.query(chatbot_id=chatbot_id, user_message=sanitized)

    sys_ctx = SystemPromptContext(
        chatbot_name=bot.name,
        custom_instructions=bot.system_prompt,
        knowledge_context=knowledge_context,
    )
    system_prompt = build_system_prompt(sys_ctx)

    history = await _load_history(db, conv.id)
    llm_messages = [ChatMessage(role="system", content=system_prompt)] + history

    conv_id = conv.id

    async def event_generator() -> AsyncIterator[str]:
        full: list[str] = []
        try:
            async for chunk in llm_router.stream(llm_messages):
                if await request.is_disconnected():
                    break
                if chunk.done:
                    from app.db.session import AsyncSessionLocal
                    async with AsyncSessionLocal() as session:
                        msg = Message(
                            conversation_id=conv_id,
                            role=MessageRole.assistant,
                            content="".join(full),
                            model=chunk.model,
                            input_tokens=chunk.input_tokens,
                            output_tokens=chunk.output_tokens,
                            cost_usd=chunk.cost_usd,
                        )
                        session.add(msg)
                        await session.commit()
                        await session.refresh(msg)
                        msg_id = msg.id
                    yield _sse(
                        type="done",
                        model=chunk.model,
                        input_tokens=chunk.input_tokens,
                        output_tokens=chunk.output_tokens,
                        cost_usd=str(chunk.cost_usd),
                        conversation_id=str(conv_id),
                        message_id=str(msg_id),
                    )
                    if is_first:
                        from app.api.chat import _generate_title
                        background_tasks.add_task(
                            _generate_title, conv_id, body.message, "".join(full), model_id
                        )
                else:
                    full.append(chunk.delta)
                    yield _sse(type="delta", content=chunk.delta)
        except Exception as exc:
            yield _sse(type="error", error=str(exc))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Guest-ID": guest_id,
        },
    )


# ── Owner: manage widget config ───────────────────────────────────────────────

@router.get("/manage/{chatbot_id}", response_model=dict)
async def get_manage(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(chatbot_id, user.id, db)
    wc = await _get_or_create_widget_config(bot, db)
    return {"success": True, "data": WidgetConfigResponse.model_validate(wc)}


@router.put("/manage/{chatbot_id}", response_model=dict)
async def update_manage(
    chatbot_id: uuid.UUID,
    body: WidgetConfigUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    bot = await _owned_bot(chatbot_id, user.id, db)
    wc = await _get_or_create_widget_config(bot, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(wc, field, value)
    await db.commit()
    await db.refresh(wc)
    return {"success": True, "data": WidgetConfigResponse.model_validate(wc)}


@router.post("/manage/{chatbot_id}/rotate-token", response_model=dict)
async def rotate_token(chatbot_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    bot = await _owned_bot(chatbot_id, user.id, db)
    wc = await _get_or_create_widget_config(bot, db)
    wc.embed_token = secrets.token_urlsafe(48)
    await db.commit()
    await db.refresh(wc)
    return {"success": True, "data": {"embed_token": wc.embed_token}}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_widget_config(bot: ChatbotConfig, db: AsyncSession) -> WidgetConfig:
    result = await db.execute(
        select(WidgetConfig).where(WidgetConfig.chatbot_id == bot.id)
    )
    wc = result.scalar_one_or_none()
    if not wc:
        wc = WidgetConfig(chatbot_id=bot.id)
        db.add(wc)
        await db.commit()
        await db.refresh(wc)
    return wc


async def _owned_bot(
    chatbot_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> ChatbotConfig:
    bot = await db.get(ChatbotConfig, chatbot_id)
    if not bot or bot.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Chatbot not found", "code": "NOT_FOUND"},
        )
    return bot


def _origin_host(origin: str) -> str:
    """Extract hostname from an Origin header value like 'https://example.com'."""
    origin = origin.lower().strip()
    for prefix in ("https://", "http://"):
        if origin.startswith(prefix):
            origin = origin[len(prefix):]
    return origin.split("/")[0].split(":")[0]


async def _guest_count(redis, guest_id: str) -> int:
    now = datetime.now(timezone.utc)
    key = f"guest_cap:{guest_id}:{now.year}-{now.month:02d}"
    val = await redis.get(key)
    return int(val) if val else 0


async def _increment_guest(redis, guest_id: str) -> None:
    now = datetime.now(timezone.utc)
    key = f"guest_cap:{guest_id}:{now.year}-{now.month:02d}"
    _, days = monthrange(now.year, now.month)
    remaining = (days - now.day + 2) * 86400
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, remaining)
    await pipe.execute()


async def _load_history(db: AsyncSession, conversation_id: uuid.UUID) -> list[ChatMessage]:
    from sqlalchemy import select as _sel
    result = await db.execute(
        _sel(Message)
        .where(Message.conversation_id == conversation_id, Message.role != MessageRole.system)
        .order_by(Message.created_at.desc())
        .limit(20)
    )
    msgs = list(reversed(result.scalars().all()))
    return [ChatMessage(role=m.role.value, content=m.content) for m in msgs]


def _sse(**kwargs) -> str:
    return f"data: {json.dumps(kwargs)}\n\n"
