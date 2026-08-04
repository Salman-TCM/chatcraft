#!/usr/bin/env bash
# Nightly PostgreSQL backup — runs locally on the server via
# `docker compose exec`, so it needs no DB credentials of its own (it reads
# the same running container the app uses) and no GitHub secret at all.
# Keeps the last 30 backups locally; optionally mirrors to S3 if AWS
# credentials are present in the server's .env (best-effort, off by default).
#
# Usage: scripts/backup_db.sh [--compose-file docker-compose.prod.yml]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILE="docker-compose.prod.yml"
for arg in "$@"; do
  case "$arg" in
    --compose-file) shift ;;
    *) [[ -f "$arg" ]] && COMPOSE_FILE="$arg" ;;
  esac
done

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DB_NAME="${POSTGRES_DB:-chatcraft}"
DB_USER="${POSTGRES_USER:-chatcraft}"
BACKUP_DIR="./backups/postgres"
RETENTION_COUNT=30
BACKUP_FILE="chatcraft_${DB_NAME}_${TIMESTAMP}.sql.gz"

log() { echo "[backup] $*"; }

mkdir -p "$BACKUP_DIR"

log "Dumping ${DB_NAME} at ${TIMESTAMP}..."
docker compose -f docker-compose.yml -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=plain --no-password \
  | gzip -9 > "${BACKUP_DIR}/${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
log "Dump complete — ${SIZE}"

# ── Integrity check ─────────────────────────────────────────────────────────
log "Verifying archive integrity..."
if ! gzip -t "${BACKUP_DIR}/${BACKUP_FILE}"; then
  log "ERROR: ${BACKUP_FILE} failed gzip integrity check — deleting corrupt backup."
  rm -f "${BACKUP_DIR}/${BACKUP_FILE}"
  exit 1
fi
if ! zcat "${BACKUP_DIR}/${BACKUP_FILE}" | head -1 | grep -q "PostgreSQL database dump"; then
  log "ERROR: ${BACKUP_FILE} does not look like a valid pg_dump — deleting."
  rm -f "${BACKUP_DIR}/${BACKUP_FILE}"
  exit 1
fi
log "Integrity check passed."

# ── Optional offsite mirror ─────────────────────────────────────────────────
if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_S3_BUCKET:-}" ]]; then
  log "Mirroring to s3://${AWS_S3_BUCKET}/backups/postgres/${BACKUP_FILE}"
  aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" \
    "s3://${AWS_S3_BUCKET}/backups/postgres/${BACKUP_FILE}" \
    --storage-class STANDARD_IA --sse AES256 \
    || log "WARNING: S3 mirror failed — local backup is still intact, continuing."
fi

# ── Retention: keep only the last N locally ─────────────────────────────────
log "Enforcing local retention (last ${RETENTION_COUNT})..."
# shellcheck disable=SC2012
ls -1t "${BACKUP_DIR}"/chatcraft_*.sql.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | while read -r old; do
  log "  Deleting old backup: ${old}"
  rm -f "$old"
done

COUNT=$(ls -1 "${BACKUP_DIR}"/chatcraft_*.sql.gz 2>/dev/null | wc -l)
log "Done. ${COUNT} backup(s) retained locally."
