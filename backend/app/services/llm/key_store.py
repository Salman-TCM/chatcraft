"""
Encrypted user API key store.
Keys are encrypted with Fernet (AES-128-CBC) using a key derived from SECRET_KEY.
"""

import base64
import hashlib
import uuid

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_api_key import UserApiKey


def _fernet() -> Fernet:
    from app.core.config import settings

    raw = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_key(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_key(encrypted: str) -> str:
    return _fernet().decrypt(encrypted.encode()).decode()


async def get_all_keys(user_id: uuid.UUID, db: AsyncSession) -> dict[str, str]:
    """Return {provider: plaintext_key} for every key this user has saved.

    For "self_hosted", also stashes the endpoint under the
    "self_hosted_base_url" pseudo-key so callers that only thread through a
    flat api_keys dict (LLMRouter, agents.py) get it for free.
    """
    result = await db.execute(select(UserApiKey).where(UserApiKey.user_id == user_id))
    out: dict[str, str] = {}
    for row in result.scalars().all():
        try:
            out[row.provider] = decrypt_key(row.api_key_encrypted)
        except (InvalidToken, Exception):
            continue
        if row.provider == "self_hosted" and row.base_url:
            out["self_hosted_base_url"] = row.base_url
    return out


async def get_base_url(user_id: uuid.UUID, db: AsyncSession) -> str | None:
    """Return the saved self-hosted endpoint URL for this user, if any."""
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user_id,
            UserApiKey.provider == "self_hosted",
        )
    )
    row = result.scalar_one_or_none()
    return row.base_url if row else None


async def get_key(user_id: uuid.UUID, provider: str, db: AsyncSession) -> str | None:
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user_id,
            UserApiKey.provider == provider,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    try:
        return decrypt_key(row.api_key_encrypted)
    except (InvalidToken, Exception):
        return None
