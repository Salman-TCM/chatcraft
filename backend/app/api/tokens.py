"""
API Token Management.

GET    /api/tokens        — list tokens (hash never returned)
POST   /api/tokens        — create token (full value returned once)
DELETE /api/tokens/{id}   — revoke token
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession
from app.models.api_token import ApiToken
from app.schemas.tokens import TokenCreateRequest

router = APIRouter(prefix="/api/tokens", tags=["tokens"])


def _token_dict(t: ApiToken, full_token: str | None = None) -> dict:
    now = datetime.now(timezone.utc)
    expires_at = t.expires_at
    is_expired = expires_at is not None and expires_at < now

    d = {
        "id": str(t.id),
        "name": t.name,
        "token_prefix": t.token_prefix,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "is_expired": is_expired,
        "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
        "created_at": t.created_at.isoformat(),
    }
    if full_token:
        d["token"] = full_token
    return d


@router.get("", response_model=dict)
async def list_tokens(user: CurrentUser, db: DBSession) -> dict:
    result = await db.execute(
        select(ApiToken)
        .where(ApiToken.user_id == user.id)
        .order_by(ApiToken.created_at.desc())
    )
    tokens = result.scalars().all()
    return {"success": True, "data": [_token_dict(t) for t in tokens]}


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_token(body: TokenCreateRequest, user: CurrentUser, db: DBSession) -> dict:
    name = body.name.strip()

    expires_at: datetime | None = None
    if body.expires_in_days is not None:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    raw = "cc_" + secrets.token_hex(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    token_prefix = raw[:12]

    token = ApiToken(
        user_id=user.id,
        name=name,
        token_hash=token_hash,
        token_prefix=token_prefix,
        expires_at=expires_at,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    return {"success": True, "data": _token_dict(token, full_token=raw)}


@router.delete("/{token_id}", response_model=dict)
async def revoke_token(token_id: uuid.UUID, user: CurrentUser, db: DBSession) -> dict:
    token = await db.get(ApiToken, token_id)
    if not token or token.user_id != user.id:
        raise HTTPException(status_code=404, detail="Token not found")
    await db.delete(token)
    await db.commit()
    return {"success": True, "data": None}
