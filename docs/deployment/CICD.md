# ChatCraft — CI/CD Pipeline (Self-Hosted Ubuntu Server)

This replaces the previous Railway/Vercel-based pipeline. Everything now
runs against a single Ubuntu server via Docker Compose, with GitHub Actions
driving CI and CD.

## Contents
- [Architecture & decisions](#architecture--decisions)
- [Directory structure](#directory-structure)
- [GitHub secrets & environments](#github-secrets--environments)
- [Required Ubuntu packages](#required-ubuntu-packages)
- [Initial server setup](#initial-server-setup)
- [Security hardening checklist](#security-hardening-checklist)
- [Disaster recovery](#disaster-recovery)

---

## Architecture & decisions

```
GitHub  --push-->  GitHub Actions
                        │
                        ├── ci.yml            (GitHub-hosted runners)
                        │
                        └── deploy.yml        (self-hosted runner, ON the server)
                                │
                                ▼
                    Ubuntu Server (self-hosted runner lives here)
                        │
                        ▼
                    Docker Compose
                    ├── nginx            (TLS termination, blue/green switch)
                    ├── backend_blue/green    (FastAPI)
                    ├── frontend_blue/green   (Next.js)
                    ├── postgres              (data network only)
                    ├── redis                 (data network only)
                    ├── celery_worker/beat
                    └── clamav
```

### 1. Self-hosted runner instead of SSH
The obvious reading of "GitHub Actions → SSH → Ubuntu server" is to open
inbound SSH from GitHub-hosted runners. This repo already had a different,
deliberate design (`deploy-server.yml`, now superseded by `deploy.yml`): a
**self-hosted GitHub Actions runner installed on the server itself**. The
job runs *as* the server — there's no network hop, so no inbound port ever
needs to open for GitHub. This pipeline keeps that model rather than
introducing SSH and a private key secret.

**Trade-off:** self-hosted runners are your responsibility to patch and
keep online (see the security checklist below); GitHub-hosted runners are
zero-maintenance but require the SSH exposure this design avoids. For a
single-server deployment, avoiding a permanently-open SSH port to a large,
dynamic IP range (GitHub's) is the better trade.

### 2. Nginx as the public-facing proxy (not Cloudflare Tunnel)
Production traffic previously reached the box through `cloudflared`, which
also kept zero inbound ports open. This pipeline replaces that with Nginx
terminating TLS directly on 80/443, per the requested architecture — which
means **80/443 are now genuinely open to the internet** on this server, a
real change from the previous zero-inbound-ports posture. The security
checklist below assumes this and hardens accordingly (ufw, fail2ban,
cert renewal, security headers). SSH for human/admin access is a separate
concern from this pipeline and should still be locked down independently
(key-only, non-standard port or IP-allowlisted — this pipeline doesn't open
any *new* SSH exposure, since it uses the self-hosted runner, not SSH, to
deploy).

### 3. Blue/green instead of recreate-in-place
`docker compose up -d --build <service>` recreates a container in place —
there's a real gap between "old container stopped" and "new container
healthy" where requests fail. Backend and frontend each run as two named
services (`_blue`/`_green`) sharing one image tag. `scripts/deploy/deploy.sh`
builds and starts only the *idle* slot, health-checks it deeply, then flips
an Nginx upstream file and reloads (`nginx -s reload`, which never drops
existing connections) before draining and stopping the old slot. If the new
slot never becomes healthy, nginx is never touched — the old slot just
keeps serving. That's the automatic rollback: **there is no separate
rollback code path for a failed deploy, because a failed deploy never cuts
over in the first place.** `scripts/deploy/rollback.sh` exists for the
different case — a deploy that passed health checks but misbehaves under
real traffic afterwards.

Postgres and Redis are **not** blue/green — they're stateful singletons.
Migrations run once, against the idle backend slot, under a flock
(`scripts/deploy/migrate.sh`), before cutover.

### 4. The frontend proxies to the backend — Nginx doesn't route by path
Check `frontend/next.config.mjs`: the browser only ever talks to one
origin. Next.js's own server-side `rewrites()` forward `/api/*`, `/webhooks/*`,
`/health/*`, etc. to the backend over the internal Docker network. Nginx
therefore only needs **one public upstream: the frontend.** The backend
gets its own upstream too, but on an *internal-only* listener
(`nginx:8081`, not published to the host) — that's what the frontend's
`BACKEND_URL` points to. This means a backend blue/green swap never
requires touching or restarting the frontend container: only the internal
Nginx upstream changes.

### 5. Docker network segmentation
Two bridge networks: `edge` (nginx, both frontend slots, both backend
slots) and `data` (both backend slots, celery worker/beat, clamav, postgres,
redis — and marked `internal: true`, no route to the outside world).
**Frontend and Nginx are never attached to `data`.** Even if the frontend
container were compromised, it has no network path to Postgres or Redis at
all — not a firewall rule that could be misconfigured, an actual absence of
a route. Backend/celery/clamav are attached to both, because `data` being
`internal: true` cuts *all* of their internet access too (needed for
Anthropic/OpenAI/Stripe calls and ClamAV signature updates) — their `edge`
attachment is what restores that.

### 6. Ruff format instead of Black
`backend/ruff.toml` already configures `[tool.ruff.format]` — this repo
standardized on Ruff's own formatter, not Black. Running Black alongside it
would just fight Ruff over the same lines with a different rule set. CI
runs `ruff format --check` as the formatting gate instead of installing a
second, redundant formatter.

### 7. pip-audit + npm audit for dependencies, Trivy for built images
These catch different things: `pip-audit`/`npm audit` scan your declared
dependencies before anything is built (fast, no Docker needed). Trivy scans
the **built image** — OS packages baked into the Alpine base layers that
neither of the above ever sees. Using both, each for what it's actually
good at, beats picking one tool and asking it to do the other's job. All
three fail the PR on CRITICAL/HIGH findings (not on every low-severity
transitive advisory — see decision #10).

### 8. Path filtering only in `deploy.yml`, not `ci.yml`
`ci.yml` always runs both backend and frontend checks on every PR — a
change that looks backend-only can still break the frontend's type
contracts (`shared/`) or vice versa, and CI minutes on GitHub-hosted
runners are cheap. `deploy.yml` *does* path-filter (via
`dorny/paths-filter`), because deploying an unchanged service is wasted
work on a real production system, not just wasted CI minutes: it means
restarting a container (and paying the blue/green swap cost) for zero code
change. `shared/**` maps to a **frontend-only** redeploy here specifically
because `@chatcraft/shared` is a TypeScript package consumed only by the
frontend (see `shared/package.json`) — this repo's "shared" isn't shared
between the Python backend and the Next.js frontend the way the generic
spec assumed.

### 9. No automated database rollback
`scripts/deploy/rollback.sh` swaps traffic back to the previous *code*
slot; it deliberately never runs `alembic downgrade`. Auto-reverting a
schema change on a live production database is a much bigger risk than the
problem it's solving — a downgrade can drop columns/data that the new
version already wrote. The correct discipline is that every migration
should be additive/backward-compatible with the *previous* release (the
standard "expand/contract" pattern), so the old code slot keeps working
unmodified if you ever roll back to it. A destructive downgrade is a
deliberate, manual, on-call decision — see `docs/RUNBOOK.md`.

### 10. No `docker volume prune` in automated cleanup
`docker volume prune` decides "unused" by live container attachment, not by
compose-file references. If Postgres is briefly stopped (mid-migration, a
manual restart), its named volume would look unused and get deleted by an
automated prune — an irreversible-data-loss bug waiting to happen for a
disk-space optimization. `cleanup.yml`/`cleanup_docker.sh` prune dangling
images, old stopped containers, and build cache; volumes are explicitly out
of scope.

### 11. No reusable workflow between `ci.yml` and `deploy.yml`
Considered, then dropped: CI runs on ephemeral GitHub-hosted runners and is
about correctness gates; CD runs on a stateful self-hosted runner and is
about a live blue/green swap. There's no meaningful step duplication
between them to justify the added indirection of a reusable workflow file —
the deploy *logic* is already factored out into `scripts/deploy/*.sh` and
called identically from both the workflow and by hand, which is the reuse
that actually mattered.

---

## Directory structure

```
.
├── .github/workflows/
│   ├── ci.yml              # PRs + push: lint, format, type-check, test, vuln scan, image build
│   ├── deploy.yml          # push to master/main/develop: self-hosted blue/green deploy
│   ├── backup.yml          # nightly Postgres backup
│   ├── cleanup.yml         # weekly Docker disk cleanup
│   └── health-check.yml    # every 15 min: external synthetic monitor
├── docker-compose.yml               # base — local dev
├── docker-compose.staging.yml       # override — develop branch, Cloudflare Tunnel, single-slot
├── docker-compose.prod.yml          # override — master/main, Nginx, blue/green
├── nginx/
│   ├── nginx.conf
│   ├── conf.d/
│   │   ├── server.conf                        # static — TLS, routing, security headers
│   │   ├── upstream-backend.conf.template      # bootstrap only, committed
│   │   ├── upstream-frontend.conf.template     # bootstrap only, committed
│   │   ├── upstream-backend.conf               # LIVE STATE — gitignored, never committed
│   │   └── upstream-frontend.conf              # LIVE STATE — gitignored, never committed
│   └── snippets/security-headers.conf
├── scripts/
│   ├── backup_db.sh
│   └── deploy/
│       ├── lib.sh              # shared bash helpers (sourced, not run directly)
│       ├── deploy.sh           # main orchestrator — build, health-check, swap, drain
│       ├── rollback.sh         # manual swap back to the previous slot
│       ├── migrate.sh          # flock-guarded alembic upgrade + verification
│       ├── health_check.sh     # external synthetic check (frontend + backend + deps)
│       └── cleanup_docker.sh   # safe prune (no volumes)
├── backend/, frontend/, shared/    # application code (unchanged)
└── .deploy/state/                  # LIVE STATE — gitignored — active/previous slot, image tags
```

On the server, this is the same checkout the self-hosted runner updates in
place (`git reset --hard`) on every deploy — see decision #1. The
gitignored files above are exactly the ones that must survive that reset
untouched.

---

## GitHub secrets & environments

Because deploys run on a self-hosted runner rather than over SSH, **there
is no `SERVER_HOST`/`SERVER_PORT`/`SERVER_USER`/`SSH_PRIVATE_KEY` to
manage** — that entire credential category doesn't exist in this design.
The self-hosted runner authenticates to GitHub once at registration time
(its own token, stored by the runner service, never in this repo).

| Secret | Used by | Required |
|---|---|---|
| `SLACK_ALERT_WEBHOOK_URL` | `deploy.yml`, `backup.yml`, `cleanup.yml`, `health-check.yml` | Yes — all failure notifications go through this |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` | `backup.yml` | Optional — enables offsite backup mirror |

Environments: `production` (master/main) and `staging` (develop) are
referenced in `deploy.yml`. Configure required reviewers on the
`production` environment from repo **Settings → Environments** if you want
a manual approval gate before a deploy runs — that can't be set from the
workflow YAML itself.

Everything else (`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `POSTGRES_PASSWORD`,
etc.) lives in the server's own `.env` file, read directly by
`docker-compose.prod.yml` — it never needs to pass through GitHub at all,
because the job that uses it already runs on the machine that has it.

---

## Required Ubuntu packages

```bash
sudo apt-get update && sudo apt-get install -y \
  curl git ufw fail2ban unattended-upgrades \
  ca-certificates gnupg lsb-release \
  certbot python3-certbot-nginx
```

Docker Engine + Compose plugin (not the `docker.io` apt package — install
from Docker's own repo for the current Compose v2 plugin):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

---

## Initial server setup

1. **Provision** an Ubuntu 22.04+ server, point `tiertech.com.bd` and
   `www.tiertech.com.bd` DNS A records at its public IP.
2. **Install packages** — see above.
3. **Firewall** (only 80/443 for the app; keep SSH access restricted to
   your own admin IP or a VPN, independent of this pipeline):
   ```bash
   sudo ufw default deny incoming
   sudo ufw allow OpenSSH        # or a non-standard port — see security checklist
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
4. **Clone the repo** to `/home/<user>/Salman/deployment/chatcraft` (or
   update the path in `deploy.yml`'s comments / your runner's working
   directory) and create `.env` from `.env.example` with real production
   values.
5. **Register the self-hosted runner** (repo → Settings → Actions →
   Runners → New self-hosted runner), label it `chatcraft-deploy`, and
   install it as a service (`./svc.sh install && ./svc.sh start`) so it
   survives reboots.
6. **Issue the TLS cert** (before starting nginx — it mounts
   `/etc/letsencrypt` read-only and will fail to start without a cert):
   ```bash
   sudo mkdir -p /var/www/certbot
   sudo certbot certonly --webroot -w /var/www/certbot \
     -d tiertech.com.bd -d www.tiertech.com.bd
   ```
   Certbot installs its own systemd timer for renewal; add a deploy-hook so
   Nginx picks up the renewed cert without a restart:
   ```bash
   echo 'docker compose -f /path/to/docker-compose.yml -f /path/to/docker-compose.prod.yml exec nginx nginx -s reload' \
     | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   ```
7. **First boot — bootstrap order matters.** Nginx resolves its upstream
   hostnames at startup; on a totally fresh server there's no
   `backend_blue`/`frontend_blue` container yet for it to resolve, so nginx
   will fail to start if brought up first:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
     up -d --no-deps postgres redis clamav backend_blue celery_worker celery_beat frontend_blue
   # wait for both to report healthy: docker compose ps
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps nginx
   ```
   After this first boot, `deploy.yml` takes over for every subsequent
   deploy — this manual bootstrap is a one-time step per server.
8. **Push to `master`** and confirm `deploy.yml` runs, `health-check.yml`
   passes, and a Slack message arrives.

---

## Security hardening checklist

- [ ] SSH: key-only auth (`PasswordAuthentication no` in `sshd_config`),
      root login disabled, ideally a non-default port or IP-allowlisted —
      this is unrelated to the deploy pipeline but is the main remaining
      inbound surface on this box.
- [ ] `ufw` enabled, default-deny incoming, only 80/443 (+ your chosen SSH
      port) allowed.
- [ ] `fail2ban` enabled for `sshd` at minimum.
- [ ] `unattended-upgrades` enabled for security patches.
- [ ] Self-hosted runner runs as a **dedicated non-root user**, not your
      personal admin account — it can execute arbitrary code from any
      workflow run in this repo.
- [ ] `.env` on the server is `chmod 600`, owned by the deploy user, and
      **never committed** — confirm it's in `.gitignore` (it already is).
- [ ] Docker socket is not bind-mounted into any container (nothing in
      this stack needs it — don't add it later without re-reviewing this).
- [ ] TLS: only `TLSv1.2`/`TLSv1.3` (already set in `nginx/conf.d/server.conf`),
      HSTS header present (already set), cert auto-renewal confirmed working
      (`sudo certbot renew --dry-run`).
- [ ] Security headers present — verify with
      `curl -sI https://tiertech.com.bd | grep -i x-frame-options`.
- [ ] `SLACK_ALERT_WEBHOOK_URL` treated as a secret — if it's ever pasted
      somewhere plaintext (chat, logs), regenerate it from Slack's
      Incoming Webhooks page.
- [ ] Rotate `SECRET_KEY`/`NEXTAUTH_SECRET`/DB credentials periodically —
      see `scripts/rotate_secrets.sh` (existing, unrelated to this pipeline
      but relevant here).
- [ ] Enable required reviewers on the `production` GitHub environment if
      you want deploys gated on manual approval.

---

## Disaster recovery

### Total server loss
1. Provision a new server, repeat **Initial server setup** above.
2. Restore the latest backup:
   ```bash
   gunzip -c backups/postgres/chatcraft_<latest>.sql.gz | \
     docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
     psql -U chatcraft -d chatcraft
   ```
   (If backups were also mirrored to S3, `aws s3 cp` the latest object down
   first — `s3://<bucket>/backups/postgres/`.)
3. Deploy: push any commit to `master` (or `workflow_dispatch` on
   `deploy.yml`) once the runner is registered.

### Bad migration reaches production
Follow `docs/RUNBOOK.md` → "Emergency downgrade procedure". Automated
rollback does not touch the schema (decision #9 above) — this is
intentionally a manual, on-call decision.

### Corrupted backup discovered
`scripts/backup_db.sh` already gzip- and format-verifies every backup
immediately after taking it and deletes+fails loudly on corruption, so a
bad backup should never make it into the retained set. If an older backup
is found corrupted later anyway, fall back to the next-oldest and to the S3
mirror if configured.

### Monthly restore test
Restore the latest backup into a throwaway Postgres container (not
production) and spot-check row counts against production:
```bash
docker run --rm -d --name restore-test -e POSTGRES_PASSWORD=test pgvector/pgvector:pg16
gunzip -c backups/postgres/chatcraft_<latest>.sql.gz | docker exec -i restore-test psql -U postgres
docker exec restore-test psql -U postgres -c "SELECT count(*) FROM users;"
docker rm -f restore-test
```
