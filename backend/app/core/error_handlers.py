"""Shared exception handlers producing a single, consistent error response shape."""

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) if parts else str(loc[-1])


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Maps FastAPI's raw error list onto the {success, code, error, fields} shape
    already used by hand-rolled HTTPException(detail=...) checks across the API,
    so every 422 — Pydantic-driven or manual — looks the same to the frontend.
    """
    fields = [{"field": _field_name(err["loc"]), "message": err["msg"]} for err in exc.errors()]
    summary = f"{fields[0]['field']}: {fields[0]['message']}" if fields else "Validation failed"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": {
                "success": False,
                "code": "VALIDATION_ERROR",
                "error": summary,
                "fields": fields,
            }
        },
    )
