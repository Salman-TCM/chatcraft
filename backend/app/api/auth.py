from datetime import timedelta

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.core.dependencies import DBSession, RedisClient
from app.core.security import (
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User, UserRole
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
    TokenData,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_REFRESH_TTL = int(timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(body: RegisterRequest, db: DBSession) -> RegisterResponse:
    """Create a new user account with email and password."""
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"success": False, "error": "Email already registered", "code": "EMAIL_TAKEN"},
        )

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=UserRole.free,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return RegisterResponse(data=UserResponse.model_validate(user))


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: DBSession,
    redis: RedisClient,
) -> LoginResponse:
    """Authenticate with email + password. Returns JWT access token in body
    and sets a httpOnly refresh token cookie."""
    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "error": "Invalid credentials", "code": "INVALID_CREDENTIALS"},
        )

    access_token = create_access_token(user.id, user.role.value)
    refresh_token, jti = create_refresh_token(user.id)

    # Store JTI in Redis so it can be revoked on logout
    await redis.setex(f"refresh:{jti}", _REFRESH_TTL, user.id)

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/auth",
    )

    return LoginResponse(
        data=TokenData(
            access_token=access_token,
            user=UserResponse.model_validate(user),
        )
    )
