from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.redis import redis_dependency
from app.db.session import get_db

security = HTTPBearer()

# Typed shorthand for injecting a DB session into route handlers
DBSession = Annotated[AsyncSession, Depends(get_db)]

# Typed shorthand for injecting an async Redis client
RedisClient = Annotated[aioredis.Redis, Depends(redis_dependency)]

# Typed shorthand for injecting the raw bearer token
BearerToken = Annotated[HTTPAuthorizationCredentials, Depends(security)]


async def get_current_user(
    credentials: BearerToken,
    db: DBSession,
):
    """Validate JWT (or API token) and return the authenticated User. 401 on any failure."""
    import hashlib
    from sqlalchemy import select
    from app.models.user import User

    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"success": False, "error": "Not authenticated", "code": "NOT_AUTHENTICATED"},
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials

    # ── API token path (starts with "cc_") ──────────────────────────────────
    if token.startswith("cc_"):
        from datetime import datetime, timezone
        from app.models.api_token import ApiToken

        token_hash = hashlib.sha256(token.encode()).hexdigest()
        result = await db.execute(
            select(ApiToken).where(ApiToken.token_hash == token_hash)
        )
        api_token = result.scalar_one_or_none()
        if not api_token:
            raise exc

        if api_token.expires_at and api_token.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"success": False, "error": "API token has expired", "code": "TOKEN_EXPIRED"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = await db.get(User, api_token.user_id)
        if not user:
            raise exc

        # Update last_used_at asynchronously (best-effort; ignore failures)
        try:
            api_token.last_used_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception:
            await db.rollback()

        return user

    # ── JWT path ─────────────────────────────────────────────────────────────
    try:
        payload = decode_token(token)
    except JWTError:
        raise exc

    if payload.get("type") != "access":
        raise exc

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise exc

    user = await db.get(User, user_id)
    if not user:
        raise exc

    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"success": False, "error": "Account suspended", "code": "SUSPENDED"},
        )

    return user


# Typed shorthand for injecting the authenticated user
CurrentUser = Annotated["User", Depends(get_current_user)]  # type: ignore[name-defined]


# ---------------------------------------------------------------------------
# Role-based access control
# ---------------------------------------------------------------------------

def require_role(*allowed_roles: str):
    """
    Dependency factory — returns a FastAPI dependency that enforces role membership.

    Usage:
        @router.get("/admin-only")
        async def admin_only(user: CurrentUser, _: Annotated[None, Depends(require_role("admin"))]):
            ...

    Pre-built aliases below cover the common cases.
    """
    from app.models.user import UserRole

    allowed = {UserRole(r) for r in allowed_roles}

    async def _check(user: CurrentUser) -> None:  # type: ignore[name-defined]
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": "Insufficient permissions",
                    "code": "FORBIDDEN",
                },
            )

    return _check


# Convenience aliases — import these in route files
RequireTrial = Depends(require_role("trial", "premium", "creator", "admin"))
RequirePremium = Depends(require_role("premium", "creator", "admin"))
RequireCreator = Depends(require_role("creator", "admin"))
RequireAdmin = Depends(require_role("admin"))


# ---------------------------------------------------------------------------
# Feature-level access control
# ---------------------------------------------------------------------------

def require_feature(feature: str):
    """
    Dependency factory — enforces that the authenticated user has access to a
    specific feature. Admins always bypass this check.

    User.allowed_features == None  → full access (default, no restriction)
    User.allowed_features == []    → no features allowed
    User.allowed_features == ["wallet", "agent_builder"] → only those features

    Usage:
        router = APIRouter(dependencies=[Depends(require_feature("wallet"))])
    """
    from app.core.features import ALL_FEATURE_KEYS
    from app.models.user import UserRole

    if feature not in ALL_FEATURE_KEYS:
        raise ValueError(f"Unknown feature key: {feature!r}. Valid keys: {ALL_FEATURE_KEYS}")

    async def _check(user: CurrentUser) -> None:  # type: ignore[name-defined]
        if user.role == UserRole.admin:
            return
        allowed = user.allowed_features
        # None means unrestricted
        if allowed is None:
            return
        if feature not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": f"Your account does not have access to this feature",
                    "code": "FEATURE_RESTRICTED",
                    "feature": feature,
                },
            )

    return _check
