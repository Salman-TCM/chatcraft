#!/usr/bin/env bash
# Blue/green deploy for one service against one environment. Called by
# .github/workflows/deploy.yml on the self-hosted runner living on the
# target server — never over SSH.
#
# Usage: scripts/deploy/deploy.sh <backend|frontend> <production|staging> <git_sha>
#
# production -> docker-compose.prod.yml, nginx blue/green swap, zero-downtime.
# staging    -> docker-compose.staging.yml, single-slot recreate (see the
#               "develop: optional staging deployment" branch strategy —
#               staging is low-stakes and still fronted by Cloudflare
#               Tunnel, so it doesn't need the blue/green machinery).
set -euo pipefail

# Ensure BuildKit is on — the Dockerfiles use `# syntax=` and cache mounts
# (--mount=type=cache) which require it. Default in Docker 23+ but explicit
# guards against older engines and any env that unsets it.
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

SERVICE="${1:?Usage: deploy.sh <backend|frontend> <production|staging> <git_sha>}"
TARGET_ENV="${2:?Usage: deploy.sh <backend|frontend> <production|staging> <git_sha>}"
GIT_SHA="${3:?Usage: deploy.sh <backend|frontend> <production|staging> <git_sha>}"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
source scripts/deploy/lib.sh

START_TS=$(date +%s)

case "$SERVICE" in
  backend)  PORT=8000; DEEP_PATH="/health" ;;
  frontend) PORT=3000; DEEP_PATH="/" ;;
  *) echo "SERVICE must be 'backend' or 'frontend'"; exit 1 ;;
esac

fail() {
  notify_slack "❌ *Deploy failed* — ${SERVICE} (${TARGET_ENV}), commit \`${GIT_SHA:0:7}\`: $1"
  exit 1
}

# ---------------------------------------------------------------------------
# Staging — simple rebuild + recreate, no blue/green.
# ---------------------------------------------------------------------------
if [[ "$TARGET_ENV" == "staging" ]]; then
  COMPOSE_FILES_EXTRA=(-f docker-compose.staging.yml)

  compose build "$SERVICE"
  compose up -d --no-deps "$SERVICE"

  CONTAINER="$(compose ps -q "$SERVICE")"
  if ! wait_healthy "$CONTAINER" "$DEEP_PATH" "$PORT" 90; then
    fail "staging ${SERVICE} did not become healthy after restart"
  fi

  if [[ "$SERVICE" == "backend" ]]; then
    bash scripts/deploy/migrate.sh "$CONTAINER" || fail "staging migration failed"
  fi

  docker image prune -f > /dev/null
  DURATION=$(( $(date +%s) - START_TS ))
  notify_slack "✅ Deploy succeeded — ${SERVICE} (staging), commit \`${GIT_SHA:0:7}\`, ${DURATION}s"
  exit 0
fi

# ---------------------------------------------------------------------------
# Production — blue/green.
# ---------------------------------------------------------------------------
COMPOSE_FILES_EXTRA=(-f docker-compose.prod.yml)

if [[ "$SERVICE" == "backend" ]]; then
  export BACKEND_IMAGE_TAG="$GIT_SHA"
else
  export FRONTEND_IMAGE_TAG="$GIT_SHA"
fi

ACTIVE="$(active_slot "$SERVICE")"
IDLE="$(idle_slot "$ACTIVE")"
IDLE_NAME="${SERVICE}_${IDLE}"
ACTIVE_NAME="${SERVICE}_${ACTIVE}"

log "Active slot: ${ACTIVE} — deploying ${GIT_SHA:0:7} to idle slot: ${IDLE}"

log "Building image..."
compose build "$IDLE_NAME"

log "Starting ${IDLE_NAME}..."
compose up -d --no-deps "$IDLE_NAME"
IDLE_CONTAINER="$(compose ps -q "$IDLE_NAME")"

if ! wait_healthy "$IDLE_CONTAINER" "$DEEP_PATH" "$PORT" 180; then
  compose stop "$IDLE_NAME" || true
  fail "${IDLE_NAME} never became healthy — old slot (${ACTIVE_NAME}) is still serving traffic, nothing was cut over"
fi

if [[ "$SERVICE" == "backend" ]]; then
  if ! bash scripts/deploy/migrate.sh "$IDLE_CONTAINER"; then
    compose stop "$IDLE_NAME" || true
    fail "migration failed against ${IDLE_NAME} — old slot (${ACTIVE_NAME}) is still serving traffic, database was left at its previous verified state"
  fi
fi

log "Cutting traffic over to ${IDLE_NAME}..."
swap_upstream "$SERVICE" "$IDLE" "$PORT"

log "Draining ${ACTIVE_NAME} (15s grace period for in-flight requests)..."
sleep 15
compose stop "$ACTIVE_NAME"

write_state "${TARGET_ENV}-${SERVICE}.active" "$IDLE"
write_state "${TARGET_ENV}-${SERVICE}.previous" "$ACTIVE"
write_state "${TARGET_ENV}-${SERVICE}.image_tag" "$GIT_SHA"

docker image prune -f > /dev/null

DURATION=$(( $(date +%s) - START_TS ))
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
notify_slack "✅ *Deploy succeeded* — ${SERVICE} (production)
Branch: \`${BRANCH}\` · Commit: \`${GIT_SHA:0:7}\`
Slot: ${ACTIVE} -> ${IDLE} · Duration: ${DURATION}s · Health: passing"

log "Done. ${SERVICE} production is now serving from ${IDLE} (${GIT_SHA:0:7})."
