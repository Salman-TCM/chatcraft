# ChatCraft AI — Operations Runbook

## Database Migrations (Zero-Downtime)

Migrations run automatically as part of every backend deploy — see
`scripts/deploy/migrate.sh` — against whichever slot (blue/green) is about
to receive traffic, before the cutover happens. Manual steps below are for
inspecting state or intervening outside the normal deploy flow.

### Apply a migration manually

```bash
# On the deploy server, against whichever slot is currently active —
# check nginx/conf.d/upstream-backend.conf, or:
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps backend_blue backend_green

# 1. Exec into the active container
docker exec -it backend_blue bash   # or backend_green

# 2. Verify pending migrations before applying
alembic history --verbose
alembic current

# 3. Apply migrations (Alembic uses transactional DDL on PostgreSQL)
alembic upgrade head

# 4. Confirm
alembic current
```

### Rollback a migration

```bash
# Roll back one step
alembic downgrade -1

# Roll back to a specific revision
alembic downgrade 000000000008
```

### Emergency downgrade procedure — database only
Automated rollback (below) never runs `alembic downgrade` — see
`docs/deployment/CICD.md` for why. Only do this by hand, and only if a
migration is actually destructive:
1. Confirm no traffic is being served by a slot that expects the new schema
   (both blue and green should be stopped or pointed at code that tolerates
   the downgrade).
2. Run `alembic downgrade -1` inside the active backend container.
3. Deploy the previous backend image tag (see Rollback Procedure below).
4. Verify health: `GET /health`.

---

## Deployment

CI/CD is fully described in `docs/deployment/CICD.md`. Short version:
push to `master`/`main` → `.github/workflows/deploy.yml` runs on the
self-hosted runner living on the server itself and blue/green-swaps traffic
via `scripts/deploy/deploy.sh`. No SSH, no Railway, no Vercel.

```bash
# Manually re-run a deploy for one service (from the server):
bash scripts/deploy/deploy.sh backend production <git-sha>
bash scripts/deploy/deploy.sh frontend production <git-sha>

# Tail logs for the currently active slot:
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend_blue   # check upstream-backend.conf for which slot is live
```

---

## Rollback Procedure

Automated rollback already happens inside `deploy.sh`: a failed health check
or migration never cuts nginx over, so a bad deploy never reaches real
traffic in the first place. Use this procedure when a deploy *looked*
healthy at cutover but a problem surfaces afterwards.

1. **Identify what's wrong** — Sentry error spike, `/health` degraded, etc.
2. **Roll back the affected service:**
   ```bash
   bash scripts/deploy/rollback.sh backend    # or frontend
   ```
   This swaps nginx back to the previous slot (which was stopped, not
   removed, so no rebuild is needed) and posts to Slack.
3. **Database:** only roll back the schema if the migration is destructive
   — see "Emergency downgrade procedure" above. Most migrations should be
   additive/backward-compatible with the previous release specifically so
   this step is never needed.
4. **Verify:** `GET /health/live` and `GET /health` must both return 200.

---

## Database Backup Strategy

- **Provider:** self-hosted Postgres (Docker), backed up by
  `.github/workflows/backup.yml` running nightly on the deploy server via
  `scripts/backup_db.sh` — no external DB-as-a-service backup to rely on.
- **Retention:** last 30 backups kept locally under `./backups/postgres/`;
  optionally mirrored to S3 if `AWS_ACCESS_KEY_ID`/`AWS_S3_BUCKET` are set.
- **Integrity:** every backup is gzip- and format-verified immediately after
  the dump; a corrupt backup is deleted and the job fails loudly (Slack)
  rather than silently keeping a broken file.
- **Manual snapshot before risky migrations:**
  ```bash
  bash scripts/backup_db.sh --compose-file docker-compose.prod.yml
  ```
- **Restore test:** run monthly — see `docs/deployment/CICD.md` §Disaster Recovery.

---

## Health Checks

| Endpoint | Expected | Meaning |
|---|---|---|
| `GET /health/live` | 200 | Process is alive |
| `GET /health/ready` | 200 | DB + Redis reachable |
| `GET /` | 200 | API root responding |

---

## Alerting

- **Sentry** — exceptions and error rates; alert threshold: >10 errors/minute.
- **Docker** — automatic restart on crash (`restart: unless-stopped` in `docker-compose.prod.yml`).
- **`.github/workflows/health-check.yml`** — external synthetic monitor, every 15 minutes from a GitHub-hosted runner (catches DNS/firewall/cert issues the server itself can't see).
- **Slack alerts** — deploys, backups, cleanup, and health checks all post to `SLACK_ALERT_WEBHOOK_URL` on failure (see `scripts/deploy/lib.sh:notify_slack`).

---

## Common Issues

### Backend container unhealthy
1. Check logs: `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend_blue` (or `_green` — check `nginx/conf.d/upstream-backend.conf` for which slot is live).
2. Verify all required env vars are set in the server's `.env` (see `.env.example`).
3. Check dependency connectivity directly: `curl https://tiertech.com.bd/health` — the response body reports Postgres and Redis status individually.

### Alembic "Target database is not up to date"
Run `alembic upgrade head` — a previous deploy may have left migrations pending.

### Redis connection refused
Verify `REDIS_URL` is set and the Redis instance is running. The app fails open on Redis errors (auth and rate-limiting degrade gracefully).
