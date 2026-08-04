#!/usr/bin/env bash
# Runs `alembic upgrade head` inside a given backend container, guarded by a
# flock so two deploys racing (e.g. a manual re-run while CI is still
# deploying) can never run migrations concurrently against the same
# database. GitHub Actions' own concurrency group is the first line of
# defense; this is the second, in case of a manual workflow_dispatch race
# or someone invoking this script by hand.
#
# Usage: scripts/deploy/migrate.sh <backend_container_name>
set -euo pipefail

CONTAINER="${1:?Usage: migrate.sh <backend_container_name>}"
LOCK_FILE="/tmp/chatcraft-migrate.lock"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

run_migration() {
  log "Acquired migration lock. Running alembic upgrade head in ${CONTAINER}..."

  local before after heads
  before="$(docker exec "$CONTAINER" alembic current 2>/dev/null | head -1 || echo "none")"

  if ! docker exec "$CONTAINER" alembic upgrade head; then
    log "ERROR: alembic upgrade head failed. Database left at: ${before}"
    return 1
  fi

  after="$(docker exec "$CONTAINER" alembic current 2>/dev/null | head -1 || echo "unknown")"
  heads="$(docker exec "$CONTAINER" alembic heads 2>/dev/null | head -1 || echo "unknown")"

  log "Migration: ${before} -> ${after}"

  # A partial/failed migration leaves `alembic current` behind `alembic
  # heads` (or in a multi-head state) rather than raising — verify
  # explicitly so a "successful" exit code can't mask a half-applied schema.
  if [[ "$after" != "$heads" ]]; then
    log "ERROR: post-migration state (${after}) does not match head (${heads})."
    log "Database is NOT fully migrated — refusing to proceed with deploy."
    return 1
  fi

  log "Migration verified: database is at head (${after})."
}

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  log "Another migration is already running — waiting for it to finish (up to 5 min)..."
  if ! flock -w 300 200; then
    log "ERROR: timed out waiting for the migration lock. Aborting."
    exit 1
  fi
fi

run_migration
