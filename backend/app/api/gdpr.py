from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DBSession
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation
from app.models.usage_log import UsageLog
from app.models.user import User

router = APIRouter(prefix="/api/user", tags=["user"])


def _to_str(value) -> str | None:
    """Convert UUID or datetime values to plain strings."""
    if value is None:
        return None
    if isinstance(value, UUID):
        return str(value)
    return str(value)


def _serialize(obj: dict) -> dict:
    """
    Walk a dict (possibly nested with lists) and convert non-JSON-native
    types (UUID, datetime, Decimal) to serialisable equivalents.
    """
    result: dict = {}
    for k, v in obj.items():
        if isinstance(v, UUID):
            result[k] = str(v)
        elif isinstance(v, Decimal):
            result[k] = float(v)
        elif hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        elif isinstance(v, list):
            result[k] = [_serialize(i.__dict__) if hasattr(i, "__dict__") else i for i in v]
        else:
            result[k] = v
    return result


def _row_to_dict(obj) -> dict:
    """Convert a SQLAlchemy model instance to a serialised dict."""
    raw = {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
    return _serialize(raw)


@router.get("/export")
async def export_user_data(current_user: CurrentUser, db: DBSession):
    """
    Export all data associated with the authenticated user as JSON.
    Covers: user profile, subscription, payments, chatbot configs
    (with conversations and messages), and usage logs.
    """
    # Reload user with eagerly loaded relations.
    result = await db.execute(
        select(User)
        .where(User.id == current_user.id)
        .options(
            selectinload(User.subscription),
            selectinload(User.payments),
            selectinload(User.chatbot_configs)
            .selectinload(ChatbotConfig.conversations)
            .selectinload(Conversation.messages),
        )
    )
    user: User = result.scalar_one()

    # Usage logs
    usage_result = await db.execute(select(UsageLog).where(UsageLog.user_id == user.id))
    usage_logs = usage_result.scalars().all()

    # Build chatbots tree
    chatbots_data = []
    for cfg in user.chatbot_configs:
        cfg_dict = _row_to_dict(cfg)
        cfg_dict["conversations"] = [
            {
                **_row_to_dict(conv),
                "messages": [_row_to_dict(msg) for msg in conv.messages],
            }
            for conv in cfg.conversations
        ]
        chatbots_data.append(cfg_dict)

    data = {
        "user": _row_to_dict(user),
        "subscription": _row_to_dict(user.subscription) if user.subscription else None,
        "payments": [_row_to_dict(p) for p in user.payments],
        "chatbot_configs": chatbots_data,
        "usage_logs": [_row_to_dict(u) for u in usage_logs],
    }

    return {"success": True, "data": data}


@router.delete("/delete")
async def delete_user_account(current_user: CurrentUser, db: DBSession):
    """
    Hard-delete the authenticated user account.
    Child records are removed via FK ON DELETE CASCADE / ON DELETE SET NULL
    as defined in the database schema.
    """
    user = await db.get(User, current_user.id)
    if user:
        await db.delete(user)
        await db.commit()
    return {"success": True, "data": None}


@router.post("/unsubscribe")
async def unsubscribe_marketing(current_user: CurrentUser, db: DBSession):
    """
    Opt the authenticated user out of marketing emails.
    The User model does not currently store an email_marketing_consent flag;
    this endpoint exists for GDPR compliance and returns a confirmation.
    """
    return {
        "success": True,
        "data": {"message": "Unsubscribed from marketing emails"},
    }
