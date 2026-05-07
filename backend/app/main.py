from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import setup_logging
from app.core.request_id import RequestIDMiddleware
from app.core.request_logging import RequestLoggingMiddleware
from app.core.sentry import init_sentry
from app.api.health import router as health_router

setup_logging()
init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle."""
    yield


app = FastAPI(
    title="ChatCraft AI API",
    version="0.1.0",
    description="Production-grade AI chatbot platform API for businesses worldwide",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)


@app.get("/", tags=["health"])
async def root() -> JSONResponse:
    """Root endpoint."""
    return JSONResponse(
        {"success": True, "data": {"name": "ChatCraft AI API", "version": "0.1.0"}}
    )
