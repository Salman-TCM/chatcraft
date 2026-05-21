#!/usr/bin/env bash
# Creates Sentry alert rules via the Sentry API.
# Run once after your Sentry projects are created.
#
# Required env vars:
#   SENTRY_AUTH_TOKEN   — from Settings > Auth Tokens (project:write scope)
#   SENTRY_ORG          — your organisation slug
#   SENTRY_BACKEND_PROJECT
#   SENTRY_FRONTEND_PROJECT

set -euo pipefail

: "${SENTRY_AUTH_TOKEN:?SENTRY_AUTH_TOKEN is required}"
: "${SENTRY_ORG:?SENTRY_ORG is required}"
: "${SENTRY_BACKEND_PROJECT:?SENTRY_BACKEND_PROJECT is required}"
: "${SENTRY_FRONTEND_PROJECT:?SENTRY_FRONTEND_PROJECT is required}"

SENTRY_API="https://sentry.io/api/0"
AUTH="Authorization: Bearer ${SENTRY_AUTH_TOKEN}"

create_alert() {
  local project="$1"
  local name="$2"
  local payload="$3"
  echo "[sentry] Creating alert: ${name} (${project})"
  curl -s -o /dev/null -w "  → HTTP %{http_code}\n" \
    -X POST "${SENTRY_API}/projects/${SENTRY_ORG}/${project}/alert-rules/" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# ── Backend: error rate spike ─────────────────────────────────────────────────
create_alert "$SENTRY_BACKEND_PROJECT" "High error rate" "$(cat <<'JSON'
{
  "name": "High error rate — backend",
  "environment": "production",
  "dataset": "events",
  "query": "level:error",
  "aggregate": "count()",
  "timeWindow": 60,
  "thresholdType": 0,
  "resolveThreshold": 5,
  "triggers": [
    {
      "label": "critical",
      "alertThreshold": 50,
      "actions": [{"type": "email", "targetType": "team"}]
    },
    {
      "label": "warning",
      "alertThreshold": 20,
      "actions": [{"type": "email", "targetType": "team"}]
    }
  ],
  "projects": []
}
JSON
)"

# ── Backend: p95 latency (transaction monitoring) ─────────────────────────────
create_alert "$SENTRY_BACKEND_PROJECT" "API p95 latency" "$(cat <<'JSON'
{
  "name": "API p95 latency > 2s",
  "environment": "production",
  "dataset": "transactions",
  "query": "transaction.op:http.server",
  "aggregate": "p95(transaction.duration)",
  "timeWindow": 60,
  "thresholdType": 0,
  "resolveThreshold": 1500,
  "triggers": [
    {
      "label": "critical",
      "alertThreshold": 3000,
      "actions": [{"type": "email", "targetType": "team"}]
    },
    {
      "label": "warning",
      "alertThreshold": 2000,
      "actions": [{"type": "email", "targetType": "team"}]
    }
  ],
  "projects": []
}
JSON
)"

# ── Frontend: JS error rate ───────────────────────────────────────────────────
create_alert "$SENTRY_FRONTEND_PROJECT" "Frontend error rate" "$(cat <<'JSON'
{
  "name": "Frontend JS errors",
  "environment": "production",
  "dataset": "events",
  "query": "level:error",
  "aggregate": "count()",
  "timeWindow": 60,
  "thresholdType": 0,
  "resolveThreshold": 2,
  "triggers": [
    {
      "label": "critical",
      "alertThreshold": 30,
      "actions": [{"type": "email", "targetType": "team"}]
    },
    {
      "label": "warning",
      "alertThreshold": 10,
      "actions": [{"type": "email", "targetType": "team"}]
    }
  ],
  "projects": []
}
JSON
)"

echo ""
echo "[sentry] Alert rules created. Verify at:"
echo "  https://sentry.io/organizations/${SENTRY_ORG}/alerts/"
