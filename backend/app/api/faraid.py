"""
Faraid (Islamic inheritance) calculation API.

Stateless — this endpoint performs a deterministic calculation and returns
it; nothing is persisted. Requires authentication only (no feature flag):
it's a calculation utility, not a stored resource like the knowledge base.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import ValidationError

from app.core.dependencies import CurrentUser
from app.schemas.faraid import FaraidCalculateRequest, FaraidCalculateResponse
from app.services.faraid.engine import calculate

router = APIRouter(prefix="/api/v1/faraid", tags=["faraid"])


@router.post("/calculate", status_code=status.HTTP_200_OK)
async def calculate_faraid(
    body: FaraidCalculateRequest,
    _user: CurrentUser,
) -> dict:
    try:
        result: FaraidCalculateResponse = calculate(body)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": str(exc), "code": "INVALID_INPUT"},
        ) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"success": False, "error": str(exc), "code": "VALIDATION_ERROR"},
        ) from exc
    return {"success": True, "data": result}
