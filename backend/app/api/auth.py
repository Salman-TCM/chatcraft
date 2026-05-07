from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.dependencies import DBSession
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.auth import RegisterRequest, RegisterResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
