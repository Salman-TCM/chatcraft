# AI Chatbot Platform — Complete Build Plan
> Full-stack SaaS platform with AI chat, voice, RAG, billing, and analytics

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Zustand, React Hook Form + Zod |
| **Backend** | FastAPI, Python 3.11+, Uvicorn, Gunicorn, Pydantic v2 |
| **Auth** | NextAuth.js v5, JWT, OAuth (Google) |
| **Database** | PostgreSQL via Supabase, SQLAlchemy 2.0, Alembic, pgvector |
| **Cache / Queue** | Redis (Upstash), Celery, BullMQ |
| **AI / LLM** | Anthropic SDK, OpenAI SDK, Google Generative AI, LiteLLM, LangChain |
| **Voice** | ElevenLabs SDK |
| **Payments** | Stripe SDK, Stripe Connect, Stripe Webhooks |
| **Storage** | Supabase Storage / AWS S3 (boto3) |
| **Email** | Resend |
| **Monitoring** | Sentry, Axiom (logs), PostHog (analytics) |
| **Testing** | Pytest, Playwright, Jest |
| **Infra** | Docker, Docker Compose, GitHub Actions, Vercel (frontend), Railway (backend) |

---

## 📋 Phase Overview

| Phase | Focus | Tasks |
|---|---|---|
| Phase 1 | Foundation & DevOps | 28 |
| Phase 2 | Auth & Billing | 52 |
| Phase 3 | Core Chat & Multi-Model | 46 |
| Phase 4 | Knowledge Base (RAG) | 38 |
| Phase 5 | Voice, Branding & Widget | 48 |
| Phase 6 | Usage Metering & Analytics | 44 |
| Phase 7 | Security, Testing & Launch | 52 |
| **Total** | | **308** |

---

## ⏱️ Estimated Timeline

| Phase | With Claude CLI | Traditional Dev |
|---|---|---|
| Phase 1 | 1–2 days | 1 week |
| Phase 2 | 3–5 days | 2–3 weeks |
| Phase 3 | 3–5 days | 2–3 weeks |
| Phase 4 | 3–4 days | 2 weeks |
| Phase 5 | 4–5 days | 2–3 weeks |
| Phase 6 | 3–4 days | 2 weeks |
| Phase 7 | 3–5 days | 2 weeks |
| **Total** | **~3–4 weeks** | **3–4 months** |

---

## ✅ Phase 1 — Foundation & DevOps
> Goal: Working repo, local dev, CI/CD pipeline live

### Repo & Structure
- [ ] Monorepo setup (`/frontend`, `/backend`, `/shared`)
- [ ] `.env.example` with all required keys documented
- [ ] `README.md` with full local setup instructions
- [ ] `.gitignore` for Python, Node, secrets

### Docker
- [ ] `Dockerfile` for FastAPI backend
- [ ] `Dockerfile` for Next.js frontend
- [ ] `docker-compose.yml` (app + postgres + redis + celery worker)
- [ ] Health check endpoints on all services
- [ ] Volume mounts for local development hot reload

### Database
- [ ] PostgreSQL setup via Supabase
- [ ] SQLAlchemy 2.0 async engine configured
- [ ] Alembic migration system initialised
- [ ] pgvector extension enabled
- [ ] Base model class with `id`, `created_at`, `updated_at`
- [ ] First migration: users table

### Redis & Celery
- [ ] Redis connection (Upstash for prod, local for dev)
- [ ] Celery app configured with Redis broker
- [ ] Celery beat scheduler for cron jobs
- [ ] Test task to verify queue is working

### CI/CD
- [ ] GitHub Actions: lint + test on every PR
- [ ] GitHub Actions: auto deploy backend to Railway on merge to main
- [ ] GitHub Actions: auto deploy frontend to Vercel on merge to main
- [ ] Environment secrets configured in GitHub + Vercel + Railway
- [ ] Staging environment separate from production

### Logging & Monitoring
- [ ] Sentry SDK installed on both frontend and backend
- [ ] Axiom log shipping from FastAPI
- [ ] Structured JSON logging format
- [ ] Error alerting to Slack or email

---

## ✅ Phase 2 — Auth & Billing
> Goal: Users can register, log in, subscribe, and be gated by plan

### Database Tables
- [ ] `users` table (id, email, password_hash, role, stripe_customer_id, subscription_status, trial_ends_at)
- [ ] `subscriptions` table (id, user_id, stripe_subscription_id, plan, status, current_period_end)
- [ ] `payments` table (id, user_id, stripe_payment_intent_id, amount, currency, status)

### Authentication — Backend (FastAPI)
- [ ] `POST /api/auth/register` — email + password registration
- [ ] `POST /api/auth/login` — returns access + refresh token
- [ ] `POST /api/auth/refresh` — rotate refresh token
- [ ] `POST /api/auth/logout` — revoke refresh token
- [ ] `GET /api/auth/me` — return current user profile
- [ ] Password hashing with bcrypt
- [ ] JWT access tokens (15 min expiry)
- [ ] Refresh tokens (7 day expiry, stored in httpOnly cookie)
- [ ] Role-based middleware: `free`, `trial`, `premium`, `creator`, `admin`
- [ ] Rate limiting middleware (slowapi): per role tier
- [ ] Google OAuth endpoint
- [ ] Email verification flow (send via Resend)
- [ ] Password reset flow (token + email)

### Authentication — Frontend (Next.js)
- [ ] NextAuth.js v5 configured
- [ ] Login page (`/login`)
- [ ] Register page (`/register`)
- [ ] Google OAuth button
- [ ] Email verification page
- [ ] Password reset page
- [ ] Protected route middleware (redirect unauthenticated users)
- [ ] Session state in Zustand

### Stripe Billing — Backend
- [ ] Stripe SDK configured
- [ ] `POST /api/billing/checkout` — create Stripe Checkout session
- [ ] `GET /api/billing/portal` — Stripe customer portal link
- [ ] `POST /api/billing/webhook` — handle all Stripe events
- [ ] Webhook handler: `customer.subscription.created` → set role to premium
- [ ] Webhook handler: `customer.subscription.updated` → update plan
- [ ] Webhook handler: `customer.subscription.deleted` → downgrade to free
- [ ] Webhook handler: `invoice.payment_succeeded` → log payment
- [ ] Webhook handler: `invoice.payment_failed` → grace period + email
- [ ] Stripe webhook signature verification
- [ ] One-time payment (Stripe Payment Intent) endpoint
- [ ] Stripe Connect for creator payouts (`/api/billing/connect`)
- [ ] Failed payment grace period logic (3 days before downgrade)

### Billing — Frontend
- [ ] Pricing page (`/pricing`) with plan comparison table
- [ ] Stripe Checkout redirect on plan selection
- [ ] Success page after payment (`/billing/success`)
- [ ] Billing management page (`/billing`) using Stripe portal
- [ ] Free trial countdown banner
- [ ] Upgrade prompt modal (triggered at usage limits)
- [ ] Soft paywall overlay component (blurred content + CTA)
- [ ] Hard paywall modal (message cap reached)

---

## ✅ Phase 3 — Core Chat & Multi-Model
> Goal: Working AI chat with streaming, model switching, and full chat history

### Database Tables
- [ ] `chatbot_configs` table (id, user_id, name, default_model, allow_model_switch, fallback_model, published)
- [ ] `conversations` table (id, chatbot_id, user_id, guest_id, title, created_at)
- [ ] `messages` table (id, conversation_id, role, content, model, input_tokens, output_tokens, cost_usd, created_at)

### LLM Abstraction Layer (Python)
- [ ] `LLMService` base class with unified interface
- [ ] `AnthropicProvider` — Claude Sonnet integration
- [ ] `OpenAIProvider` — GPT-4o + GPT-4o mini integration
- [ ] `GeminiProvider` — Gemini 1.5 Pro + Flash integration
- [ ] `LiteLLM` unified routing (fallback + cost tracking)
- [ ] Streaming response support for all providers
- [ ] Automatic fallback to secondary model on failure
- [ ] Token counting per request (input + output)
- [ ] Cost calculation per model (stored rates table)
- [ ] Prompt injection sanitisation before every LLM call
- [ ] System prompt builder (injects branding + knowledge base context)

### Chat API — Backend
- [ ] `POST /api/chat/{chatbot_id}` — streaming chat endpoint (SSE)
- [ ] `GET /api/chat/{chatbot_id}/history` — paginated conversation history
- [ ] `DELETE /api/chat/{conversation_id}` — delete conversation
- [ ] `GET /api/chatbots` — list user's chatbots
- [ ] `POST /api/chatbots` — create chatbot
- [ ] `GET /api/chatbots/{id}` — get chatbot config
- [ ] `PUT /api/chatbots/{id}` — update chatbot config
- [ ] `DELETE /api/chatbots/{id}` — delete chatbot
- [ ] Message cap enforcement per tier (free: 20/month)
- [ ] Guest chat support (no login, up to free cap)
- [ ] Conversation title auto-generation after first message
- [ ] Message thumbs up/down feedback endpoint

### Chat UI — Frontend
- [ ] Chat interface component (`ChatWindow`)
- [ ] Streaming message rendering (token-by-token display)
- [ ] Message bubble component (user vs assistant)
- [ ] Typing indicator during generation
- [ ] Stop generation button
- [ ] Regenerate last message button
- [ ] Model switcher dropdown (if enabled by creator)
- [ ] Conversation sidebar (list + search)
- [ ] New conversation button
- [ ] Message copy button
- [ ] Thumbs up/down feedback buttons
- [ ] Message character counter
- [ ] Mobile responsive chat layout

---

## ✅ Phase 4 — Knowledge Base (RAG Pipeline)
> Goal: Users can upload docs and the chatbot answers from their content

### Database Tables
- [ ] `knowledge_base_documents` (id, chatbot_id, name, type, file_url, status, chunk_count, token_count)
- [ ] `knowledge_base_chunks` (id, document_id, chunk_index, content, embedding vector, token_count)

### Document Processing — Backend (Celery Workers)
- [ ] PDF text extraction (pdfplumber + PyMuPDF fallback)
- [ ] DOCX extraction (python-docx)
- [ ] Plain text `.txt` processing
- [ ] Web URL scraping (BeautifulSoup + httpx)
- [ ] Raw text paste ingestion
- [ ] Text cleaning and normalisation pipeline
- [ ] Chunking strategy: 500 token chunks, 50 token overlap (LangChain splitter)
- [ ] Embedding generation: `text-embedding-3-small` (OpenAI)
- [ ] Store embeddings in pgvector (cosine similarity index)
- [ ] Document status updates: `pending → processing → ready / error`
- [ ] Celery task for async processing (non-blocking upload)
- [ ] Retry logic on embedding failures

### RAG Query Pipeline
- [ ] `RAGService` class
- [ ] Embed user query at chat time
- [ ] Cosine similarity search (top K=5 chunks)
- [ ] Context injection into system prompt
- [ ] Relevance score threshold (ignore chunks below 0.75)
- [ ] Chunk source attribution in response (optional debug mode)
- [ ] Hybrid search: vector + keyword (BM25) for better recall

### Knowledge Base API — Backend
- [ ] `POST /api/kb/{chatbot_id}/upload` — file upload endpoint
- [ ] `GET /api/kb/{chatbot_id}/documents` — list documents
- [ ] `GET /api/kb/{chatbot_id}/documents/{id}` — document detail + chunks
- [ ] `DELETE /api/kb/{chatbot_id}/documents/{id}` — delete document
- [ ] `POST /api/kb/{chatbot_id}/search` — test search endpoint
- [ ] File size validation (max 25MB per file)
- [ ] File type validation (server-side mime check)
- [ ] Storage to Supabase Storage / S3

### Knowledge Base UI — Frontend
- [ ] Upload zone (drag and drop + click to upload)
- [ ] Upload progress bar
- [ ] Document list with status badges
- [ ] Document preview (extracted text)
- [ ] Delete document button with confirm dialog
- [ ] Test search box (shows retrieved chunks)
- [ ] Storage usage meter
- [ ] Web URL input field

---

## ✅ Phase 5 — Voice, Branding & Embeddable Widget
> Goal: Voice chat works, chatbots are fully branded, widget embeds anywhere

### Database Tables
- [ ] Update `chatbot_configs` with branding fields (logo_url, primary_colour, font, welcome_message, bubble_style)
- [ ] Update `chatbot_configs` with voice fields (voice_id, tts_enabled, stt_enabled, auto_play)
- [ ] `widget_configs` (id, chatbot_id, allowed_domains, position, show_branding, embed_token)

### Voice — Backend (ElevenLabs)
- [ ] `POST /api/voice/tts` — text to speech (streaming audio)
- [ ] `POST /api/voice/stt` — speech to text
- [ ] `GET /api/voice/voices` — list available ElevenLabs voices
- [ ] Audio file storage (S3/Supabase) for TTS cache
- [ ] TTS character count tracking (billing unit for ElevenLabs)
- [ ] STT seconds tracking
- [ ] Voice config per chatbot (voice_id, stability, similarity_boost)

### Voice — Frontend
- [ ] Text-to-speech playback (auto-play toggle)
- [ ] Audio player controls (play, pause, speed: 0.75x 1x 1.25x 1.5x)
- [ ] Microphone button (push-to-talk)
- [ ] Browser audio recording (MediaRecorder API)
- [ ] STT transcript display in chat input before sending
- [ ] Voice-only full-screen mode
- [ ] Animated waveform while listening
- [ ] Silence detection (auto-stop recording)
- [ ] Mobile microphone permission handling

### Branding Builder — Frontend
- [ ] Brand settings page (`/dashboard/chatbots/{id}/branding`)
- [ ] Logo upload with preview (auto-resize to 512x512)
- [ ] Colour picker: primary, secondary, background
- [ ] Font family selector (web-safe fonts)
- [ ] Welcome message input
- [ ] Placeholder text input
- [ ] Chat bubble style toggle (rounded / square / pill)
- [ ] Dark mode toggle
- [ ] Theme presets (Professional / Friendly / Bold / Minimal)
- [ ] Live preview panel (mobile + desktop side by side)
- [ ] Save and publish button

### Embeddable Widget
- [ ] `widget.js` standalone file (no framework dependency)
- [ ] Floating chat bubble (configurable position)
- [ ] Load chatbot config from CDN-cached endpoint
- [ ] Apply branding via CSS variables injected at runtime
- [ ] Expand/collapse animation
- [ ] Auth: guest chats up to free limit, then sign-up prompt
- [ ] Stripe checkout modal in-widget for upgrades
- [ ] Domain whitelist enforcement (CORS + server-side check)
- [ ] Signed widget token system (prevent hotlinking)
- [ ] Widget snippet generator UI
- [ ] One-click copy snippet button
- [ ] Integration guides: WordPress, Squarespace, Wix, Webflow, Shopify
- [ ] `GET /api/widget/{chatbot_id}/config` — public config endpoint (edge cached)
- [ ] `POST /api/widget/{chatbot_id}/chat` — widget chat endpoint

---

## ✅ Phase 6 — Usage Metering & Creator Dashboard
> Goal: Every token tracked, billing synced, creators see full analytics

### Database Tables
- [ ] `usage_logs` (id, user_id, chatbot_id, conversation_id, model, input_tokens, output_tokens, tts_chars, stt_secs, embedding_tokens, cost_usd, created_at)
- [ ] `analytics_daily` (id, chatbot_id, date, messages_count, users_count, avg_session_length, revenue_usd)

### Usage Metering — Backend
- [ ] Log every LLM request (model, tokens, cost) to `usage_logs`
- [ ] Log every TTS/STT request (characters, seconds)
- [ ] Log embedding usage
- [ ] Monthly usage aggregation job (Celery beat, daily)
- [ ] Usage cap enforcement per tier (real-time check on each request)
- [ ] Usage alert emails at 80% and 100% of cap (Resend)
- [ ] Stripe metered billing sync (report units at billing period end)
- [ ] Cost recovery: creator sets markup rate, applied to usage cost
- [ ] Stripe Connect payout calculation

### Usage API — Backend
- [ ] `GET /api/usage/summary` — current month usage by category
- [ ] `GET /api/usage/history` — 30-day usage history
- [ ] `GET /api/usage/cost` — cost breakdown by model/service

### Creator Dashboard — Frontend
- [ ] Dashboard home (`/dashboard`)
- [ ] Overview cards: MRR, active subscribers, total conversations, messages
- [ ] Revenue chart (Recharts line chart, 30-day)
- [ ] New vs churned subscribers chart (bar chart)
- [ ] Daily active users chart
- [ ] Messages per day chart
- [ ] Peak usage heatmap (hour × day grid)
- [ ] Top questions table (most frequent user inputs)
- [ ] Model usage breakdown (pie chart)
- [ ] Knowledge base hit rate metric
- [ ] Response time average (ms)
- [ ] User satisfaction rate (thumbs up/down ratio)
- [ ] Conversation log table (searchable, filterable)
- [ ] Filter by: date range, model, user, sentiment
- [ ] Export conversations to CSV
- [ ] GDPR: delete individual user data button
- [ ] Usage summary page (tokens, voice, storage)
- [ ] Revenue by plan type breakdown
- [ ] Stripe payout history table

### User-Facing Usage Page
- [ ] Messages used this month vs cap (progress bar)
- [ ] Voice minutes used
- [ ] Storage used (knowledge base)
- [ ] Usage history chart (30 days)
- [ ] Upgrade CTA when approaching cap

---

## ✅ Phase 7 — Security, Testing & Production Launch
> Goal: Secure, tested, production-grade, GDPR compliant

### Security Hardening
- [ ] Content Security Policy headers (all routes)
- [ ] `X-Content-Type-Options: nosniff` header
- [ ] `X-Frame-Options: DENY` header
- [ ] HSTS header (production only)
- [ ] Prompt injection filter (strip jailbreak patterns before LLM)
- [ ] File upload virus scanning (ClamAV or similar)
- [ ] API keys encrypted at rest in database (AES-256, via cryptography lib)
- [ ] Stripe webhook signature verification on every event
- [ ] ElevenLabs webhook verification
- [ ] Refresh token rotation on every use
- [ ] Brute force protection on login (Redis-backed attempt counter)
- [ ] IP-based abuse detection (flag > 500 requests/hour from same IP)
- [ ] SQL injection protection (SQLAlchemy parameterised queries only)
- [ ] XSS protection (sanitise all user-generated content before render)
- [ ] OWASP Top 10 checklist review

### GDPR Compliance
- [ ] Cookie consent banner (frontend)
- [ ] Privacy policy page
- [ ] Terms of service page
- [ ] Data retention policy (90 days logs, 7 years financial)
- [ ] `POST /api/user/export` — export all user data as JSON
- [ ] `DELETE /api/user/delete` — full account + data deletion
- [ ] Unsubscribe from emails endpoint
- [ ] GDPR consent checkbox on widget sign-up
- [ ] Location data consent for wallet passes

### Unit Tests (Pytest)
- [ ] Auth service (register, login, token refresh, role check)
- [ ] LLM service (provider routing, fallback, token counting)
- [ ] RAG service (chunk retrieval, context injection)
- [ ] Stripe service (plan logic, webhook handling)
- [ ] Usage metering (cap enforcement, cost calculation)
- [ ] Voice service (TTS/STT request handling)
- [ ] File processing (PDF, DOCX, URL parsing)
- [ ] Widget token signing and verification
- [ ] All Pydantic schemas (validation edge cases)

### Integration Tests (Pytest + httpx)
- [ ] All auth endpoints (register → login → refresh → logout)
- [ ] Chat endpoint (message → stream → token log)
- [ ] Knowledge base endpoints (upload → process → search)
- [ ] Billing endpoints (checkout → webhook → role update)
- [ ] Usage endpoints (log → aggregate → cap enforce)
- [ ] Widget endpoints (config fetch → chat → domain check)

### E2E Tests (Playwright)
- [ ] Full user journey: register → subscribe → create chatbot → chat
- [ ] Knowledge base: upload PDF → ask question → get grounded answer
- [ ] Voice: enable TTS → send message → audio plays
- [ ] Widget: generate snippet → embed on test page → chat works
- [ ] Billing: free tier limit hit → upgrade modal → subscribe → premium unlocked
- [ ] Creator dashboard: view analytics → export CSV → delete user data

### Performance
- [ ] All list endpoints paginated (default 20/page)
- [ ] Chatbot configs cached at edge (CDN, 60s TTL)
- [ ] Database indexes: `user_id`, `chatbot_id`, `created_at` on all major tables
- [ ] pgvector index on embeddings (IVFFlat)
- [ ] Background queue for all heavy tasks (embeddings, emails, analytics)
- [ ] Database connection pooling (asyncpg pool, min=5 max=20)
- [ ] Load test: 100 concurrent streaming chat sessions

### Production Deploy
- [ ] `.env.production` all secrets verified
- [ ] Database backup strategy (daily snapshots, 30-day retention)
- [ ] Database migration runbook (zero-downtime via Alembic)
- [ ] Railway deployment config for FastAPI
- [ ] Vercel deployment config for Next.js
- [ ] Custom domain + SSL for both frontend and backend
- [ ] Uptime monitoring (Better Uptime or similar)
- [ ] On-call alerting (PagerDuty or Sentry alerts)
- [ ] Rollback procedure documented
- [ ] Postmortem template in repo

---

## 🔑 Third-Party Credentials Checklist

| Service | Key / Secret | Used In |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | LLM chat |
| OpenAI | `OPENAI_API_KEY` | GPT-4, embeddings |
| Google AI | `GOOGLE_AI_API_KEY` | Gemini models |
| ElevenLabs | `ELEVENLABS_API_KEY` | TTS / STT |
| Stripe | `STRIPE_SECRET_KEY` | Billing |
| Stripe | `STRIPE_PUBLISHABLE_KEY` | Frontend checkout |
| Stripe | `STRIPE_WEBHOOK_SECRET` | Webhook verification |
| Supabase | `SUPABASE_URL` + `SUPABASE_KEY` | DB + storage |
| Redis | `REDIS_URL` | Cache + queue |
| Resend | `RESEND_API_KEY` | Emails |
| Sentry | `SENTRY_DSN` | Error tracking |
| Axiom | `AXIOM_TOKEN` | Logging |
| PostHog | `POSTHOG_API_KEY` | Analytics |
| AWS S3 | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | File storage (alt) |

---

## 📁 Project Structure

```
project/
│
├── frontend/                        # Next.js 14 app
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (auth)/register/
│   │   ├── dashboard/
│   │   ├── pricing/
│   │   ├── billing/
│   │   └── api/auth/
│   ├── components/
│   │   ├── chat/
│   │   ├── dashboard/
│   │   ├── billing/
│   │   ├── branding/
│   │   ├── knowledge/
│   │   └── ui/
│   ├── lib/
│   ├── store/                       # Zustand state
│   └── package.json
│
├── backend/                         # FastAPI Python app
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── chat.py
│   │   │   ├── billing.py
│   │   │   ├── knowledge.py
│   │   │   ├── voice.py
│   │   │   ├── widget.py
│   │   │   ├── usage.py
│   │   │   └── analytics.py
│   │   ├── services/
│   │   │   ├── llm_service.py
│   │   │   ├── rag_service.py
│   │   │   ├── stripe_service.py
│   │   │   ├── voice_service.py
│   │   │   └── embedding_service.py
│   │   ├── models/                  # SQLAlchemy models
│   │   ├── schemas/                 # Pydantic schemas
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── dependencies.py
│   │   └── workers/                 # Celery tasks
│   │       ├── embedding_worker.py
│   │       └── email_worker.py
│   ├── alembic/                     # DB migrations
│   ├── tests/                       # Pytest tests
│   ├── requirements.txt
│   └── Dockerfile
│
├── widget/                          # Embeddable widget
│   └── widget.js
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

*Generated for UK business SaaS platform — 308 tasks across 7 phases*
