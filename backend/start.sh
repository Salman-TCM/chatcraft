#!/bin/bash
set -e

# ---------------------------------------------------------------------------
# Wait for postgres to be reachable at the TCP level before running alembic.
#
# depends_on: condition: service_healthy guarantees postgres is up, but
# Docker's embedded DNS can still return EAI_AGAIN (errno -3) for a brief
# window after container start. A TCP connection check bypasses DNS caching
# issues and confirms the port is actually accepting connections.
# ---------------------------------------------------------------------------
DB_HOST=$(python3 -c "
import os, re
url = os.environ.get('DATABASE_URL', '')
m = re.search(r'@([^:/]+)', url)
print(m.group(1) if m else 'postgres')
")
DB_PORT=5432
MAX_ATTEMPTS=30

echo "[entrypoint] Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
for i in $(seq 1 $MAX_ATTEMPTS); do
  if python3 -c "import socket; socket.create_connection(('${DB_HOST}', ${DB_PORT}), timeout=2).close()" 2>/dev/null; then
    echo "[entrypoint] Postgres reachable (attempt ${i})."
    break
  fi
  if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
    echo "[entrypoint] ERROR: postgres not reachable after ${MAX_ATTEMPTS} attempts. Aborting."
    exit 1
  fi
  echo "[entrypoint] Attempt ${i}/${MAX_ATTEMPTS} — not ready yet, retrying in 2s..."
  sleep 2
done

echo "[entrypoint] Running database migrations..."
alembic upgrade head
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Verifying app import..."
python -c "from app.main import app; print('[entrypoint] App import OK')"

# Create admin user on first deploy if ADMIN_EMAIL + ADMIN_PASSWORD are set in .env
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "[entrypoint] Ensuring admin user exists (${ADMIN_EMAIL})..."
  python seed_admin.py
else
  echo "[entrypoint] Skipping admin seed — ADMIN_EMAIL/ADMIN_PASSWORD not set."
fi

# Seed demo data on first start when SEED_ON_START=true (staging only)
if [ "${SEED_ON_START:-false}" = "true" ]; then
  SEED_FLAG="/tmp/.seed_done"
  if [ ! -f "$SEED_FLAG" ]; then
    echo "[entrypoint] Seeding demo data..."
    python scripts/seed_data.py && touch "$SEED_FLAG"
    echo "[entrypoint] Seed complete."
  else
    echo "[entrypoint] Seed already ran — skipping."
  fi
fi

exec "$@"
