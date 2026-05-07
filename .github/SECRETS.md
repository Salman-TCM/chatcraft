# ChatCraft AI — Secrets & Environment Configuration

Complete reference for configuring secrets across GitHub Actions, Railway, and Vercel.
Work through each section in order — Railway and Vercel must be set up before the
deploy workflows can run.

---

## 1. GitHub Actions Secrets

Go to: **GitHub repo → Settings → Secrets and variables → Actions → Secrets**

| Secret | Value | Used by |
|---|---|---|
| `RAILWAY_TOKEN` | Railway project token | deploy-backend.yml |
| `VERCEL_TOKEN` | Vercel personal access token | deploy-frontend.yml |
| `VERCEL_ORG_ID` | Vercel team/org ID | deploy-frontend.yml |
| `VERCEL_PROJECT_ID` | Vercel project ID | deploy-frontend.yml |

### How to get each value

**RAILWAY_TOKEN**
1. https://railway.app → your project → Settings → Tokens → New Token
2. Name it `github-actions`, copy the value

**VERCEL_TOKEN**
1. https://vercel.com/account/tokens → Create Token
2. Scope: Full Account, no expiry

**VERCEL_ORG_ID + VERCEL_PROJECT_ID**
1. `npm i -g vercel && vercel login`
2. In `frontend/`: `vercel link`
3. Open `.vercel/project.json` — copy `orgId` and `projectId`

---

## 2. GitHub Actions Variables

Go to: **GitHub repo → Settings → Secrets and variables → Actions → Variables**

| Variable | Example value |
|---|---|
| `RAILWAY_BACKEND_URL` | `https://chatcraft-api.up.railway.app` |
| `VERCEL_FRONTEND_URL` | `https://chatcraft.ai` |

---

## 3. Railway Environment Variables

Go to: **Railway dashboard → chatcraft project → backend service → Variables**

### Required for app to start

| Variable | Notes |
|---|---|
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | `openssl rand -hex 32` |
| `DATABASE_URL` | Railway Postgres plugin → copy connection URL |
| `REDIS_URL` | Upstash → copy TLS URL (rediss://...) |
| `CORS_ORIGINS` | `["https://chatcraft.ai"]` |

### Auth

| Variable | Notes |
|---|---|
| `NEXTAUTH_URL` | `https://chatcraft.ai` |

### AI providers

| Variable | Notes |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/keys |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `GOOGLE_AI_API_KEY` | https://aistudio.google.com/app/apikey |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |

### Payments

| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (live key) |
| `STRIPE_PUBLISHABLE_KEY` | Same page — publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → chatcraft endpoint → Signing secret |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe → Connect → Settings → Client ID |

### Storage

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `SUPABASE_KEY` | Supabase project → Settings → API → service_role key |
| `AWS_ACCESS_KEY_ID` | IAM user with S3 access (optional if using Supabase Storage) |
| `AWS_SECRET_ACCESS_KEY` | — |
| `AWS_S3_BUCKET` | `chatcraft-uploads` |
| `AWS_REGION` | `eu-west-2` |

### Email

| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | https://resend.com/api-keys |
| `RESEND_FROM_EMAIL` | `noreply@yourdomain.com` (must be a verified domain) |

### Monitoring

| Variable | Notes |
|---|---|
| `SENTRY_DSN` | Sentry → Python project → Settings → Client Keys |
| `AXIOM_TOKEN` | https://app.axiom.co/settings/api-tokens |
| `AXIOM_DATASET` | `chatcraft-logs` |

---

## 4. Vercel Environment Variables

Go to: **Vercel → chatcraft project → Settings → Environment Variables**
Set scope to **Production** for all of these.

| Variable | Notes |
|---|---|
| `NEXTAUTH_URL` | `https://chatcraft.ai` |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` (different from backend SECRET_KEY) |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | — |
| `NEXT_PUBLIC_API_URL` | `https://chatcraft-api.up.railway.app` |
| `NEXT_PUBLIC_APP_URL` | `https://chatcraft.ai` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe live publishable key |
| `NEXT_PUBLIC_POSTHOG_KEY` | https://app.posthog.com/project/settings |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://eu.posthog.com` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Next.js project → Settings → Client Keys |

---

## 5. Vercel Production Domain

1. Vercel → chatcraft project → Settings → Domains
2. Add `chatcraft.ai` (or your domain)
3. Copy the DNS records shown and add them to your domain registrar
4. Wait for SSL to provision (~2 min)

---

## 6. Stripe Webhook Endpoint

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://chatcraft-api.up.railway.app/api/billing/webhook`
3. Events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the **Signing secret** → paste into Railway as `STRIPE_WEBHOOK_SECRET`

---

## 7. Google OAuth Redirect URIs

1. Google Cloud Console → APIs & Services → Credentials → your OAuth client
2. Add to **Authorised redirect URIs**:
   - `https://chatcraft.ai/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for local dev)

---

## Validation

Run this any time to verify all GitHub secrets are set:

```
GitHub → Actions → Validate Secrets → Run workflow
```
