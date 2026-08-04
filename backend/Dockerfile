# =============================================================================
# ChatCraft AI — FastAPI Backend
# Alpine-based multi-stage build (musl libc — required for kernel 7.x hosts)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: builder — compile and install Python dependencies
# -----------------------------------------------------------------------------
FROM python:3.11-alpine AS builder

WORKDIR /build

# Build-time system deps
RUN apk add --no-cache \
    build-base \
    postgresql-dev \
    libffi-dev \
    openssl-dev \
    musl-dev \
    curl

# Install deps in small independent layers to keep peak memory low.
COPY requirements.txt .

RUN pip install --prefix=/install --no-cache-dir \
        fastapi==0.136.1 "uvicorn[standard]==0.38.0" gunicorn==26.0.0 \
        "pydantic[email]==2.12.5" pydantic-settings==2.14.0 python-multipart==0.0.20

RUN pip install --prefix=/install --no-cache-dir \
        sqlalchemy==2.0.49 alembic==1.18.4 asyncpg==0.31.0 \
        psycopg2-binary==2.9.12 pgvector==0.4.2

RUN pip install --prefix=/install --no-cache-dir \
        redis==6.4.0 "celery[redis]==5.6.3"

RUN pip install --prefix=/install --no-cache-dir \
        "python-jose[cryptography]==3.5.0" "bcrypt>=4.0.0" httpx==0.28.1

RUN pip install --prefix=/install --no-cache-dir \
        anthropic==0.100.0 openai==2.30.0 google-genai==1.14.0 tiktoken==0.12.0

RUN pip install --prefix=/install --no-cache-dir \
        litellm==1.83.7

RUN pip install --prefix=/install --no-cache-dir \
        langchain==1.2.17 langchain-openai==1.2.1 langchain-community==0.4.1

RUN pip install --prefix=/install --no-cache-dir \
        stripe==15.1.0 elevenlabs==2.45.0 boto3==1.43.5 supabase==2.30.0 resend==2.30.0

RUN pip install --prefix=/install --no-cache-dir \
        "sentry-sdk[fastapi]==2.59.0" loguru==0.7.3 axiom-py==0.10.0 slowapi==0.1.9

RUN pip install --prefix=/install --no-cache-dir \
        pdfplumber==0.11.9 pymupdf==1.27.2.3 python-docx==1.2.0 \
        beautifulsoup4==4.14.3 lxml==6.0.2 cryptography==46.0.5

RUN pip install --prefix=/install --no-cache-dir \
        websockets==14.2 python-dotenv==1.0.1 pywebpush==2.0.0 \
        duckduckgo-search==6.3.7 "qrcode[pil]==8.1.0" \
        pytest==9.0.3 pytest-asyncio==1.3.0


# -----------------------------------------------------------------------------
# Stage 2: final runtime image
# -----------------------------------------------------------------------------
FROM python:3.11-alpine AS final

WORKDIR /app

# Runtime-only system libs + bash (needed by start.sh)
RUN apk add --no-cache \
    bash \
    libpq \
    curl \
    libffi \
    openssl

# Non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/bash -D appuser && \
    mkdir -p /var/run/celerybeat && chown appuser:appgroup /var/run/celerybeat

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Remove any corrupted .pyc bytecode cache — Python recompiles from source on
# first import. Avoids "marshal data too short" errors from build-time glitches.
RUN find /usr/local/lib/python3.11/site-packages -name "*.pyc" -delete

# Copy application source
COPY --chown=appuser:appgroup . .

# Entrypoint: run migrations then exec the given command
RUN chmod +x /app/start.sh

USER appuser

ENTRYPOINT ["/app/start.sh"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["gunicorn", "app.main:app", \
     "--workers", "2", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
