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
    """Validate JWT and return the authenticated User. 401 on any failure."""
    from app.models.user import User

    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"success": False, "error": "Not authenticated", "code": "NOT_AUTHENTICATED"},
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
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
