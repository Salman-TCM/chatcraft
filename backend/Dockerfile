# syntax=docker/dockerfile:1.7
# =============================================================================
# ChatCraft AI — FastAPI Backend
# Alpine-based multi-stage build (musl libc — required for kernel 7.x hosts)
#
# BuildKit is required (default in Docker 23+). Enable in older Docker with:
#   DOCKER_BUILDKIT=1 docker build ...
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

# Install from requirements.txt with a persistent pip cache mount — the tarball
# cache survives across builds, so an unchanged requirements.txt takes seconds
# to reinstall and a single new dep only downloads that one wheel.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt


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
    mkdir -p /var/run/celerybeat && chown appuser:appgroup /var/run/celerybeat && \
    mkdir -p /app/uploads && chown appuser:appgroup /app/uploads

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
