#!/usr/bin/env bash
# Manual rollback: swap production traffic back to the previous slot.
# Automatic rollback already happens inside deploy.sh (a failed health check
# or migration never cuts over in the first place) — this script is for the
# case where a deploy *looked* healthy at cutover but a problem surfaces
# afterwards (e.g. a bad response under real traffic, an error spike in
# Sentry) and you want to revert without waiting for a new deploy.
#
# Usage: scripts/deploy/rollback.sh <backend|frontend>
set -euo pipefail

SERVICE="${1:?Usage: rollback.sh <backend|frontend>}"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
source scripts/deploy/lib.sh

case "$SERVICE" in
  backend)  PORT=8000; DEEP_PATH="/health" ;;
  frontend) PORT=3000; DEEP_PATH="/" ;;
  *) echo "SERVICE must be 'backend' or 'frontend'"; exit 1 ;;
esac

COMPOSE_FILES_EXTRA=(-f docker-compose.prod.yml)

CURRENT="$(active_slot "$SERVICE")"
TARGET="$(read_state "production-${SERVICE}.previous" "")"

if [[ -z "$TARGET" ]]; then
  echo "No recorded previous slot for ${SERVICE} — nothing to roll back to."
  exit 1
fi
if [[ "$TARGET" == "$CURRENT" ]]; then
  echo "Previous slot (${TARGET}) is already active — nothing to do."
  exit 0
fi

TARGET_NAME="${SERVICE}_${TARGET}"
CURRENT_NAME="${SERVICE}_${CURRENT}"

log "Rolling back ${SERVICE}: ${CURRENT} -> ${TARGET}"

log "Starting ${TARGET_NAME} (previously stopped image, no rebuild)..."
compose up -d --no-deps "$TARGET_NAME"

if ! wait_healthy "$TARGET_NAME" "$DEEP_PATH" "$PORT" 90; then
  compose stop "$TARGET_NAME" || true
  notify_slack "❌ *Rollback failed* — ${SERVICE}: ${TARGET_NAME} would not come up healthy. Still serving from ${CURRENT_NAME}."
  exit 1
fi

swap_upstream "$SERVICE" "$TARGET" "$PORT"

log "Draining ${CURRENT_NAME} (15s grace period)..."
sleep 15
compose stop "$CURRENT_NAME"

write_state "production-${SERVICE}.active" "$TARGET"
write_state "production-${SERVICE}.previous" "$CURRENT"

notify_slack "⏪ *Rolled back* — ${SERVICE} (production): ${CURRENT} -> ${TARGET}"
log "Rollback complete. ${SERVICE} production is now serving from ${TARGET}."
