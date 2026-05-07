from datetime import timedelta

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from jose import JWTError
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession, RedisClient
from app.core.security import (
    REFRESH_TOKEN_COOKIE,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User, UserRole
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    RefreshResponse,
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


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    response: Response,
    redis: RedisClient,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE),
) -> dict:
    """Revoke the refresh token and clear the cookie. Always returns 200."""
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            jti = payload.get("jti", "")
            if jti:
                await redis.delete(f"refresh:{jti}")
        except JWTError:
            pass  # expired/invalid token — still clear the cookie

    response.delete_cookie(key=REFRESH_TOKEN_COOKIE, path="/api/auth")
    return {"success": True, "data": {"message": "Logged out"}}


_INVALID_REFRESH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={"success": False, "error": "Invalid or expired refresh token", "code": "INVALID_REFRESH_TOKEN"},
)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    response: Response,
    db: DBSession,
    redis: RedisClient,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_TOKEN_COOKIE),
) -> RefreshResponse:
    """Rotate refresh token. Old JTI is revoked; new tokens are issued."""
    if not refresh_token:
        raise _INVALID_REFRESH

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise _INVALID_REFRESH

    if payload.get("type") != "refresh":
        raise _INVALID_REFRESH

    user_id: str = payload.get("sub", "")
    jti: str = payload.get("jti", "")

    redis_key = f"refresh:{jti}"
    stored = await redis.get(redis_key)
    if not stored:
        raise _INVALID_REFRESH

    # Revoke the used token immediately (rotation)
    await redis.delete(redis_key)

    user = await db.get(User, user_id)
    if not user:
        raise _INVALID_REFRESH

    access_token = create_access_token(user.id, user.role.value)
    new_refresh_token, new_jti = create_refresh_token(user.id)
    await redis.setex(f"refresh:{new_jti}", _REFRESH_TTL, user.id)

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/auth",
    )

    return RefreshResponse(
        data=TokenData(
            access_token=access_token,
            user=UserResponse.model_validate(user),
        )
    )


@router.get("/me", response_model=MeResponse)
async def me(current_user: CurrentUser) -> MeResponse:
    """Return the authenticated user's profile."""
    return MeResponse(data=UserResponse.model_validate(current_user))
