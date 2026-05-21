#!/usr/bin/env bash
# Creates Axiom datasets and saves dashboard definitions.
# Run once after your Axiom workspace is created.
#
# Required env vars:
#   AXIOM_TOKEN    — API token with dataset:create and dashboard:create scopes
#   AXIOM_ORG_ID   — your Axiom organisation ID
#   AXIOM_DATASET  — dataset name (default: chatcraft-logs)

set -euo pipefail

: "${AXIOM_TOKEN:?AXIOM_TOKEN is required}"
: "${AXIOM_ORG_ID:?AXIOM_ORG_ID is required}"
DATASET="${AXIOM_DATASET:-chatcraft-logs}"
API="https://api.axiom.co/v1"
AUTH="Authorization: Bearer ${AXIOM_TOKEN}"
ORG_HDR="X-Axiom-Org-Id: ${AXIOM_ORG_ID}"

# ── Create dataset ────────────────────────────────────────────────────────────
echo "[axiom] Creating dataset: ${DATASET}"
curl -s -o /dev/null -w "  → HTTP %{http_code}\n" \
  -X POST "${API}/datasets" \
  -H "$AUTH" -H "$ORG_HDR" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${DATASET}\",\"description\":\"ChatCraft AI structured logs\"}"

# ── Save dashboard definition ─────────────────────────────────────────────────
DASHBOARD_FILE="$(dirname "$0")/axiom_dashboard.json"

cat > "$DASHBOARD_FILE" <<JSON
{
  "name": "ChatCraft — API Overview",
  "description": "API latency, error rates, and usage metrics",
  "charts": [
    {
      "title": "Request Rate (rpm)",
      "query": {
        "apl": "['${DATASET}'] | where level == 'INFO' and request_method != null | summarize count() by bin_auto(_time)",
        "startTime": "now-1h",
        "endTime": "now"
      },
      "type": "line"
    },
    {
      "title": "Error Rate (errors/min)",
      "query": {
        "apl": "['${DATASET}'] | where level == 'ERROR' | summarize count() by bin_auto(_time)",
        "startTime": "now-1h",
        "endTime": "now"
      },
      "type": "line"
    },
    {
      "title": "p50 / p95 / p99 API Latency (ms)",
      "query": {
        "apl": "['${DATASET}'] | where duration_ms != null | summarize percentiles(duration_ms, 50, 95, 99) by bin_auto(_time)",
        "startTime": "now-1h",
        "endTime": "now"
      },
      "type": "line"
    },
    {
      "title": "Top Error Messages",
      "query": {
        "apl": "['${DATASET}'] | where level == 'ERROR' | summarize count() by message | sort by count_ desc | limit 20",
        "startTime": "now-24h",
        "endTime": "now"
      },
      "type": "table"
    },
    {
      "title": "Slowest Endpoints (p95 ms)",
      "query": {
        "apl": "['${DATASET}'] | where path != null and duration_ms != null | summarize percentile(duration_ms, 95) by path | sort by percentile_duration_ms_95 desc | limit 20",
        "startTime": "now-1h",
        "endTime": "now"
      },
      "type": "table"
    },
    {
      "title": "LLM Token Usage (daily)",
      "query": {
        "apl": "['${DATASET}'] | where total_tokens != null | summarize sum(total_tokens) by bin(_time, 1d)",
        "startTime": "now-30d",
        "endTime": "now"
      },
      "type": "bar"
    }
  ]
}
JSON

echo "[axiom] Dashboard definition saved to: ${DASHBOARD_FILE}"
echo ""
echo "Import it manually at: https://app.axiom.co/dashboards/new"
echo "  (Axiom REST API does not support dashboard creation — use the UI)"
echo ""
echo "[axiom] Done. Verify dataset at:"
echo "  https://app.axiom.co/datasets/${DATASET}"
