#!/bin/bash
set -e

echo "[entrypoint] Running database migrations..."
alembic upgrade head
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Verifying app import..."
python -c "from app.main import app; print('[entrypoint] App import OK')"

echo "[entrypoint] Ensuring superadmin exists..."
python create_superadmin.py

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
