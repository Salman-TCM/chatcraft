"""
Unified Inbox API — all conversations across channels in one place.
Routes: /api/v1/conversations (list, search, detail, close, reopen, takeover)
        /api/v1/conversations/{id}/messages (list, send)
        /api/v1/conversations/{id}/notes (list, create)
        /api/v1/conversations/{id}/assign
        /api/v1/team (team member management)
"""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import selectinload

from pydantic import BaseModel

from app.core.dependencies import CurrentUser, DBSession
from app.models.chatbot_config import ChatbotConfig
from app.models.crm import Contact, Tag
from app.models.conversation import Conversation
from app.models.inbox import InboxAssignment, InternalNote, TeamMember
from app.models.message import Message, MessageRole
from app.models.user import User

router = APIRouter(prefix="/api/v1", tags=["inbox"])

# ── Helpers ────────────────────────────────────────────────────────────────────

CHANNEL_ICONS: dict[str, str] = {
    "web": "🌐", "facebook": "📘", "instagram": "📷", "whatsapp": "💬",
    "telegram": "✈️", "discord": "🎮", "sms": "📱", "phone": "📞",
    "twitter": "🐦", "tiktok": "🎵", "email": "📧",
}


async def _get_owned_conv(conv_id: uuid.UUID, user_id: uuid.UUID, db) -> Conversation:
    """Return conversation if caller owns the chatbot it belongs to."""
    result = await db.execute(
        select(Conversation)
        .join(ChatbotConfig, Conversation.chatbot_id == ChatbotConfig.id)
        .where(Conversation.id == conv_id, ChatbotConfig.user_id == user_id)
        .options(
            selectinload(Conversation.messages),
            selectinload(Conversation.contact),
            selectinload(Conversation.notes).selectinload(InternalNote.author),
            selectinload(Conversation.assignment).selectinload(InboxAssignment.assignee),
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conv


def _conv_summary(c: Conversation) -> dict:
    last_msg = c.messages[-1] if c.messages else None
    return {
        "id": str(c.id),
        "chatbot_id": str(c.chatbot_id),
        "title": c.title,
        "channel": c.channel,
        "status": c.status,
        "unread_count": c.unread_count,
        "last_message_at": c.last_message_at.isoformat() if c.last_message_at else None,
        "created_at": c.created_at.isoformat(),
        "contact": _contact_brief(c.contact) if c.contact else None,
        "last_message": {
            "role": last_msg.role.value,
            "content": last_msg.content[:200],
        } if last_msg else None,
        "assigned_to": {
            "id": str(c.assignment.assignee.id),
            "email": c.assignment.assignee.email,
            "name": c.assignment.assignee.name,
        } if c.assignment and c.assignment.assignee else None,
    }


def _contact_brief(contact) -> dict | None:
    if not contact:
        return None
    return {
        "id": str(contact.id),
        "name": " ".join(filter(None, [contact.first_name, contact.last_name])) or None,
        "email": contact.email,
        "phone": contact.phone,
    }


def _msg_dict(m: Message) -> dict:
    return {
        "id": str(m.id),
        "role": m.role.value,
        "content": m.content,
        "model": m.model,
        "created_at": m.created_at.isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# CONVERSATIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/conversations", response_model=dict)
async def list_conversations(
    user: CurrentUser,
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    status_filter: str | None = Query(None, alias="status"),
    channel: str | None = None,
    chatbot_id: uuid.UUID | None = None,
) -> dict:
    offset = (page - 1) * limit

    # Base: only conversations whose chatbot is owned by this user
    stmt = (
        select(Conversation)
        .join(ChatbotConfig, Conversation.chatbot_id == ChatbotConfig.id)
        .where(ChatbotConfig.user_id == user.id)
        .options(
            selectinload(Conversation.messages),
            selectinload(Conversation.contact),
            selectinload(Conversation.assignment).selectinload(InboxAssignment.assignee),
        )
        .order_by(
            Conversation.last_message_at.desc().nulls_last(),
            Conversation.created_at.desc(),
        )
        .offset(offset)
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(Conversation.status == status_filter)
    if channel:
        stmt = stmt.where(Conversation.channel == channel)
    if chatbot_id:
        stmt = stmt.where(Conversation.chatbot_id == chatbot_id)

    result = await db.execute(stmt)
    convs = result.scalars().all()

    # Total count
    count_stmt = (
        select(func.count())
        .select_from(Conversation)
        .join(ChatbotConfig, Conversation.chatbot_id == ChatbotConfig.id)
        .where(ChatbotConfig.user_id == user.id)
    )
    if status_filter:
        count_stmt = count_stmt.where(Conversation.status == status_filter)
    if channel:
        count_stmt = count_stmt.where(Conversation.channel == channel)
    total = (await db.execute(count_stmt)).scalar_one()

    return {
        "success": True,
        "data": [_conv_summary(c) for c in convs],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/conversations/search", response_model=dict)
async def search_conversations(
    user: CurrentUser,
    db: DBSession,
    q: Annotated[str, Query(min_length=1)],
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    from app.models.crm import Contact
    offset = (page - 1) * limit

    stmt = (
        select(Conversation)
        .join(ChatbotConfig, Conversation.chatbot_id == ChatbotConfig.id)
        .outerjoin(Contact, Conversation.contact_id == Contact.id)
        .where(
            ChatbotConfig.user_id == user.id,
            or_(
                Contact.email.ilike(f"%{q}%"),
                Contact.phone.ilike(f"%{q}%"),
                Contact.first_name.ilike(f"%{q}%"),
                Contact.last_name.ilike(f"%{q}%"),
                Conversation.title.ilike(f"%{q}%"),
            ),
        )
        .options(
            selectinload(Conversation.messages),
            selectinload(Conversation.contact),
            selectinload(Conversation.assignment).selectinload(InboxAssignment.assignee),
        )
        .order_by(Conversation.last_message_at.desc().nulls_last())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    convs = result.scalars().all()
    return {"success": True, "data": [_conv_summary(c) for c in convs]}


@router.get("/conversations/{conv_id}", response_model=dict)
async def get_conversation(conv_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    conv = await _get_owned_conv(conv_id, user.id, db)
    # Mark as read
    if conv.unread_count > 0:
        conv.unread_count = 0
        await db.commit()
    data = _conv_summary(conv)
    data["messages"] = [_msg_dict(m) for m in conv.messages]
    data["notes"] = [
        {
            "id": str(n.id),
            "content": n.content,
            "author": {"id": str(n.author.id), "name": n.author.name, "email": n.author.email} if n.author else None,
            "created_at": n.created_at.isoformat(),
        }
        for n in conv.notes
    ]
    return {"success": True, "data": data}


@router.post("/conversations/{conv_id}/close", response_model=dict)
async def close_conversation(conv_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    conv = await _get_owned_conv(conv_id, user.id, db)
    conv.status = "closed"
    await db.commit()
    return {"success": True, "data": {"status": "closed"}}


@router.post("/conversations/{conv_id}/reopen", response_model=dict)
async def reopen_conversation(
    conv_id: uuid.UUID, user: CurrentUser, db: DBSession, body: dict = {}
) -> dict:
    conv = await _get_owned_conv(conv_id, user.id, db)
    conv.status = "active"
    if body.get("release_takeover") and conv.status == "human_takeover":
        pass  # status already set to active above
    await db.commit()
    return {"success": True, "data": {"status": "active"}}


@router.post("/conversations/{conv_id}/takeover", response_model=dict)
async def human_takeover(conv_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    conv = await _get_owned_conv(conv_id, user.id, db)
    conv.status = "human_takeover"
    await db.commit()
    return {"success": True, "data": {"status": "human_takeover"}}


# ══════════════════════════════════════════════════════════════════════════════
# MESSAGES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/conversations/{conv_id}/messages", response_model=dict)
async def get_messages(conv_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    conv = await _get_owned_conv(conv_id, user.id, db)
    return {"success": True, "data": [_msg_dict(m) for m in conv.messages]}


@router.post("/conversations/{conv_id}/messages", response_model=dict, status_code=status.HTTP_201_CREATED)
async def send_message(
    conv_id: uuid.UUID,
    body: dict,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    """Send a message as 'assistant' or 'system' from the inbox (human agent reply)."""
    content: str = body.get("content", "").strip()
    role_str: str = body.get("role", "assistant")
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="content required")
    if role_str not in ("assistant", "system"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="role must be assistant or system")

    conv = await _get_owned_conv(conv_id, user.id, db)
    msg = Message(
        conversation_id=conv.id,
        role=MessageRole(role_str),
        content=content,
    )
    db.add(msg)
    conv.last_message_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    return {"success": True, "data": _msg_dict(msg)}


# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL NOTES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/conversations/{conv_id}/notes", response_model=dict)
async def get_notes(conv_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    conv = await _get_owned_conv(conv_id, user.id, db)
    return {
        "success": True,
        "data": [
            {
                "id": str(n.id),
                "content": n.content,
                "author": {"id": str(n.author.id), "name": n.author.name} if n.author else None,
                "created_at": n.created_at.isoformat(),
            }
            for n in conv.notes
        ],
    }


@router.post("/conversations/{conv_id}/notes", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_note(
    conv_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession
) -> dict:
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="content required")
    # Verify ownership
    await _get_owned_conv(conv_id, user.id, db)
    note = InternalNote(conversation_id=conv_id, author_id=user.id, content=content)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return {
        "success": True,
        "data": {
            "id": str(note.id),
            "content": note.content,
            "created_at": note.created_at.isoformat(),
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# ASSIGNMENT
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/conversations/{conv_id}/assign", response_model=dict)
async def assign_conversation(
    conv_id: uuid.UUID, body: dict, user: CurrentUser, db: DBSession
) -> dict:
    assignee_id_str: str | None = body.get("user_id")
    if not assignee_id_str:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="user_id required")

    assignee_id = uuid.UUID(assignee_id_str)
    conv = await _get_owned_conv(conv_id, user.id, db)

    existing = await db.execute(
        select(InboxAssignment).where(InboxAssignment.conversation_id == conv_id)
    )
    assignment = existing.scalar_one_or_none()
    if assignment:
        assignment.assigned_to_user_id = assignee_id
    else:
        assignment = InboxAssignment(conversation_id=conv_id, assigned_to_user_id=assignee_id)
        db.add(assignment)

    await db.commit()
    return {"success": True, "data": {"conversation_id": str(conv_id), "assigned_to_user_id": str(assignee_id)}}


# ══════════════════════════════════════════════════════════════════════════════
# TEAM MEMBERS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/team", response_model=dict)
async def list_team(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(TeamMember)
        .where(TeamMember.owner_user_id == user.id)
        .order_by(TeamMember.created_at)
    )
    members = result.scalars().all()
    return {
        "success": True,
        "data": [
            {
                "id": str(m.id),
                "member_email": m.member_email,
                "member_user_id": str(m.member_user_id) if m.member_user_id else None,
                "role": m.role,
                "status": m.status,
                "created_at": m.created_at.isoformat(),
            }
            for m in members
        ],
    }


@router.post("/team", response_model=dict, status_code=status.HTTP_201_CREATED)
async def invite_team_member(body: dict, user: CurrentUser, db: DBSession) -> dict:
    email: str = body.get("email", "").strip().lower()
    role: str = body.get("role", "agent")
    if not email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="email required")

    # Check if invited user already exists in the platform
    member_user_result = await db.execute(select(User).where(User.email == email))
    member_user = member_user_result.scalar_one_or_none()

    member = TeamMember(
        owner_user_id=user.id,
        member_email=email,
        member_user_id=member_user.id if member_user else None,
        role=role,
        status="active" if member_user else "pending",
    )
    db.add(member)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already invited")
    await db.refresh(member)
    return {
        "success": True,
        "data": {
            "id": str(member.id),
            "member_email": member.member_email,
            "role": member.role,
            "status": member.status,
        },
    }


@router.delete("/team/{member_id}", response_model=dict)
async def remove_team_member(member_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(TeamMember).where(TeamMember.id == member_id, TeamMember.owner_user_id == user.id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")
    await db.delete(member)
    await db.commit()
    return {"success": True, "data": None}


# ── Round-robin assignment ──────────────────────────────────────────────────────

@router.post("/conversations/{conv_id}/assign-roundrobin", response_model=dict)
async def assign_roundrobin(conv_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    """Assign conversation to the next available team member in round-robin order."""
    conv = await _get_owned_conv(conv_id, user.id, db)

    # Get active team members
    members_result = await db.execute(
        select(TeamMember)
        .where(TeamMember.owner_user_id == user.id, TeamMember.status == "active", TeamMember.member_user_id.isnot(None))
        .order_by(TeamMember.created_at)
    )
    members = members_result.scalars().all()
    if not members:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active team members to assign")

    # Count existing assignments per member to find the one with fewest
    from sqlalchemy import case
    counts_result = await db.execute(
        select(
            InboxAssignment.assigned_to_user_id,
            func.count(InboxAssignment.id).label("cnt"),
        )
        .where(InboxAssignment.assigned_to_user_id.in_([m.member_user_id for m in members]))
        .group_by(InboxAssignment.assigned_to_user_id)
    )
    counts = {row.assigned_to_user_id: row.cnt for row in counts_result}

    # Pick member with fewest assignments (ties broken by creation order)
    chosen = min(members, key=lambda m: counts.get(m.member_user_id, 0))

    # Upsert assignment
    existing_result = await db.execute(
        select(InboxAssignment).where(InboxAssignment.conversation_id == conv.id)
    )
    assignment = existing_result.scalar_one_or_none()
    if assignment:
        assignment.assigned_to_user_id = chosen.member_user_id
    else:
        assignment = InboxAssignment(conversation_id=conv.id, assigned_to_user_id=chosen.member_user_id)
        db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    return {
        "success": True,
        "data": {
            "conversation_id": str(conv.id),
            "assigned_to_user_id": str(chosen.member_user_id),
            "assigned_to_email": chosen.member_email,
        },
    }


# ── Contact quick-edit ──────────────────────────────────────────────────────────

class ContactUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    tags: list[str] | None = None


@router.get("/conversations/{conv_id}/contact", response_model=dict)
async def get_conversation_contact(conv_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    """Return the contact linked to a conversation (quick-view in inbox sidebar)."""
    conv = await _get_owned_conv(conv_id, user.id, db)
    if not conv.contact_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No contact linked")
    result = await db.execute(select(Contact).where(Contact.id == conv.contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    return {
        "success": True,
        "data": {
            "id": str(contact.id),
            "first_name": contact.first_name,
            "last_name": contact.last_name,
            "email": contact.email,
            "phone": contact.phone,
            "company": contact.company,
            "tags": [t.name for t in (contact.tags or [])],
        },
    }


@router.patch("/conversations/{conv_id}/contact", response_model=dict)
async def update_conversation_contact(
    conv_id: uuid.UUID, body: ContactUpdateRequest, user: CurrentUser, db: DBSession
) -> dict:
    """Quick-edit the contact linked to a conversation from the inbox sidebar."""
    conv = await _get_owned_conv(conv_id, user.id, db)
    if not conv.contact_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No contact linked")
    result = await db.execute(select(Contact).where(Contact.id == conv.contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if body.first_name is not None:
        contact.first_name = body.first_name
    if body.last_name is not None:
        contact.last_name = body.last_name
    if body.email is not None:
        contact.email = body.email
    if body.phone is not None:
        contact.phone = body.phone
    if body.company is not None:
        contact.company = body.company
    if body.tags is not None:
        # Resolve or create Tag objects for this user
        new_tags = []
        for tag_name in body.tags:
            tag_result = await db.execute(
                select(Tag).where(Tag.user_id == user.id, Tag.name == tag_name)
            )
            tag = tag_result.scalar_one_or_none()
            if not tag:
                tag = Tag(user_id=user.id, name=tag_name)
                db.add(tag)
                await db.flush()
            new_tags.append(tag)
        contact.tags = new_tags

    await db.commit()
    await db.refresh(contact)
    return {
        "success": True,
        "data": {
            "id": str(contact.id),
            "first_name": contact.first_name,
            "last_name": contact.last_name,
            "email": contact.email,
            "phone": contact.phone,
            "company": contact.company,
            "tags": [t.name for t in (contact.tags or [])],
        },
    }
