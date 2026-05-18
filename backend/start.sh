#!/bin/bash
set -e

echo "[entrypoint] Running database migrations..."
alembic upgrade head
echo "[entrypoint] Migrations complete."

exec "$@"
