#!/usr/bin/env bash
# Reclaims disk space from Docker without ever touching data.
#
# Deliberately does NOT run `docker volume prune`: postgres_data, redis_data,
# and celery_beat_data are named volumes, but `docker volume prune` decides
# "unused" based on live container attachment, not compose-file references —
# if postgres is briefly stopped (a migration, a manual restart) its volume
# would look unused and get deleted. That's an irreversible data-loss risk
# for a disk-space optimization, so volumes are out of scope for automation
# here. Prune volumes manually, by name, if you ever actually need to.
set -euo pipefail

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

before="$(docker system df --format '{{.Size}}' | head -1)"

log "Removing stopped containers older than 24h..."
docker container prune -f --filter "until=24h"

log "Removing dangling images..."
docker image prune -f

log "Removing images not referenced by any container, older than 72h..."
# Keeps recently-built images around briefly in case scripts/deploy/rollback.sh
# needs to restart a slot that's currently stopped but not yet superseded.
docker image prune -a -f --filter "until=72h"

log "Removing build cache older than 72h..."
docker builder prune -f --filter "until=72h"

after="$(docker system df --format '{{.Size}}' | head -1)"
log "Docker disk usage: ${before} -> ${after}"
