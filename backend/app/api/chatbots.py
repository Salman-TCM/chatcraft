import uuid

from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, DBSession, RedisClient
from app.core.pagination import LimitParam, PageParam, count_query, page_meta, paginate
from app.core.plan_limits import chatbot_cap, is_model_allowed
from app.models.chatbot_config import ChatbotConfig
from app.models.user import User
from app.schemas.chat import ChatbotCreateRequest, ChatbotResponse, ChatbotUpdateRequest
from app.services import storage as storage_svc


def _assert_model_allowed(user: User, model: str | None) -> None:
    if model and not is_model_allowed(user.role, model):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "success": False,
                "error": f"The {model} model isn't available on your current plan. Upgrade to Pro to use it.",
                "code": "MODEL_NOT_ALLOWED",
                "model": model,
            },
        )

router = APIRouter(prefix="/api/chatbots", tags=["chatbots"])


@router.get("", response_model=dict)
async def list_chatbots(
    user: CurrentUser,
    db: DBSession,
    page: PageParam = 1,
    limit: LimitParam = 20,
) -> dict:
    base_q = (
        select(ChatbotConfig)
        .where(ChatbotConfig.user_id == user.id)
        .order_by(ChatbotConfig.created_at.desc())
    )
    total = await count_query(db, base_q)
    result = await db.execute(paginate(base_q, page, limit))
    bots = result.scalars().all()
    return {
        "success": True,
        "data": [ChatbotResponse.model_validate(b) for b in bots],
        "meta": page_meta(page, limit, total),
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_chatbot(
    body: ChatbotCreateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    cap = chatbot_cap(user.role)
    if cap is not None:
        existing = await count_query(
            db, select(ChatbotConfig).where(ChatbotConfig.user_id == user.id)
        )
        if existing >= cap:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": f"Your plan allows up to {cap} chatbot{'s' if cap != 1 else ''}. Upgrade to Pro for unlimited chatbots.",
                    "code": "CHATBOT_LIMIT_REACHED",
                    "limit": cap,
                },
            )

    _assert_model_allowed(user, body.default_model)
    _assert_model_allowed(user, body.fallback_model)

    bot = ChatbotConfig(
        user_id=user.id,
        name=body.name,
        default_model=body.default_model,
        fallback_model=body.fallback_model,
        allow_model_switch=body.allow_model_switch,
        system_prompt=body.system_prompt,
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return {"success": True, "data": ChatbotResponse.model_validate(bot)}


@router.get("/{chatbot_id}", response_model=dict)
async def get_chatbot(
    chatbot_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    return {"success": True, "data": ChatbotResponse.model_validate(bot)}


@router.put("/{chatbot_id}", response_model=dict)
async def update_chatbot(
    chatbot_id: uuid.UUID,
    body: ChatbotUpdateRequest,
    user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
) -> dict:
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    _assert_model_allowed(user, body.default_model)
    _assert_model_allowed(user, body.fallback_model)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(bot, field, value)
    await db.commit()
    await db.refresh(bot)
    if redis is not None:
        try:
            await redis.delete(f"widget:config:{chatbot_id}")
        except Exception:
            pass
    return {"success": True, "data": ChatbotResponse.model_validate(bot)}


@router.post("/{chatbot_id}/logo", response_model=dict)
async def upload_logo(
    chatbot_id: uuid.UUID,
    file: UploadFile,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5 MB

    if file.content_type not in ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"success": False, "error": "Logo must be PNG, JPEG, WebP, or GIF", "code": "INVALID_MIME"},
        )

    data = await file.read()
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"success": False, "error": "Logo must be under 5 MB", "code": "FILE_TOO_LARGE"},
        )

    bot = await _get_owned_bot(chatbot_id, user.id, db)

    ext = (file.filename or "logo").rsplit(".", 1)[-1].lower()
    filename = f"logo_{chatbot_id}.{ext}"
    url = await storage_svc.upload_logo(data, filename, file.content_type or "image/png", str(chatbot_id))

    bot.logo_url = url
    await db.commit()
    await db.refresh(bot)
    return {"success": True, "data": {"logo_url": url}}


@router.delete("/{chatbot_id}", response_model=dict)
async def delete_chatbot(
    chatbot_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    await db.delete(bot)
    await db.commit()
    return {"success": True, "data": None}


# ── Rich content template generator ─────────────────────────────────────────

from pydantic import BaseModel as _BaseModel


class _RichGenRequest(_BaseModel):
    description: str
    template_type: str = "carousel"  # carousel | card | buttons | quick_replies


@router.post("/{chatbot_id}/generate-rich-template", response_model=dict)
async def generate_rich_template(
    chatbot_id: uuid.UUID,
    body: _RichGenRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    """Use AI to generate a <<<RICH>>> JSON template for carousel/card/button content."""
    await _get_owned_bot(chatbot_id, user.id, db)

    from app.services.llm import ChatMessage, LLMRouter
    from app.services.llm.key_store import get_all_keys
    from app.services.llm.router import get_model_provider

    api_keys = await get_all_keys(user.id, db)

    examples = {
        "carousel": '''{"type":"carousel","items":[{"title":"Plan A","subtitle":"Basic features","image_url":"","buttons":[{"type":"url","label":"Sign up","value":"https://example.com"}]},{"title":"Plan B","subtitle":"Pro features","image_url":"","buttons":[{"type":"url","label":"Sign up","value":"https://example.com"}]}]}''',
        "card": '''{"type":"card","title":"Product Name","subtitle":"Short description","image_url":"","buttons":[{"type":"url","label":"Learn more","value":"https://example.com"},{"type":"postback","label":"Add to cart","value":"add_to_cart"}]}''',
        "buttons": '''{"type":"buttons","text":"What would you like to do?","buttons":[{"type":"postback","label":"Option A","value":"option_a"},{"type":"postback","label":"Option B","value":"option_b"}]}''',
        "quick_replies": '''{"type":"quick_replies","text":"Choose an option:","replies":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Maybe","value":"maybe"}]}''',
    }
    example = examples.get(body.template_type, examples["carousel"])

    prompt = f"""You are a JSON generator for a chatbot rich content system.

Generate a valid JSON object for a "{body.template_type}" template based on this description:
{body.description}

The JSON must follow this structure example exactly:
{example}

Rules:
- Return ONLY the raw JSON object, no markdown, no explanation
- Use realistic placeholder text and URLs
- For buttons: type must be "url", "phone", "postback", "email", or "flow"
- Keep titles under 40 chars, subtitles under 80 chars
- For carousel: 2-5 items
- For quick_replies: 2-13 replies
- For buttons: 1-3 buttons
"""

    model = "gpt-4o-mini"
    provider = get_model_provider(model)
    if not api_keys.get(provider):
        # Fall back to any available model
        for m, p in [("claude-haiku-4-5-20251001", "anthropic"), ("gemini-1.5-flash", "google")]:
            if api_keys.get(p):
                model = m
                break
        else:
            raise HTTPException(status_code=402, detail="No AI API key configured")

    llm = LLMRouter(model=model, api_keys=api_keys)
    result = await llm.complete(
        [ChatMessage(role="user", content=prompt)],
        max_tokens=1024,
    )
    raw = result.content.strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
    if raw.endswith("```"):
        raw = "\n".join(raw.split("\n")[:-1])
    raw = raw.strip()

    # Validate JSON
    import json as _json
    try:
        parsed = _json.loads(raw)
    except Exception:
        raise HTTPException(status_code=422, detail=f"AI returned invalid JSON: {raw[:200]}")

    rich_block = f"<<<RICH>>>{_json.dumps(parsed)}<<<END>>>"
    return {"success": True, "data": {"json": parsed, "rich_block": rich_block}}


# ── Google Docs system prompt sync ──────────────────────────────────────────

class _DocsSyncRequest(_BaseModel):
    doc_id: str | None = None  # None to unlink


@router.put("/{chatbot_id}/docs-system-prompt", response_model=dict)
async def set_docs_system_prompt(
    chatbot_id: uuid.UUID,
    body: _DocsSyncRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    """Link (or unlink) a Google Doc as the chatbot's system prompt source."""
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    bot.docs_system_prompt_doc_id = body.doc_id or None
    bot.docs_system_prompt_synced_at = None
    await db.commit()
    await db.refresh(bot)
    if body.doc_id:
        # Trigger immediate sync
        await _sync_doc_to_prompt(bot, db)
    return {"success": True, "data": {
        "doc_id": bot.docs_system_prompt_doc_id,
        "synced_at": bot.docs_system_prompt_synced_at.isoformat() if bot.docs_system_prompt_synced_at else None,
    }}


@router.post("/{chatbot_id}/docs-system-prompt/sync", response_model=dict)
async def sync_docs_system_prompt(
    chatbot_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    """Manually trigger a Google Doc → system prompt sync."""
    bot = await _get_owned_bot(chatbot_id, user.id, db)
    if not bot.docs_system_prompt_doc_id:
        raise HTTPException(status_code=400, detail="No Google Doc linked for this chatbot")
    content = await _sync_doc_to_prompt(bot, db)
    return {"success": True, "data": {
        "synced_at": bot.docs_system_prompt_synced_at.isoformat() if bot.docs_system_prompt_synced_at else None,
        "chars": len(content),
    }}


async def _sync_doc_to_prompt(bot, db) -> str:
    """Fetch Google Doc content and update the chatbot's system prompt."""
    import json as _json
    from datetime import datetime, timezone
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        from app.core.config import settings

        creds_json = getattr(settings, "google_service_account_json", None)
        if not creds_json:
            return ""
        creds = Credentials.from_service_account_info(
            _json.loads(creds_json),
            scopes=["https://www.googleapis.com/auth/documents.readonly"],
        )
        service = build("docs", "v1", credentials=creds, cache_discovery=False)
        doc = service.documents().get(documentId=bot.docs_system_prompt_doc_id).execute()

        # Extract plain text from doc content
        content_parts = []
        for el in doc.get("body", {}).get("content", []):
            for para_el in el.get("paragraph", {}).get("elements", []):
                text = para_el.get("textRun", {}).get("content", "")
                content_parts.append(text)
        content = "".join(content_parts).strip()

        if content:
            bot.system_prompt = content
            bot.docs_system_prompt_synced_at = datetime.now(timezone.utc)
            await db.commit()
        return content
    except Exception:
        return ""


# ── helpers ──────────────────────────────────────────────────────────────────

async def _get_owned_bot(
    chatbot_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> ChatbotConfig:
    bot = await db.get(ChatbotConfig, chatbot_id)
    if not bot or bot.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Chatbot not found", "code": "NOT_FOUND"},
        )
    return bot
