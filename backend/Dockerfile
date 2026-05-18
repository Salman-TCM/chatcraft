# =============================================================================
# ChatCraft AI — FastAPI Backend
# Multi-stage build: builder installs deps, final image is lean
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: builder
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps needed to compile some Python packages (psycopg2, cryptography)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps into a prefix we can copy cleanly
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --prefix=/install --no-cache-dir -r requirements.txt


# -----------------------------------------------------------------------------
# Stage 2: final runtime image
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS final

WORKDIR /app

# Runtime system libs only (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser && \
    mkdir -p /var/run/celerybeat && chown appuser:appgroup /var/run/celerybeat

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY --chown=appuser:appgroup . .

# Entrypoint: run migrations then exec the given command
RUN chmod +x /app/start.sh

USER appuser

ENTRYPOINT ["/app/start.sh"]

# Expose API port
EXPOSE 8000

# Health check — polls /health every 30s, fails after 3 misses
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default: production mode with Gunicorn + Uvicorn workers
# Override CMD in docker-compose for hot-reload in dev
CMD ["gunicorn", "app.main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--keepalive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
