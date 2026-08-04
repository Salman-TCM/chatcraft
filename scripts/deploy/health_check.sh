#!/usr/bin/env bash
# External synthetic health check — hits the public site the same way a
# user's browser would, so it also catches nginx/DNS/TLS/firewall problems
# that an internal container healthcheck can't see. Used by
# .github/workflows/health-check.yml (GitHub-hosted runner) and safe to run
# from anywhere with internet access.
#
# Checks, in order:
#   1. GET /              -> nginx + frontend chain, expect 200
#   2. GET /health         -> proxied to backend; body reports Postgres +
#                             Redis connectivity, so this one check covers
#                             "backend", "database", and "redis" from the
#                             monitoring spec in one request.
#
# Usage: scripts/deploy/health_check.sh [base_url]
set -euo pipefail

BASE_URL="${1:-https://tiertech.com.bd}"
FAILURES=()

check_frontend() {
  local status
  status="$(curl -sk -o /dev/null -w '%{http_code}' "${BASE_URL}/" || echo "000")"
  if [[ "$status" != "200" ]]; then
    FAILURES+=("frontend / -> HTTP ${status}")
  else
    echo "OK   frontend /  -> HTTP 200"
  fi
}

check_backend_and_dependencies() {
  local body status
  body="$(curl -sk -w '\n%{http_code}' "${BASE_URL}/health" || echo "000")"
  status="$(echo "$body" | tail -1)"
  body="$(echo "$body" | sed '$d')"

  if [[ "$status" != "200" ]]; then
    FAILURES+=("backend /health -> HTTP ${status}: ${body}")
    return
  fi

  local dep_rc=0
  python3 - "$body" <<'PY' || dep_rc=$?
import json, sys
data = json.loads(sys.argv[1])
deps = data.get("dependencies", {})
for name in ("postgres", "redis"):
    dep_status = deps.get(name, {}).get("status", "missing")
    print(f"{'OK  ' if dep_status == 'healthy' else 'FAIL'} {name:10s} -> {dep_status}")
    if dep_status != "healthy":
        sys.exit(1)
PY
  if (( dep_rc != 0 )); then
    FAILURES+=("backend dependency check failed (see /health body): ${body}")
  fi
}

check_frontend
check_backend_and_dependencies

if (( ${#FAILURES[@]} > 0 )); then
  echo ""
  echo "HEALTH CHECK FAILED:"
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi

echo ""
echo "All health checks passed."
