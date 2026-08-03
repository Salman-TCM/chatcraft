"""
Forms API — form CRUD, submissions, and public submission endpoint.

Routes:
  GET    /api/v1/forms
  POST   /api/v1/forms
  GET    /api/v1/forms/{id}
  PATCH  /api/v1/forms/{id}
  DELETE /api/v1/forms/{id}
  GET    /api/v1/forms/{id}/submissions
  POST   /api/public/forms/{public_id}/submit   ← no auth
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import FORMS
from app.models.form import Form, FormSubmission
from app.schemas.forms import FormCreateRequest, FormUpdateRequest, PublicFormSubmitRequest

# Authenticated management routes — requires forms feature access
router = APIRouter(tags=["forms"], dependencies=[Depends(require_feature(FORMS))])
# Public form submission — no feature gate
public_router = APIRouter(tags=["forms"])


def _form_dict(f: Form, include_fields: bool = True) -> dict:
    d: dict = {
        "id": str(f.id),
        "name": f.name,
        "description": f.description,
        "is_active": f.is_active,
        "success_message": f.success_message,
        "submit_button_text": f.submit_button_text,
        "public_id": f.public_id,
        "chatbot_id": str(f.chatbot_id) if f.chatbot_id else None,
        "created_at": f.created_at.isoformat(),
        "updated_at": f.updated_at.isoformat(),
    }
    if include_fields:
        d["fields"] = f.fields or []
    return d


async def _get_owned_form(form_id: uuid.UUID, user_id: uuid.UUID, db) -> Form:
    form = await db.get(Form, form_id)
    if not form or form.user_id != user_id:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


# ── Authenticated CRUD ─────────────────────────────────────────────────────────

@router.get("/api/v1/forms", response_model=dict)
async def list_forms(
    user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> dict:
    offset = (page - 1) * limit
    result = await db.execute(
        select(Form).where(Form.user_id == user.id)
        .order_by(Form.created_at.desc()).offset(offset).limit(limit)
    )
    forms = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(Form).where(Form.user_id == user.id)
    )).scalar_one()
    return {"success": True, "data": [_form_dict(f, include_fields=False) for f in forms], "total": total}


@router.post("/api/v1/forms", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_form(body: FormCreateRequest, user: CurrentUser, db: DBSession) -> dict:
    form = Form(
        user_id=user.id,
        chatbot_id=body.chatbot_id,
        name=body.name,
        description=body.description,
        fields=body.fields,
        is_active=body.is_active,
        success_message=body.success_message,
        submit_button_text=body.submit_button_text,
        public_id=secrets.token_urlsafe(16),
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)
    return {"success": True, "data": _form_dict(form)}


@router.get("/api/v1/forms/{form_id}", response_model=dict)
async def get_form(form_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    form = await _get_owned_form(form_id, user.id, db)
    return {"success": True, "data": _form_dict(form)}


@router.patch("/api/v1/forms/{form_id}", response_model=dict)
async def update_form(form_id: uuid.UUID, body: FormUpdateRequest, user: CurrentUser, db: DBSession) -> dict:
    form = await _get_owned_form(form_id, user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(form, field, value)
    await db.commit()
    await db.refresh(form)
    return {"success": True, "data": _form_dict(form)}


@router.delete("/api/v1/forms/{form_id}", response_model=dict)
async def delete_form(form_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    form = await _get_owned_form(form_id, user.id, db)
    await db.delete(form)
    await db.commit()
    return {"success": True, "data": None}


@router.get("/api/v1/forms/{form_id}/submissions", response_model=dict)
async def list_submissions(
    form_id: uuid.UUID, user: CurrentUser, db: DBSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> dict:
    form = await _get_owned_form(form_id, user.id, db)
    offset = (page - 1) * limit
    result = await db.execute(
        select(FormSubmission)
        .where(FormSubmission.form_id == form.id)
        .order_by(FormSubmission.submitted_at.desc())
        .offset(offset).limit(limit)
    )
    subs = result.scalars().all()
    total = (await db.execute(
        select(func.count()).select_from(FormSubmission).where(FormSubmission.form_id == form.id)
    )).scalar_one()
    return {
        "success": True,
        "data": [
            {
                "id": str(s.id),
                "contact_id": str(s.contact_id) if s.contact_id else None,
                "data": s.data,
                "submitted_at": s.submitted_at.isoformat(),
                "ip_address": s.ip_address,
            }
            for s in subs
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


# ── Public submission (no auth) ────────────────────────────────────────────────

@public_router.post("/api/public/forms/{public_id}/submit", response_model=dict, status_code=status.HTTP_201_CREATED)
async def public_submit(
    public_id: str,
    body: PublicFormSubmitRequest,
    request: Request,
    db: DBSession,
) -> dict:
    data = body.model_dump()

    result = await db.execute(
        select(Form).where(Form.public_id == public_id, Form.is_active.is_(True))
    )
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    # Validate required fields (dynamic, per-form — not expressible as static schema fields)
    fields_def = form.fields or []
    errors: dict[str, str] = {}
    for field_def in fields_def:
        if field_def.get("required") and not data.get(field_def["id"]):
            errors[field_def["id"]] = f"{field_def.get('label', field_def['id'])} is required"
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    # Find or create contact from email/phone in submission
    contact_id: uuid.UUID | None = None
    email = str(data.get("email", "")).strip().lower() or None
    phone = str(data.get("phone", "")).strip() or None

    # Also check field values for email/phone field types
    for field_def in fields_def:
        val = data.get(field_def["id"], "")
        if field_def.get("type") == "email" and val:
            email = email or str(val).strip().lower()
        elif field_def.get("type") == "phone" and val:
            phone = phone or str(val).strip()

    if email or phone:
        from app.models.crm import Contact
        from sqlalchemy import or_
        filters = []
        if email:
            filters.append(Contact.email == email)
        if phone:
            filters.append(Contact.phone == phone)

        c_result = await db.execute(
            select(Contact).where(Contact.user_id == form.user_id, or_(*filters)).limit(1)
        )
        contact = c_result.scalar_one_or_none()
        if not contact:
            first_name = str(data.get("first_name", "")).strip() or None
            last_name = str(data.get("last_name", "")).strip() or None
            contact = Contact(
                user_id=form.user_id,
                email=email,
                phone=phone,
                first_name=first_name,
                last_name=last_name,
                source="form",
            )
            db.add(contact)
            await db.flush()
        contact_id = contact.id

    ip = request.client.host if request.client else None
    submission = FormSubmission(
        form_id=form.id,
        contact_id=contact_id,
        data=data,
        ip_address=ip,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    # Fire automation trigger
    from app.services.automation import dispatch
    await dispatch(
        "form_submitted",
        form.user_id,
        db,
        context={
            "form_id": str(form.id),
            "contact_id": str(contact_id) if contact_id else None,
            "data": data,
        },
    )

    return {
        "success": True,
        "data": {
            "submission_id": str(submission.id),
            "success_message": form.success_message,
        },
    }
