#!/usr/bin/env bash
# Daily PostgreSQL backup — dumps to S3 with 30-day retention.
# Usage: ./scripts/backup_db.sh [--local]
#   --local  Save to ./backups/ instead of uploading to S3

set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DB_NAME="${POSTGRES_DB:-chatcraft}"
DB_USER="${POSTGRES_USER:-chatcraft}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_FILE="chatcraft_${DB_NAME}_${TIMESTAMP}.sql.gz"
S3_BUCKET="${BACKUP_S3_BUCKET:-${AWS_S3_BUCKET:-chatcraft-uploads}}"
S3_PREFIX="backups/postgres"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOCAL_DIR="./backups"

LOCAL_MODE=false
for arg in "$@"; do
  [[ "$arg" == "--local" ]] && LOCAL_MODE=true
done

# ── Dump ───────────────────────────────────────────────────────────────────────
echo "[backup] Starting dump of ${DB_NAME} at ${TIMESTAMP}"

PGPASSWORD="${POSTGRES_PASSWORD:-chatcraft}" \
  pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    --format=plain \
    --verbose \
  | gzip -9 > "/tmp/${BACKUP_FILE}"

SIZE=$(du -sh "/tmp/${BACKUP_FILE}" | cut -f1)
echo "[backup] Dump complete — ${SIZE}"

# ── Upload or save locally ─────────────────────────────────────────────────────
if [[ "$LOCAL_MODE" == "true" ]]; then
  mkdir -p "$LOCAL_DIR"
  mv "/tmp/${BACKUP_FILE}" "${LOCAL_DIR}/${BACKUP_FILE}"
  echo "[backup] Saved to ${LOCAL_DIR}/${BACKUP_FILE}"
else
  echo "[backup] Uploading to s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}"
  aws s3 cp \
    "/tmp/${BACKUP_FILE}" \
    "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" \
    --storage-class STANDARD_IA \
    --sse AES256

  echo "[backup] Upload complete"
  rm "/tmp/${BACKUP_FILE}"

  # ── Purge old backups ────────────────────────────────────────────────────────
  echo "[backup] Pruning backups older than ${RETENTION_DAYS} days"
  CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
           || date -u -v-"${RETENTION_DAYS}"d +"%Y-%m-%dT%H:%M:%SZ")  # macOS fallback

  aws s3api list-objects \
    --bucket "$S3_BUCKET" \
    --prefix "${S3_PREFIX}/" \
    --query "Contents[?LastModified<='${CUTOFF}'].Key" \
    --output text \
  | tr '\t' '\n' \
  | grep -v '^$' \
  | while read -r key; do
      echo "[backup]   Deleting s3://${S3_BUCKET}/${key}"
      aws s3 rm "s3://${S3_BUCKET}/${key}"
    done
fi

echo "[backup] Done."
