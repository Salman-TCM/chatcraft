from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.auth import router as auth_router
from app.api.billing import router as billing_router
from app.api.chat import router as chat_router
from app.api.chatbots import router as chatbots_router
from app.api.health import router as health_router
from app.api.kb import router as kb_router
from app.api.voice import router as voice_router
from app.api.widget import router as widget_router
from app.api.usage import router as usage_router
from app.api.analytics import router as analytics_router
from app.api.gdpr import router as gdpr_router
from app.api.crm import router as crm_router
from app.api.admin import router as admin_router
from app.api.inbox import router as inbox_router
from app.api.webhooks import router as webhooks_router
from app.api.integrations import router as integrations_router
from app.api.flows import router as flows_router
from app.api.automations import router as automations_router
from app.api.forms import router as forms_router
from app.api.landing_pages import router as landing_pages_router
from app.core.security_headers import SecurityHeadersMiddleware
from app.core.ip_abuse import IPAbuseMiddleware
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.rate_limit import limiter
from app.core.request_id import RequestIDMiddleware
from app.core.request_logging import RequestLoggingMiddleware
from app.core.sentry import init_sentry

setup_logging()
init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    from app.db.redis import get_async_redis
    app.state.redis = get_async_redis()
    yield
    await app.state.redis.aclose()


app = FastAPI(
    title="ChatCraft AI API",
    version="0.1.0",
    description="Production-grade AI chatbot platform API for businesses worldwide",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# Attach the limiter so slowapi can find it via app.state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(IPAbuseMiddleware)
app.add_middleware(SlowAPIMiddleware)
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
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(chatbots_router)
app.include_router(chat_router)
app.include_router(kb_router)
app.include_router(voice_router)
app.include_router(widget_router)
app.include_router(usage_router)
app.include_router(analytics_router)
app.include_router(gdpr_router)
app.include_router(crm_router)
app.include_router(admin_router)
app.include_router(inbox_router)
app.include_router(webhooks_router)
app.include_router(integrations_router)
app.include_router(flows_router)
app.include_router(automations_router)
app.include_router(forms_router)
app.include_router(landing_pages_router)


@app.get("/", tags=["health"])
async def root() -> JSONResponse:
    """Root endpoint."""
    return JSONResponse(
        {"success": True, "data": {"name": "ChatCraft AI API", "version": "0.1.0"}}
    )
