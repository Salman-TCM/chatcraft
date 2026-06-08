#!/bin/bash
set -e

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
