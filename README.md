# ChatCraft AI

Production-grade AI chatbot platform for businesses worldwide. Build, brand, and deploy AI chatbots with voice, knowledge base, and full analytics — all from one dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Zustand |
| Backend | FastAPI, Python 3.11+, Uvicorn, Gunicorn |
| Auth | NextAuth.js v5, JWT, Google OAuth |
| Database | PostgreSQL (Supabase), SQLAlchemy 2.0, Alembic, pgvector |
| Cache / Queue | Redis (Upstash), Celery |
| AI | Anthropic, OpenAI, Gemini, LiteLLM, LangChain |
| Voice | ElevenLabs |
| Payments | Stripe |
| Storage | Supabase Storage / AWS S3 |
| Email | Resend |
| Monitoring | Sentry, Axiom, PostHog |
| Infra | Docker, Docker Compose, GitHub Actions, Vercel, Railway |

---

## Project Structure

```
chatcraft/
├── frontend/          Next.js 14 app (Vercel)
├── backend/           FastAPI Python app (Railway)
├── shared/            Shared TypeScript types
├── widget/            Embeddable chat widget (vanilla JS)
├── docker-compose.yml Local dev stack
└── .env.example       All required environment variables
```

---

## Prerequisites

| Tool | Min version | Install |
|---|---|---|
| Node.js | 20.x | https://nodejs.org |
| npm | 10.x | bundled with Node |
| Python | 3.11+ | https://python.org |
| Docker | 24.x | https://docker.com |
| Docker Compose | 2.x | bundled with Docker Desktop |
| Git | any | https://git-scm.com |

---

## Local Setup

### 1. Clone the repo

```bash
git clone git@github.com:Salman-TCM/chatcraft.git
cd chatcraft
```

### 2. Configure environment variables

```bash
# Root (shared reference)
cp .env.example .env

# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

Open each `.env` file and fill in the required values. At minimum for local dev you need:

| Variable | Where to get it |
|---|---|
| `SECRET_KEY` | Run `openssl rand -hex 32` |
| `NEXTAUTH_SECRET` | Run `openssl rand -hex 32` |
| `DATABASE_URL` | Auto-set if using Docker Compose |
| `REDIS_URL` | Auto-set if using Docker Compose |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/keys |

### 3. Start the full stack with Docker Compose

```bash
docker compose up --build
```

This starts:

| Service | URL |
|---|---|
| Frontend (Next.js) | http://localhost:3000 |
| Backend (FastAPI) | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| Celery worker | (background) |

### 4. Run database migrations

```bash
# In a new terminal, once Docker Compose is up:
docker compose exec backend alembic upgrade head
```

---

## Local Setup (without Docker)

### Frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:3000
```

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start API server
uvicorn app.main:app --reload
# http://localhost:8000
```

### PostgreSQL (local)

```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16
createdb chatcraft

# Ubuntu / Debian
sudo apt install postgresql
sudo -u postgres createdb chatcraft
sudo -u postgres psql -c "CREATE USER chatcraft WITH PASSWORD 'chatcraft';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE chatcraft TO chatcraft;"
```

Update `DATABASE_URL` in `backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://chatcraft:chatcraft@localhost:5432/chatcraft
```

### Redis (local)

```bash
# macOS
brew install redis && brew services start redis

# Ubuntu / Debian
sudo apt install redis-server && sudo systemctl start redis
```

---

## Development Workflow

### Running tests

```bash
# Backend unit + integration tests
cd backend
source venv/bin/activate
pytest -v

# Frontend type check
cd frontend
npm run type-check

# Frontend lint
npm run lint

# E2E tests (Playwright)
cd frontend
npx playwright test
```

### Creating a database migration

```bash
cd backend
source venv/bin/activate

# Auto-generate from model changes
alembic revision --autogenerate -m "describe_the_change"

# Apply
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

### Adding a shadcn/ui component

```bash
cd frontend
npx shadcn@latest add button
# Component is added to frontend/components/ui/
```

---

## Environment Variables Reference

See [`.env.example`](.env.example) for the full list with descriptions. Key groups:

| Group | Variables |
|---|---|
| App | `ENVIRONMENT`, `SECRET_KEY` |
| Database | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY` |
| Auth | `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET` |
| AI | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Voice | `ELEVENLABS_API_KEY` |
| Storage | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` |
| Email | `RESEND_API_KEY` |
| Monitoring | `SENTRY_DSN`, `AXIOM_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY` |

---

## Deployment

### Frontend → Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod
```

Set all `NEXT_PUBLIC_*` variables and `NEXTAUTH_*` variables in the Vercel dashboard under Project Settings > Environment Variables.

### Backend → Railway

1. Connect the GitHub repo to Railway
2. Set root directory to `backend/`
3. Add all backend environment variables in Railway dashboard
4. Railway auto-detects the `Dockerfile` and deploys on push to `main`

### Database migrations in production

```bash
# Via Railway console or CI step
alembic upgrade head
```

---

## API Overview

Base URL: `http://localhost:8000` (dev) / `https://api.yourchatcraft.com` (prod)

| Route group | Prefix |
|---|---|
| Health | `/health` |
| Auth | `/api/auth/` |
| Chat | `/api/chat/` |
| Chatbots | `/api/chatbots/` |
| Knowledge base | `/api/kb/` |
| Billing | `/api/billing/` |
| Voice | `/api/voice/` |
| Widget | `/api/widget/` |
| Usage | `/api/usage/` |
| Analytics | `/api/analytics/` |

Full interactive docs at `/docs` (disabled in production).

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'app'`**
Run uvicorn from the `backend/` directory, not from inside `app/`.

**`NEXTAUTH_URL` mismatch error**
Set `NEXTAUTH_URL=http://localhost:3000` in `frontend/.env.local` exactly.

**Alembic `Can't locate revision`**
Run `alembic upgrade head` — you have unapplied migrations.

**`tailwindcss-animate` not found**
Run `npm install` from the `frontend/` directory (or root for workspaces).

**Docker Compose port conflict**
Stop any locally running Postgres or Redis: `brew services stop postgresql redis`.

---

## Licence

Private — all rights reserved. Not open source.
