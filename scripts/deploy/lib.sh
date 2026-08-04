#!/usr/bin/env bash
# Shared helpers for scripts/deploy/*.sh. Source, don't execute directly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${REPO_ROOT}/.deploy/state"
COMPOSE_BASE=(-f "${REPO_ROOT}/docker-compose.yml")

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# Bootstraps the live (gitignored) upstream conf from its committed template
# the first time this runs on a fresh checkout. If the live file exists but
# still uses the old `upstream {}` format, migrates it in-place to the new
# `map` format while preserving the current slot.
ensure_upstream_conf() {
  local service="$1"  # backend | frontend
  local live="${REPO_ROOT}/nginx/conf.d/upstream-${service}.conf"
  local template="${live}.template"

  if [[ ! -f "$live" ]]; then
    cp "$template" "$live"
    return
  fi

  # Migrate old `upstream foo_upstream { server foo_blue:N; }` format to the
  # new `map`-based format so nginx can start even when a slot doesn't exist.
  if grep -q "^upstream " "$live"; then
    local slot port
    slot="$(grep -oP "${service}_\K(blue|green)" "$live" | head -1)"
    port="$(grep -oP ":\K[0-9]+" "$live" | head -1)"
    cat > "$live" <<EOF
# Live runtime state — migrated from upstream{} to map format. Do not edit by hand.
map \$host \$${service}_upstream {
  default "${service}_${slot}:${port}";
}
EOF
  fi
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
# map variable so nginx resolves the container name at request time via resolver 127.0.0.11.
map \$host \$${service}_upstream {
  default "${service}_${slot}:${port}";
}
EOF
  mv "$tmp" "$live"

  # nginx reads ALL upstream-*.conf files at startup, so we must migrate the
  # OTHER service's conf too — otherwise a stale `upstream {}` block from a
  # never-deployed service will crash nginx before it can start.
  local other
  [[ "$service" == "backend" ]] && other="frontend" || other="backend"
  ensure_upstream_conf "$other"

  # Ensure nginx is running AND stable before we try to reload it.
  local nginx_running=0
  if compose exec -T nginx true >/dev/null 2>&1; then
    nginx_running=1
  else
    log "nginx is not running — starting it now..."
    compose up -d --no-deps nginx
    local waited=0
    while (( waited <= 30 )); do
      if compose exec -T nginx true >/dev/null 2>&1; then
        nginx_running=1
        break
      fi
      sleep 2
      waited=$((waited + 2))
    done
    if (( nginx_running == 0 )); then
      log "nginx failed to start within 30s"
      log "nginx container logs:"
      compose logs --tail=50 nginx || true
      return 1
    fi
    # Verify nginx stays up — the container may briefly respond to exec while
    # the entrypoint is still running, only to crash a moment later. Sample
    # the container state over a short window to catch a restart loop.
    sleep 3
    local state
    state="$(docker inspect --format='{{.State.Status}}' "$(compose ps -q nginx)" 2>/dev/null || echo "unknown")"
    if [[ "$state" != "running" ]]; then
      log "nginx is not stable (state=${state}) — likely stuck in restart loop"
      log "nginx container logs:"
      compose logs --tail=50 nginx || true
      return 1
    fi
    log "nginx is up and stable"
  fi

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
      local deep_out deep_code deep_start deep_ms
      deep_start=$(date +%s%N)
      deep_code=0
      if docker exec "$container" sh -c 'command -v curl' >/dev/null 2>&1; then
        deep_out="$(docker exec "$container" curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://localhost:${port}${deep_path}" 2>&1)" || deep_code=$?
      else
        # Alpine images ship wget but not curl — exit 0 means 2xx
        docker exec "$container" wget -qO /dev/null --timeout=8 "http://localhost:${port}${deep_path}" >/dev/null 2>&1 || deep_code=$?
        [[ "$deep_code" == "0" ]] && deep_out="200" || deep_out="000"
      fi
      deep_ms=$(( ($(date +%s%N) - deep_start) / 1000000 ))
      log "wait_healthy[${elapsed}s]: docker_status=healthy deep_curl_exit=${deep_code} deep_http=${deep_out} deep_ms=${deep_ms}"
      if [[ "$deep_code" == "0" && "$deep_out" == 2* ]]; then
        return 0
      fi
    else
      log "wait_healthy[${elapsed}s]: docker_status=${status}"
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  log "wait_healthy: gave up after ${timeout}s — final docker health log:"
  docker inspect --format='{{json .State.Health}}' "$container" 2>&1 | head -c 4000
  echo
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
