#!/usr/bin/env bash
# Shared helpers for scripts/deploy/*.sh. Source, don't execute directly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${REPO_ROOT}/.deploy/state"
COMPOSE_BASE=(-f "${REPO_ROOT}/docker-compose.yml")

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# Bootstraps the live (gitignored) upstream conf from its committed template
# the first time this runs on a fresh checkout. No-op after that — deploy.sh
# owns the file from here on.
ensure_upstream_conf() {
  local service="$1"  # backend | frontend
  local live="${REPO_ROOT}/nginx/conf.d/upstream-${service}.conf"
  local template="${live}.template"
  [[ -f "$live" ]] || cp "$template" "$live"
}

# Which slot (blue|green) is currently wired into nginx for $1 (backend|frontend).
active_slot() {
  local service="$1"
  ensure_upstream_conf "$service"
  grep -oP "${service}_\K(blue|green)" "${REPO_ROOT}/nginx/conf.d/upstream-${service}.conf" | head -1
}

idle_slot() {
  local active="$1"
  [[ "$active" == "blue" ]] && echo "green" || echo "blue"
}

# Atomically swap nginx's upstream for $1 (backend|frontend) to slot $2, then
# validate + reload. Writes to a tempfile and mv's it — mv on the same
# filesystem is atomic, so nginx never sees a half-written file mid-reload.
swap_upstream() {
  local service="$1" slot="$2" port="$3"
  local live="${REPO_ROOT}/nginx/conf.d/upstream-${service}.conf"
  local tmp="${live}.new"

  cat > "$tmp" <<EOF
# Live runtime state — see upstream-${service}.conf.template. Do not edit by hand.
upstream ${service}_upstream {
  server ${service}_${slot}:${port};
}
EOF
  mv "$tmp" "$live"

  compose exec -T nginx nginx -t
  compose exec -T nginx nginx -s reload
  log "nginx ${service}_upstream -> ${service}_${slot}"
}

compose() {
  docker compose "${COMPOSE_BASE[@]}" "${COMPOSE_FILES_EXTRA[@]}" "$@"
}

# Polls both Docker's own HEALTHCHECK status and a deep app-level /health
# check inside the container. Returns non-zero if it never goes healthy.
wait_healthy() {
  local container="$1" deep_path="${2:-/health}" port="${3:-8000}" timeout="${4:-90}"
  local elapsed=0
  while (( elapsed < timeout )); do
    local status
    status="$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")"
    if [[ "$status" == "healthy" ]]; then
      if docker exec "$container" curl -sf --max-time 8 "http://localhost:${port}${deep_path}" > /dev/null; then
        return 0
      fi
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  return 1
}

notify_slack() {
  local text="$1"
  [[ -z "${SLACK_ALERT_WEBHOOK_URL:-}" ]] && return 0
  curl -s -X POST "$SLACK_ALERT_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    --data "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$text")" \
    > /dev/null || true
}

write_state() {
  mkdir -p "$STATE_DIR"
  echo "$2" > "${STATE_DIR}/${1}"
}

read_state() {
  local file="${STATE_DIR}/${1}"
  [[ -f "$file" ]] && cat "$file" || echo "${2:-}"
}
