# ChatCraft AI — Operations Runbook

## Database Migrations (Zero-Downtime)

### Apply a migration in production

```bash
# 1. SSH into the backend container or Railway shell
railway run bash

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

### Emergency downgrade procedure
1. Put the app in maintenance mode (set `MAINTENANCE_MODE=true` env var if supported, or scale replicas to 0 on Railway).
2. Run `alembic downgrade -1`.
3. Deploy the previous backend image tag.
4. Scale replicas back up.
5. Verify health: `GET /health/ready`.

---

## Deployment

### Backend (Railway)

```bash
# Deploy latest main branch
railway up --service backend

# Check logs
railway logs --service backend --tail 200

# Restart the service
railway service restart backend
```

### Frontend (Vercel)

```bash
# Trigger a production deploy
vercel --prod

# Rollback to previous deployment
vercel rollback
```

---

## Rollback Procedure

1. **Identify the last known-good commit:**
   ```bash
   git log --oneline -10
   ```
2. **Tag it for reference:** `git tag rollback-$(date +%Y%m%d)`
3. **Backend rollback on Railway:** In the Railway dashboard → Deployments → select previous deployment → Redeploy.
4. **Frontend rollback on Vercel:** In the Vercel dashboard → Deployments → previous deployment → Promote to Production.
5. **Database:** Only roll back if the migration is destructive. Use `alembic downgrade -1`.
6. **Verify:** `GET /health/live` and `GET /health/ready` must both return 200.

---

## Database Backup Strategy

- **Provider:** Supabase automatic daily backups (Point-in-Time Recovery enabled on Pro plan).
- **Retention:** 30 days.
- **Manual snapshot before risky migrations:**
  ```bash
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- **Restore test:** Run monthly — restore the latest backup to a staging DB and verify row counts.

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
- **Railway** — automatic restart on crash (ON_FAILURE policy, max 3 retries).
- **Uptime monitoring** — configure Better Uptime or UptimeRobot to ping `/health/live` every 60 seconds.
- **Slack alerts** — `app/core/alerts.py` sends to `SLACK_WEBHOOK_URL` on critical errors.

---

## Common Issues

### Backend container unhealthy
1. Check `railway logs` for startup errors.
2. Verify all required env vars are set (see `.env.example`).
3. Check DB connectivity: `railway run python -c "import asyncio; from app.db.redis import ping_redis; print(asyncio.run(ping_redis()))"`.

### Alembic "Target database is not up to date"
Run `alembic upgrade head` — a previous deploy may have left migrations pending.

### Redis connection refused
Verify `REDIS_URL` is set and the Redis instance is running. The app fails open on Redis errors (auth and rate-limiting degrade gracefully).
