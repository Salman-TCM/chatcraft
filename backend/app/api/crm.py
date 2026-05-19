"""
CRM API — Contacts, Tags, Custom Fields, Pipelines.
All routes are under /api/v1/ to match the API reference.
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DBSession
from app.models.crm import (
    Contact,
    ContactFieldValue,
    ContactTag,
    CustomField,
    Pipeline,
    PipelineDeal,
    PipelineStage,
    Tag,
)
from app.schemas.crm import (
    ContactCreate,
    ContactFieldsUpdate,
    ContactResponse,
    ContactUpdate,
    CustomFieldCreate,
    CustomFieldResponse,
    CustomFieldUpdate,
    DealCreate,
    DealResponse,
    DealUpdate,
    PipelineCreate,
    PipelineResponse,
    PipelineUpdate,
    TagCreate,
    TagResponse,
    TagUpdate,
)

router = APIRouter(prefix="/api/v1", tags=["crm"])


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_contact(contact_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Contact:
    result = await db.execute(
        select(Contact)
        .where(Contact.id == contact_id, Contact.user_id == user_id)
        .options(selectinload(Contact.tags), selectinload(Contact.field_values))
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    return contact


async def _get_pipeline(pipeline_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Pipeline:
    result = await db.execute(
        select(Pipeline)
        .where(Pipeline.id == pipeline_id, Pipeline.user_id == user_id)
        .options(selectinload(Pipeline.stages))
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline not found")
    return pipeline


# ══════════════════════════════════════════════════════════════════════════════
# CONTACTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/contacts", response_model=dict)
async def list_contacts(
    user: CurrentUser,
    db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    offset = (page - 1) * limit
    result = await db.execute(
        select(Contact)
        .where(Contact.user_id == user.id)
        .options(selectinload(Contact.tags))
        .order_by(Contact.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    contacts = result.scalars().all()
    return {"success": True, "data": [ContactResponse.model_validate(c) for c in contacts]}


@router.post("/contacts", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_contact(body: ContactCreate, user: CurrentUser, db: DBSession) -> dict:
    contact = Contact(user_id=user.id, **body.model_dump())
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    # Reload with relationships
    contact = await _get_contact(contact.id, user.id, db)
    return {"success": True, "data": ContactResponse.model_validate(contact)}


@router.get("/contacts/search", response_model=dict)
async def search_contacts(
    user: CurrentUser,
    db: DBSession,
    q: Annotated[str, Query(min_length=1)] = "",
    email: str | None = None,
    phone: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    offset = (page - 1) * limit
    stmt = (
        select(Contact)
        .where(Contact.user_id == user.id)
        .options(selectinload(Contact.tags))
        .order_by(Contact.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if email:
        stmt = stmt.where(Contact.email.ilike(f"%{email}%"))
    elif phone:
        stmt = stmt.where(Contact.phone.ilike(f"%{phone}%"))
    elif q:
        stmt = stmt.where(
            or_(
                Contact.first_name.ilike(f"%{q}%"),
                Contact.last_name.ilike(f"%{q}%"),
                Contact.email.ilike(f"%{q}%"),
                Contact.phone.ilike(f"%{q}%"),
            )
        )
    result = await db.execute(stmt)
    contacts = result.scalars().all()
    return {"success": True, "data": [ContactResponse.model_validate(c) for c in contacts]}


@router.get("/contacts/{contact_id}", response_model=dict)
async def get_contact(contact_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    contact = await _get_contact(contact_id, user.id, db)
    return {"success": True, "data": ContactResponse.model_validate(contact)}


@router.patch("/contacts/{contact_id}", response_model=dict)
async def update_contact(
    contact_id: uuid.UUID,
    body: ContactUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    contact = await _get_contact(contact_id, user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)
    await db.commit()
    await db.refresh(contact)
    contact = await _get_contact(contact_id, user.id, db)
    return {"success": True, "data": ContactResponse.model_validate(contact)}


@router.delete("/contacts/{contact_id}", response_model=dict)
async def delete_contact(contact_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    contact = await _get_contact(contact_id, user.id, db)
    await db.delete(contact)
    await db.commit()
    return {"success": True, "data": None}


@router.post("/contacts/{contact_id}/tags", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_tags_to_contact(
    contact_id: uuid.UUID,
    body: dict,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    tag_ids: list[uuid.UUID] = [uuid.UUID(t) for t in body.get("tag_ids", [])]
    contact = await _get_contact(contact_id, user.id, db)

    # Verify tags belong to user
    existing_tag_ids = {t.id for t in contact.tags}
    for tag_id in tag_ids:
        if tag_id in existing_tag_ids:
            continue
        tag_result = await db.execute(
            select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id)
        )
        tag = tag_result.scalar_one_or_none()
        if not tag:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tag {tag_id} not found")
        db.add(ContactTag(contact_id=contact_id, tag_id=tag_id))

    await db.commit()
    contact = await _get_contact(contact_id, user.id, db)
    return {"success": True, "data": ContactResponse.model_validate(contact)}


@router.delete("/contacts/{contact_id}/tags/{tag_id}", response_model=dict)
async def remove_tag_from_contact(
    contact_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    # Verify ownership
    await _get_contact(contact_id, user.id, db)
    result = await db.execute(
        select(ContactTag).where(
            ContactTag.contact_id == contact_id,
            ContactTag.tag_id == tag_id,
        )
    )
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not on contact")
    await db.delete(ct)
    await db.commit()
    return {"success": True, "data": None}


@router.get("/contacts/{contact_id}/fields", response_model=dict)
async def get_contact_fields(contact_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    contact = await _get_contact(contact_id, user.id, db)
    return {
        "success": True,
        "data": [{"field_id": str(v.field_id), "value": v.value} for v in contact.field_values],
    }


@router.put("/contacts/{contact_id}/fields", response_model=dict)
async def update_contact_fields(
    contact_id: uuid.UUID,
    body: ContactFieldsUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _get_contact(contact_id, user.id, db)

    for field_key, value in body.fields.items():
        # Resolve field_key → field_id (must belong to this user)
        cf_result = await db.execute(
            select(CustomField).where(
                CustomField.field_key == field_key,
                CustomField.user_id == user.id,
            )
        )
        cf = cf_result.scalar_one_or_none()
        if not cf:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Custom field '{field_key}' not found",
            )

        fv_result = await db.execute(
            select(ContactFieldValue).where(
                ContactFieldValue.contact_id == contact_id,
                ContactFieldValue.field_id == cf.id,
            )
        )
        fv = fv_result.scalar_one_or_none()
        if fv:
            fv.value = value
        else:
            db.add(ContactFieldValue(contact_id=contact_id, field_id=cf.id, value=value))

    await db.commit()
    contact = await _get_contact(contact_id, user.id, db)
    return {
        "success": True,
        "data": [{"field_id": str(v.field_id), "value": v.value} for v in contact.field_values],
    }


# ══════════════════════════════════════════════════════════════════════════════
# TAGS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/tags", response_model=dict)
async def list_tags(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(Tag).where(Tag.user_id == user.id).order_by(Tag.name)
    )
    tags = result.scalars().all()
    return {"success": True, "data": [TagResponse.model_validate(t) for t in tags]}


@router.post("/tags", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_tag(body: TagCreate, user: CurrentUser, db: DBSession) -> dict:
    tag = Tag(user_id=user.id, **body.model_dump())
    db.add(tag)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tag with that name already exists",
        )
    await db.refresh(tag)
    return {"success": True, "data": TagResponse.model_validate(tag)}


@router.patch("/tags/{tag_id}", response_model=dict)
async def update_tag(
    tag_id: uuid.UUID,
    body: TagUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)
    await db.commit()
    await db.refresh(tag)
    return {"success": True, "data": TagResponse.model_validate(tag)}


@router.delete("/tags/{tag_id}", response_model=dict)
async def delete_tag(tag_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    await db.delete(tag)
    await db.commit()
    return {"success": True, "data": None}


# ══════════════════════════════════════════════════════════════════════════════
# CUSTOM FIELDS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/custom-fields", response_model=dict)
async def list_custom_fields(
    user: CurrentUser,
    db: DBSession,
    chatbot_id: uuid.UUID | None = None,
) -> dict:
    stmt = select(CustomField).where(CustomField.user_id == user.id)
    if chatbot_id:
        stmt = stmt.where(CustomField.chatbot_id == chatbot_id)
    result = await db.execute(stmt.order_by(CustomField.created_at))
    fields = result.scalars().all()
    return {"success": True, "data": [CustomFieldResponse.model_validate(f) for f in fields]}


@router.post("/custom-fields", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_custom_field(body: CustomFieldCreate, user: CurrentUser, db: DBSession) -> dict:
    cf = CustomField(user_id=user.id, **body.model_dump())
    db.add(cf)
    await db.commit()
    await db.refresh(cf)
    return {"success": True, "data": CustomFieldResponse.model_validate(cf)}


@router.patch("/custom-fields/{field_id}", response_model=dict)
async def update_custom_field(
    field_id: uuid.UUID,
    body: CustomFieldUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    result = await db.execute(
        select(CustomField).where(CustomField.id == field_id, CustomField.user_id == user.id)
    )
    cf = result.scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cf, field, value)
    await db.commit()
    await db.refresh(cf)
    return {"success": True, "data": CustomFieldResponse.model_validate(cf)}


@router.delete("/custom-fields/{field_id}", response_model=dict)
async def delete_custom_field(field_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(CustomField).where(CustomField.id == field_id, CustomField.user_id == user.id)
    )
    cf = result.scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom field not found")
    await db.delete(cf)
    await db.commit()
    return {"success": True, "data": None}


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINES
# ══════════════════════════════════════════════════════════════════════════════

_DEFAULT_STAGES = [
    {"name": "New Lead", "color": "#6366f1", "order": 0},
    {"name": "Contacted", "color": "#3b82f6", "order": 1},
    {"name": "Qualified", "color": "#f59e0b", "order": 2},
    {"name": "Closed Won", "color": "#10b981", "order": 3},
    {"name": "Closed Lost", "color": "#ef4444", "order": 4},
]


@router.get("/pipelines", response_model=dict)
async def list_pipelines(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(Pipeline)
        .where(Pipeline.user_id == user.id)
        .options(selectinload(Pipeline.stages))
        .order_by(Pipeline.created_at.desc())
    )
    pipelines = result.scalars().all()
    return {"success": True, "data": [PipelineResponse.model_validate(p) for p in pipelines]}


@router.post("/pipelines", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_pipeline(body: PipelineCreate, user: CurrentUser, db: DBSession) -> dict:
    pipeline = Pipeline(
        user_id=user.id,
        name=body.name,
        description=body.description,
        color=body.color,
        chatbot_id=body.chatbot_id,
    )
    db.add(pipeline)
    await db.flush()  # get pipeline.id before adding stages

    if body.stages:
        for i, s in enumerate(body.stages):
            db.add(PipelineStage(pipeline_id=pipeline.id, name=s.name, color=s.color, order=s.order if s.order else i))
    else:
        for s in _DEFAULT_STAGES:
            db.add(PipelineStage(pipeline_id=pipeline.id, **s))

    await db.commit()
    pipeline = await _get_pipeline(pipeline.id, user.id, db)
    return {"success": True, "data": PipelineResponse.model_validate(pipeline)}


@router.get("/pipelines/{pipeline_id}", response_model=dict)
async def get_pipeline(pipeline_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    pipeline = await _get_pipeline(pipeline_id, user.id, db)
    return {"success": True, "data": PipelineResponse.model_validate(pipeline)}


@router.patch("/pipelines/{pipeline_id}", response_model=dict)
async def update_pipeline(
    pipeline_id: uuid.UUID,
    body: PipelineUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    pipeline = await _get_pipeline(pipeline_id, user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pipeline, field, value)
    await db.commit()
    pipeline = await _get_pipeline(pipeline_id, user.id, db)
    return {"success": True, "data": PipelineResponse.model_validate(pipeline)}


@router.delete("/pipelines/{pipeline_id}", response_model=dict)
async def delete_pipeline(pipeline_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    pipeline = await _get_pipeline(pipeline_id, user.id, db)
    pipeline.is_active = False
    await db.commit()
    return {"success": True, "data": None}


@router.get("/pipelines/{pipeline_id}/stages", response_model=dict)
async def list_pipeline_stages(pipeline_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    pipeline = await _get_pipeline(pipeline_id, user.id, db)
    from app.schemas.crm import PipelineStageResponse
    return {"success": True, "data": [PipelineStageResponse.model_validate(s) for s in pipeline.stages]}


@router.get("/pipelines/{pipeline_id}/deals", response_model=dict)
async def list_pipeline_deals(
    pipeline_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    stage_id: uuid.UUID | None = None,
) -> dict:
    await _get_pipeline(pipeline_id, user.id, db)
    stmt = (
        select(PipelineDeal)
        .where(PipelineDeal.pipeline_id == pipeline_id)
        .options(selectinload(PipelineDeal.contact))
        .order_by(PipelineDeal.order)
    )
    if stage_id:
        stmt = stmt.where(PipelineDeal.stage_id == stage_id)
    result = await db.execute(stmt)
    deals = result.scalars().all()
    return {"success": True, "data": [DealResponse.model_validate(d) for d in deals]}


@router.post("/pipelines/{pipeline_id}/deals", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_deal(
    pipeline_id: uuid.UUID,
    body: DealCreate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    pipeline = await _get_pipeline(pipeline_id, user.id, db)

    # Verify stage belongs to this pipeline
    stage_ids = {s.id for s in pipeline.stages}
    if body.stage_id not in stage_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stage not in pipeline")

    # Verify contact belongs to user
    contact_result = await db.execute(
        select(Contact).where(Contact.id == body.contact_id, Contact.user_id == user.id)
    )
    if not contact_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    deal = PipelineDeal(
        pipeline_id=pipeline_id,
        stage_id=body.stage_id,
        contact_id=body.contact_id,
        notes=body.notes,
        deal_value=body.deal_value,
        order=body.order,
    )
    db.add(deal)
    await db.commit()

    result = await db.execute(
        select(PipelineDeal)
        .where(PipelineDeal.id == deal.id)
        .options(selectinload(PipelineDeal.contact))
    )
    deal = result.scalar_one()
    return {"success": True, "data": DealResponse.model_validate(deal)}


@router.patch("/pipelines/{pipeline_id}/deals/{deal_id}", response_model=dict)
async def update_deal(
    pipeline_id: uuid.UUID,
    deal_id: uuid.UUID,
    body: DealUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    pipeline = await _get_pipeline(pipeline_id, user.id, db)

    result = await db.execute(
        select(PipelineDeal)
        .where(PipelineDeal.id == deal_id, PipelineDeal.pipeline_id == pipeline_id)
        .options(selectinload(PipelineDeal.contact))
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")

    if body.stage_id is not None:
        stage_ids = {s.id for s in pipeline.stages}
        if body.stage_id not in stage_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stage not in pipeline")
        deal.stage_id = body.stage_id

    if body.notes is not None:
        deal.notes = body.notes
    if body.deal_value is not None:
        deal.deal_value = body.deal_value
    if body.order is not None:
        deal.order = body.order

    await db.commit()
    await db.refresh(deal)
    result = await db.execute(
        select(PipelineDeal)
        .where(PipelineDeal.id == deal_id)
        .options(selectinload(PipelineDeal.contact))
    )
    deal = result.scalar_one()
    return {"success": True, "data": DealResponse.model_validate(deal)}


@router.delete("/pipelines/{pipeline_id}/deals/{deal_id}", response_model=dict)
async def remove_deal(
    pipeline_id: uuid.UUID,
    deal_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    # Verify pipeline ownership
    await _get_pipeline(pipeline_id, user.id, db)

    result = await db.execute(
        select(PipelineDeal).where(
            PipelineDeal.id == deal_id,
            PipelineDeal.pipeline_id == pipeline_id,
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    await db.delete(deal)
    await db.commit()
    return {"success": True, "data": None}


# ── Contact messaging ─────────────────────────────────────────────────────────

@router.post("/contacts/{contact_id}/messages", response_model=dict, status_code=201)
async def send_message_to_contact(
    contact_id: uuid.UUID,
    body: dict,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    """Send a message to a contact via their most recent chatbot conversation."""
    contact = await _get_contact(contact_id, user.id, db)

    chatbot_id = body.get("chatbot_id")
    channel = body.get("channel", "web")
    text = (body.get("text") or body.get("message") or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="text required")

    from app.models.conversation import Conversation
    from app.models.message import Message, MessageRole
    from datetime import datetime, timezone

    # Find an existing conversation for this contact
    stmt = select(Conversation).where(Conversation.contact_id == contact_id)
    if chatbot_id:
        stmt = stmt.where(Conversation.chatbot_id == uuid.UUID(str(chatbot_id)))
    stmt = stmt.order_by(Conversation.created_at.desc())
    result = await db.execute(stmt)
    conv = result.scalars().first()

    if not conv:
        # Create a new conversation
        from app.models.chatbot_config import ChatbotConfig
        if not chatbot_id:
            # Find any chatbot owned by user
            bot_result = await db.execute(
                select(ChatbotConfig).where(ChatbotConfig.user_id == user.id).limit(1)
            )
            bot = bot_result.scalar_one_or_none()
            if not bot:
                raise HTTPException(status_code=422, detail="chatbot_id required")
            chatbot_id = str(bot.id)
        conv = Conversation(
            chatbot_id=uuid.UUID(str(chatbot_id)),
            contact_id=contact_id,
            channel=channel,
            external_id=str(contact_id),
        )
        db.add(conv)
        await db.flush()

    msg = Message(
        conversation_id=conv.id,
        role=MessageRole.assistant,
        content=text,
    )
    db.add(msg)

    # Try to send via channel sender
    sent_via_channel = False
    try:
        from app.models.channel_integration import ChannelIntegration
        from app.services.channels import get_sender
        ci_result = await db.execute(
            select(ChannelIntegration).where(
                ChannelIntegration.chatbot_id == conv.chatbot_id,
                ChannelIntegration.channel == channel,
                ChannelIntegration.is_active.is_(True),
            )
        )
        ci = ci_result.scalar_one_or_none()
        if ci and contact.contact_id:
            sender = get_sender(channel, ci.config)
            await sender.send(contact.contact_id, text)
            sent_via_channel = True
    except Exception:
        pass

    await db.commit()

    return {
        "success": True,
        "data": {
            "message_id": str(msg.id),
            "conversation_id": str(conv.id),
            "sent_via_channel": sent_via_channel,
        },
    }
