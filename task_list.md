# ChatCraft AI — Master Task List
> Generated from API Reference + Full Platform Documentation (2026-05-13)
> Modelled on Jafear.com feature scope. Mark tasks [x] as completed.
> **Reordered by priority 2026-05-19** — completed phases kept in place; incomplete phases ranked by business impact.

---

## Phase 1 — Foundation & DevOps ✅
> Goal: Working repo, local dev, CI/CD pipeline live

### Repo & Structure
- [x] Monorepo setup (`/frontend`, `/backend`, `/shared`)
- [x] `.env.example` with all required keys documented
- [x] `README.md` with full local setup instructions
- [x] `.gitignore` for Python, Node, secrets

### Docker
- [x] `Dockerfile` for FastAPI backend
- [x] `Dockerfile` for Next.js frontend
- [x] `docker-compose.yml` (app + postgres + redis + celery worker + celery beat)
- [x] Health check endpoints on all services (`/health/live`, `/health/ready`)
- [x] Volume mounts for local development hot reload

### Database
- [x] PostgreSQL + pgvector setup
- [x] SQLAlchemy 2.0 async engine configured
- [x] Alembic migration system initialised
- [x] pgvector extension enabled
- [x] Base model class with `id`, `created_at`, `updated_at`
- [x] Initial migrations: users, subscriptions, payments, chat tables, KB tables, branding/voice/widget, usage/analytics

### Redis & Celery
- [x] Redis connection configured
- [x] Celery app configured with Redis broker
- [x] Celery beat scheduler for cron jobs
- [x] Background task workers running

### CI/CD
- [x] GitHub Actions: lint + test on every PR
- [x] GitHub Actions: auto deploy backend to Railway on merge to main
- [x] GitHub Actions: auto deploy frontend to Vercel on merge to main
- [ ] Environment secrets configured in GitHub + Vercel + Railway
- [ ] Staging environment separate from production

### Logging & Monitoring
- [x] Sentry SDK installed on both frontend and backend
- [ ] Axiom log shipping from FastAPI (structured JSON)
- [x] Structured JSON logging format (Loguru)
- [ ] Error alerting to Slack on critical errors

---

## Phase 2 — Auth & Billing ✅
> Goal: Users can register, log in, subscribe, and be gated by plan

### Database Tables
- [x] `users` table (id, email, password_hash, role, stripe_customer_id, trial_ends_at, email_verified)
- [x] `subscriptions` table (id, user_id, stripe_subscription_id, plan, status, current_period_end)
- [x] `payments` table (id, user_id, stripe_payment_intent_id, amount, currency, status)

### Authentication — Backend (FastAPI)
- [x] `POST /api/auth/register` — email + password registration with email verification
- [x] `POST /api/auth/login` — returns access + refresh token
- [x] `POST /api/auth/refresh` — rotate refresh token
- [x] `POST /api/auth/logout` — revoke refresh token
- [x] `GET /api/auth/me` — return current user profile
- [x] `PUT /api/auth/me` — update name
- [x] `POST /api/auth/change-password`
- [x] `POST /api/auth/google/sync` — Google OAuth backend sync
- [x] `GET /api/auth/verify-email` — email verification endpoint
- [x] `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`
- [x] Password hashing with bcrypt (direct library, not passlib)
- [x] JWT access tokens (15 min expiry)
- [x] Refresh tokens (7 day expiry, stored in httpOnly cookie + Redis)
- [x] Role-based middleware: `free`, `trial`, `premium`, `creator`, `admin`
- [x] Rate limiting middleware (slowapi): per role tier (30/60/200/300/10000 rpm)
- [x] `seed_admin.py` interactive admin creation script

### Authentication — Frontend (Next.js)
- [x] NextAuth.js v5 configured (Credentials + Google provider)
- [x] Login page (`/login`)
- [x] Register page (`/register`)
- [x] Google OAuth button
- [x] Email verification page (`/auth/verify-email`)
- [x] Password reset page (`/auth/reset-password`) + forgot password (`/forgot-password`)
- [x] Protected route middleware (redirect unauthenticated users)
- [x] Session state in Zustand (`SessionSync` component bridges NextAuth → store)
- [x] NextAuth type declarations (`types/next-auth.d.ts`)
- [x] JWT auto-refresh (14 min expiry buffer in `auth.ts`)

### Stripe Billing — Backend
- [x] Stripe SDK configured
- [x] `POST /api/billing/checkout` — create Stripe Checkout session
- [x] `GET /api/billing/portal` — Stripe customer portal link
- [x] `POST /api/billing/webhook` — handle all Stripe events
- [x] Webhook: `customer.subscription.created` → set role to premium
- [x] Webhook: `customer.subscription.updated` → update plan
- [x] Webhook: `customer.subscription.deleted` → downgrade to free
- [x] Webhook: `invoice.payment_succeeded` → log payment
- [x] Webhook: `invoice.payment_failed` → grace period + email
- [x] Stripe webhook signature verification
- [x] `POST /api/billing/payment-intent` — one-time payment
- [x] `POST /api/billing/connect` — Stripe Connect onboarding for creator payouts
- [x] Failed payment grace period logic (3 days before downgrade)

### Billing — Frontend
- [x] Pricing page (`/pricing`) with plan comparison table
- [x] Stripe Checkout redirect on plan selection
- [x] Success page after payment (`/billing/success`)
- [x] Billing management page (`/billing`) using Stripe portal
- [x] Free trial countdown banner (`TrialBanner` component)
- [x] Upgrade prompt modal (`UpgradeModal` — triggered at usage limits)
- [x] Soft paywall overlay component (`SoftPaywall`)
- [x] Hard paywall modal (`HardPaywallModal` — message cap reached)

---

## Phase 3 — Core Chat & Multi-Model ✅
> Goal: Working AI chat with streaming, model switching, and full chat history

### Database Tables
- [x] `chatbot_configs` table (id, user_id, name, default_model, allow_model_switch, fallback_model, system_prompt, published)
- [x] `conversations` table (id, chatbot_id, user_id, guest_id, title, created_at)
- [x] `messages` table (id, conversation_id, role, content, model, input_tokens, output_tokens, cost_usd, feedback)

### LLM Abstraction Layer (Python)
- [x] `LLMProvider` base class with unified interface
- [x] `AnthropicProvider` — Claude Sonnet/Opus/Haiku integration
- [x] `OpenAIProvider` — GPT-4o + GPT-4o mini integration
- [x] `GeminiProvider` — Gemini 1.5 Pro / Flash / 2.0 Flash integration
- [x] `LLMRouter` with fallback on failure
- [x] Streaming response support for all providers (async generator)
- [x] Automatic fallback to secondary model on failure
- [x] Token counting per request (input + output)
- [x] Cost calculation per model (`costs.py` with rates table)
- [x] Prompt injection sanitisation (`sanitizer.py`)
- [x] System prompt builder (injects branding + KB context)

### Chat API — Backend
- [x] `POST /api/chat/{chatbot_id}` — streaming chat endpoint (SSE)
- [x] `GET /api/chat/{chatbot_id}/history` — paginated conversation history
- [x] `DELETE /api/chat/conversations/{id}` — delete conversation
- [x] `GET /api/chatbots` — list user's chatbots
- [x] `POST /api/chatbots` — create chatbot
- [x] `GET /api/chatbots/{id}` — get chatbot config
- [x] `PUT /api/chatbots/{id}` — update chatbot config
- [x] `DELETE /api/chatbots/{id}` — delete chatbot
- [x] Message cap enforcement per tier
- [x] Guest chat support (no login, up to free cap)
- [x] Conversation title auto-generation after first message
- [x] Message thumbs up/down feedback endpoint

### Chat UI — Frontend
- [x] `ChatWindow` component with streaming message rendering
- [x] Token-by-token display via SSE
- [x] `MessageBubble` component (user vs assistant)
- [x] `TypingIndicator` during generation
- [x] Stop generation button
- [x] Regenerate last message button
- [x] `ModelSwitcher` dropdown (if enabled by creator)
- [x] `ConversationSidebar` (list + search)
- [x] New conversation button
- [x] Message copy button
- [x] Thumbs up/down feedback buttons
- [x] Mobile responsive chat layout

---

## Phase 4 — Knowledge Base (RAG Pipeline) ✅
> Goal: Users can upload docs and the chatbot answers from their content

### Database Tables
- [x] `knowledge_base_documents` (id, chatbot_id, name, type, file_url, status, chunk_count, token_count)
- [x] `knowledge_base_chunks` (id, document_id, chunk_index, content, embedding vector(1536), token_count)

### Document Processing — Backend (Celery Workers)
- [x] PDF text extraction (pdfplumber + PyMuPDF fallback)
- [x] DOCX extraction (python-docx)
- [x] Plain text `.txt` processing
- [x] Web URL scraping (BeautifulSoup + httpx)
- [x] Raw text paste ingestion
- [x] Text cleaning and normalisation pipeline
- [x] Chunking strategy: 500 token chunks, 50 token overlap (LangChain splitter)
- [x] Embedding generation: `text-embedding-3-small` (OpenAI)
- [x] Store embeddings in pgvector (cosine similarity index, IVFFlat)
- [x] Document status updates: `pending → processing → ready / error`
- [x] Celery task for async processing (non-blocking upload)
- [x] Retry logic on embedding failures

### RAG Query Pipeline
- [x] `RAGService` class
- [x] Embed user query at chat time
- [x] Cosine similarity search (top K=5 chunks)
- [x] Context injection into system prompt
- [x] Relevance score threshold

### Knowledge Base API — Backend
- [x] `POST /api/kb/{chatbot_id}/upload` — file upload endpoint
- [x] `GET /api/kb/{chatbot_id}/documents` — list documents
- [x] `GET /api/kb/{chatbot_id}/documents/{id}` — document detail + chunks
- [x] `DELETE /api/kb/{chatbot_id}/documents/{id}` — delete document
- [x] `POST /api/kb/{chatbot_id}/search` — test search endpoint
- [x] File size validation (max 25MB) and type validation

### Knowledge Base UI — Frontend
- [x] Upload zone (drag and drop + click to upload)
- [x] Upload progress bar
- [x] Document list with status badges
- [x] Document preview (extracted text / chunks)
- [x] Delete document button with confirm dialog
- [x] Test search box (shows retrieved chunks)
- [x] Web URL input field

---

## Phase 5 — Voice, Branding & Embeddable Widget ✅
> Goal: Voice chat works, chatbots fully branded, widget embeds anywhere

### Database Tables
- [x] Branding fields on `chatbot_configs` (logo_url, primary_colour, secondary_colour, font, welcome_message, bubble_style, dark_mode)
- [x] Voice fields on `chatbot_configs` (voice_id, tts_enabled, stt_enabled, auto_play_tts, voice_stability, voice_similarity_boost)
- [x] `widget_configs` (id, chatbot_id, allowed_domains, position, show_branding, embed_token)

### Voice — Backend (ElevenLabs)
- [x] `POST /api/voice/tts` — text to speech (streaming audio)
- [x] `POST /api/voice/stt` — speech to text
- [x] `GET /api/voice/voices` — list available ElevenLabs voices
- [x] TTS character count tracking + STT seconds tracking

### Voice — Frontend
- [x] Text-to-speech playback (`AudioPlayer` component)
- [x] Microphone button (`VoiceRecorder` component)
- [x] Browser audio recording (MediaRecorder API)
- [x] STT transcript display in chat input before sending
- [x] Voice-only full-screen mode (`VoiceMode` component)

### Branding Builder — Frontend
- [x] Branding page (`/dashboard/chatbots/{id}/branding`)
- [x] Logo upload with preview
- [x] Colour picker: primary, secondary, background
- [x] Font family selector
- [x] Welcome message input
- [x] Chat bubble style toggle
- [x] Dark mode toggle
- [x] Theme presets (Professional / Friendly / Bold / Minimal)
- [x] Live preview panel

### Embeddable Widget
- [x] `widget.js` standalone file (no framework dependency)
- [x] Floating chat bubble (configurable position)
- [x] `GET /api/widget/{chatbot_id}/config` — public config endpoint
- [x] `POST /api/widget/{chatbot_id}/chat` — widget chat endpoint
- [x] Apply branding via CSS variables injected at runtime
- [x] Domain whitelist enforcement (CORS + server-side check)
- [x] Signed widget token system (prevent hotlinking)
- [x] Widget snippet generator UI (page at `/dashboard/chatbots/{id}/widget`)
- [x] One-click copy snippet button
- [ ] Client subscription licensing system (license tokens for paid widget access)
- [ ] Iframe embed + launcher widget + voice launcher widget deploy modes
- [ ] `hideHeader` / `theme` / `primaryColor` URL parameters for widget
- [ ] Direct link widget URL (`/widgets/{id}`) — public shareable page
- [ ] PWA installation support (add to home screen)
- [ ] Web push notifications for widget users

---

## Phase 6 — Usage Metering & Creator Dashboard ✅
> Goal: Every token tracked, billing synced, creators see full analytics

### Database Tables
- [x] `usage_logs` (id, user_id, chatbot_id, conversation_id, model, input_tokens, output_tokens, tts_chars, stt_secs, embedding_tokens, cost_usd, created_at)
- [x] `analytics_daily` (id, chatbot_id, date, messages_count, users_count, avg_session_length, revenue_usd)

### Usage Metering — Backend
- [x] Log every LLM request (model, tokens, cost) to `usage_logs`
- [x] Log every TTS/STT request (characters, seconds)
- [x] Monthly usage aggregation job (Celery beat, daily)
- [x] Usage cap enforcement per tier (real-time check on each request)
- [x] Stripe metered billing sync
- [x] Cost recovery: creator markup rate applied

### Usage API — Backend
- [x] `GET /api/usage/summary` — current month usage by category
- [x] `GET /api/usage/history` — 30-day usage history
- [x] `GET /api/usage/cost` — cost breakdown by model/service

### Creator Dashboard — Frontend
- [x] Dashboard home (`/dashboard`) — overview cards (MRR, subscribers, conversations, messages)
- [x] Revenue chart (Recharts line chart, 30-day)
- [x] Daily active users chart
- [x] Messages per day chart
- [x] Model usage breakdown (pie chart)
- [x] Conversation log table (searchable, filterable) at `/dashboard/analytics`
- [x] Export conversations to CSV
- [x] GDPR delete individual user data button

### User-Facing Usage Page
- [x] Messages used this month vs cap (progress bar) at `/dashboard/usage`
- [x] Voice minutes used + storage used
- [x] Usage history chart (30 days)
- [x] Upgrade CTA when approaching cap

---

## Phase 7 — Tests, GDPR & Security ✅ (partial)
> Goal: Secure, tested, production-grade, GDPR compliant

### Unit Tests (Pytest) — partial
- [x] Auth service (`test_auth.py`)
- [x] LLM service — cost calculation, routing, complete, stream, fallback (`test_llm.py`)
- [x] Sanitizer — prompt injection filter (`test_sanitizer.py`)
- [x] All Pydantic schemas (`test_schemas.py`)
- [x] Usage metering (`test_usage.py`)
- [ ] RAG service (chunk retrieval, context injection, score threshold)
- [ ] Stripe billing service (plan logic, webhook handler, grace period)
- [ ] Voice service (TTS/STT request handling, character tracking)
- [ ] File processing (PDF, DOCX, URL parsing, chunking)

### Integration Tests (Pytest + httpx) — partial
- [x] All auth endpoints (`test_auth_integration.py`)
- [x] Chatbot CRUD endpoints (`test_chatbots_integration.py`)
- [x] Widget endpoints (`test_widget_integration.py`)
- [ ] Chat endpoint (message → stream → token log)
- [ ] Knowledge base endpoints (upload → process → search)
- [ ] Billing endpoints (checkout → webhook → role update)

### E2E Tests (Playwright) — partial
- [x] Auth flows: register → login → logout (`e2e/auth.spec.ts`)
- [x] Dashboard navigation (`e2e/dashboard.spec.ts`)
- [x] Chat: create chatbot → send message → receive stream (`e2e/chat.spec.ts`)
- [ ] Knowledge base: upload PDF → ask question → grounded answer
- [ ] Billing: free tier limit → upgrade modal → subscribe → premium unlocked
- [ ] Widget: generate snippet → embed on test page → chat works

### GDPR Compliance
- [x] Cookie consent banner (`CookieConsent` component)
- [x] Privacy policy page (`/privacy`)
- [x] Terms of service page (`/terms`)
- [x] `GET /api/gdpr/export` — export all user data as JSON
- [x] `DELETE /api/gdpr/delete` — full account + data deletion
- [x] `POST /api/gdpr/unsubscribe` — unsubscribe from emails

### Security Hardening
- [x] Content Security Policy headers
- [x] `X-Content-Type-Options`, `X-Frame-Options`, HSTS headers (`security_headers.py`)
- [x] Prompt injection filter (sanitizer.py) in LLM pipeline
- [x] Stripe webhook signature verification
- [x] Refresh token rotation on every use
- [x] Rate limiting per role (slowapi)
- [x] IP-based abuse detection (`ip_abuse.py`)
- [x] SQLAlchemy parameterised queries only
- [ ] File upload virus scanning (ClamAV or equivalent)
- [ ] API keys encrypted at rest (AES-256 via cryptography lib)
- [ ] Brute force protection on login (Redis-backed attempt counter)

---

## Phase 8 — CRM: Contacts, Tags, Custom Fields & Pipelines ✅
> Goal: Full CRM with contacts, segmentation, and deal tracking

### Database Tables
- [x] `contacts` table (id, user_id, public_id, contact_id, first_name, last_name, email, phone, company, source, created_at)
- [x] `tags` table (id, user_id, name, color)
- [x] `contact_tags` junction table (contact_id, tag_id)
- [x] `custom_fields` table (id, user_id, chatbot_id nullable, name, field_key, field_type, options, is_required, default_value, scope)
- [x] `contact_field_values` table (id, contact_id, field_id, value)
- [x] `pipelines` table (id, user_id, name, description, color, chatbot_id nullable, is_active)
- [x] `pipeline_stages` table (id, pipeline_id, name, color, order)
- [x] `pipeline_deals` table (id, pipeline_id, stage_id, contact_id, notes, deal_value, order)

### Contacts API — Backend
- [x] `GET /api/v1/contacts` — list all contacts (with pagination)
- [x] `POST /api/v1/contacts` — create contact
- [x] `GET /api/v1/contacts/search` — search by email, phone, name, or q
- [x] `GET /api/v1/contacts/{id}` — get contact (numeric ID or publicId or contactId)
- [x] `PATCH /api/v1/contacts/{id}` — update contact
- [x] `DELETE /api/v1/contacts/{id}` — delete contact
- [ ] `POST /api/v1/contacts/{id}/messages` — send message to contact (finds/creates conversation)
- [x] `POST /api/v1/contacts/{id}/tags` — add tags to contact
- [x] `DELETE /api/v1/contacts/{id}/tags/{tagId}` — remove tag from contact
- [x] `GET /api/v1/contacts/{id}/fields` — get contact custom field values
- [x] `PUT /api/v1/contacts/{id}/fields` — update contact custom field values

### Tags API — Backend
- [x] `GET /api/v1/tags` — list all tags
- [x] `POST /api/v1/tags` — create tag
- [x] `PATCH /api/v1/tags/{id}` — update tag
- [x] `DELETE /api/v1/tags/{id}` — delete tag

### Custom Fields API — Backend
- [x] `GET /api/v1/custom-fields` — list all custom field definitions
- [x] `POST /api/v1/custom-fields` — create custom field (text, number, date, email, phone, url, textarea, select, checkbox)
- [x] `PATCH /api/v1/custom-fields/{id}` — update custom field
- [x] `DELETE /api/v1/custom-fields/{id}` — delete custom field + all values

### Pipelines API — Backend
- [x] `GET /api/v1/pipelines` — list pipelines
- [x] `POST /api/v1/pipelines` — create pipeline (with optional default stages)
- [x] `GET /api/v1/pipelines/{id}` — pipeline detail with stages
- [x] `PATCH /api/v1/pipelines/{id}` — update pipeline
- [x] `DELETE /api/v1/pipelines/{id}` — soft-delete pipeline
- [x] `GET /api/v1/pipelines/{id}/stages` — list stages
- [x] `GET /api/v1/pipelines/{id}/deals` — list deals (filterable by stageId)
- [x] `POST /api/v1/pipelines/{id}/deals` — add contact as deal
- [x] `PATCH /api/v1/pipelines/{id}/deals/{dealId}` — move stage / update notes / deal value
- [x] `DELETE /api/v1/pipelines/{id}/deals/{dealId}` — remove deal from pipeline

### CRM — Frontend
- [x] Contacts list page (`/dashboard/contacts`) — searchable table with pagination
- [x] Contact detail page (`/dashboard/contacts/{id}`) — profile + custom fields + tags + conversation history
- [x] Create/edit contact modal with all fields
- [x] Bulk import contacts from CSV
- [x] Bulk export contacts to CSV
- [x] Tags management page (`/dashboard/tags`)
- [x] Custom Fields settings page (`/dashboard/settings/fields`)
- [x] Pipelines Kanban board (`/dashboard/pipelines`)
- [x] Drag-and-drop contacts between pipeline stages
- [x] Create/edit pipeline and stages modal
- [x] Deal card with time-in-stage indicator

---

## Phase 9 — Unified Inbox ✅ (partial)
> Goal: All channel conversations in one place

### Database Tables
- [x] Extend `conversations` table with `channel` field and `status` (active/closed/human_takeover)
- [x] `inbox_assignments` table (id, conversation_id, assigned_to_user_id, assigned_at)
- [x] `team_members` table (id, owner_user_id, member_email, role, status)
- [x] `internal_notes` table (id, conversation_id, author_id, content)

### Inbox API — Backend
- [x] `GET /api/v1/conversations` — list all conversations (filter by widget, contact, status)
- [x] `GET /api/v1/conversations/search` — search by contact email/phone/name
- [x] `GET /api/v1/conversations/{id}` — get conversation with contact details
- [x] `POST /api/v1/conversations/{id}/close` — close conversation
- [x] `POST /api/v1/conversations/{id}/reopen` — reopen conversation (+ optional release human takeover)
- [x] `POST /api/v1/conversations/{id}/takeover` — human agent takeover
- [x] `GET /api/v1/conversations/{id}/messages` — get all messages
- [x] `POST /api/v1/conversations/{id}/messages` — send message as assistant or system
- [x] `GET /api/v1/conversations/{id}/notes` — list internal notes
- [x] `POST /api/v1/conversations/{id}/notes` — add internal note
- [x] `POST /api/v1/conversations/{id}/assign` — assign to team member
- [x] `GET /api/v1/team` — list team members
- [x] `POST /api/v1/team` — invite team member
- [x] `DELETE /api/v1/team/{id}` — remove team member

### Inbox UI — Frontend
- [x] Unified Inbox page (`/dashboard/inbox`) — all channel conversations
- [x] Conversation list with contact avatar, last message, channel badge, timestamp
- [x] Message thread view (right panel)
- [x] Human takeover / release AI toggle
- [x] Close / reopen conversation buttons
- [x] Assign conversation to team member
- [x] Internal notes (not sent to customer)
- [x] Real-time updates via polling (5s interval, new messages from all channels)
- [x] Unread message count badges
- [ ] Round-robin assignment
- [ ] Contact quick-edit panel in inbox sidebar

---
---

# ━━━ INCOMPLETE PHASES — RANKED BY PRIORITY ━━━

---

## 🥇 P1 — Core Product (build these first — they define the platform)

---

## Phase 11 — Flow Builder (Visual Conversation Automation)
> Goal: Visual drag-and-drop conversation flow builder

### Database Tables
- [x] `flows` table (id, user_id, chatbot_id, name, slug, description, is_active, webhook_enabled, webhook_secret, nodes JSON, edges JSON)
- [x] `flow_runs` table (id, flow_id, contact_id, status, started_at, completed_at, duration_ms)
- [x] `flow_variables` table (id, flow_run_id, key, value)

### Flow API — Backend
- [x] `GET /api/v1/flows` — list all flows
- [x] `POST /api/v1/flows` — create flow
- [x] `GET /api/v1/flows/list` — simplified list for integrations (id, name, slug)
- [x] `GET /api/v1/flows/{id}` — get flow detail (nodes + edges)
- [x] `PATCH /api/v1/flows/{id}` — update flow
- [x] `DELETE /api/v1/flows/{id}` — delete flow
- [x] `POST /api/v1/flows/{id}/toggle` — enable/disable flow
- [x] `GET /api/v1/flows/{id}/webhook` — get webhook config
- [x] `POST /api/v1/flows/{id}/webhook` — configure webhook (enable/disable, regenerate secret)
- [x] `POST /api/v1/flows/{id}/trigger` — manually trigger flow for a contact
- [x] `POST /api/webhooks/flow/{flowId}/{webhookSecret}` — external webhook trigger
- [x] Flow execution engine (Celery task) — process nodes sequentially
- [x] Template variable resolution (`{{first_name}}`, `{{webhook_data.field}}`, custom fields)

### Flow Node Types — Backend Execution
- [x] **Start node** — entry point
- [x] **Send Message node** — text, image, video, file, carousel, card, quick replies, buttons, audio, GIF, typing indicator
- [x] **User Input node** — 15 input types (text, email, phone, number, yes/no, date, time, datetime, month, monthday, select, multiselect, file, image, JSON), save to custom field
- [x] **Condition node** — field check, has tag, channel, time-based (business hours, day-of-week, date range, relative time), Instagram status
- [x] **AI Response node** — generate dynamic response using any LLM
- [ ] **AI Tasks node** — multi-task checklist driven by AI with follow-up nudges and completion branching
- [x] **Delay node** — wait seconds/minutes/hours/days
- [x] **HTTP Request node** — GET/POST/PUT/DELETE to external APIs with response mapping
- [x] **Randomizer node** — A/B split traffic between multiple paths
- [ ] **AI Web node** — Search mode (web search), Fetch mode (URL content), Browse mode (cloud browser)
- [x] **Jump To node** — navigate to another flow or step within current flow
- [x] **End node** — terminate flow
- [x] **Notes node** — documentation only, no execution
- [x] **Action nodes** (executed silently):
  - [ ] AI Generate (text, image, audio with any provider)
  - [ ] AI Web Search
  - [x] Set Custom Field (set/append/prepend/increment/decrement/math/date ops)
  - [ ] Clear Custom Field
  - [ ] Extract Data (AI-powered data extraction from conversation)
  - [ ] Execute JavaScript (sandboxed, no network)
  - [ ] Delete Contact
  - [ ] Clear Chat History
  - [ ] Opt-Out / Opt-In Contact
  - [ ] Block / Unblock Contact
  - [x] Add Tag / Remove Tag
  - [ ] Assign to Sequence / Unassign from Sequence
  - [x] Assign Conversation / Assign Round-Robin / Unassign
  - [x] Go to Flow / Go to Step
  - [ ] Add to Pipeline / Move Pipeline Stage / Remove from Pipeline / Update Deal Value
  - [x] Pause Conversation / Resume Conversation
  - [ ] Cancel Pending Flow
  - [ ] Send SMS (Twilio)
  - [ ] Send Email (AWS SES/SMTP)
  - [ ] Send Push Notification
  - [ ] Outbound Call (OpenAI Realtime / xAI / ElevenLabs)
  - [ ] Transfer Call / End Call
  - [ ] Send Team Notification / Internal Note
  - [x] Send Webhook (HTTP POST to external URL)
  - [ ] Google Sheets (send/get/update/search rows)
  - [ ] Google Docs (create/update)
  - [ ] WhatsApp Template message
  - [ ] Set/Delete Persistent Menu (Messenger/Instagram)
  - [ ] Set/Delete Telegram Commands
  - [ ] Discord actions (send message, embed, add/remove role)
  - [ ] Social Post (Facebook, Instagram, X)
  - [ ] Web Fetch (Claude — fetch and extract URL content)
  - [ ] Wallet: add/remove punch, add/remove points, redeem, send push
  - [ ] Comment on Post (Instagram)

### Flow Builder UI — Frontend
- [x] Flow Builder page (`/dashboard/flows/{id}/edit`) with ReactFlow canvas
- [x] Drag-and-drop node palette (left panel)
- [x] Node configuration panel (right panel, opens on click)
- [x] Canvas navigation (zoom, pan, minimap, fit-view)
- [x] Copy/paste nodes
- [ ] Flag icon to set starting node
- [ ] AI Flow Builder — generate full flow from natural language description
- [ ] Smart variable autocomplete (press `{` for dropdown of available vars)
- [ ] Channel routing selector per Send Message node (omni/Messenger/WhatsApp/SMS/etc.)
- [ ] Built-in flow simulator / test run
- [x] Webhook toggle + URL display in toolbar
- [x] Flow list page (`/dashboard/flows`)
- [ ] Folder organisation for flows
- [x] Duplicate flow button
- [x] Flow run history table (with duration, contact, status)

---

## Phase 12 — Automation Engine
> Goal: Event-driven automations, drip sequences, keyword triggers

### Database Tables
- [x] `automations` table (id, user_id, name, description, trigger_type, trigger_config JSON, action_type, action_config JSON, enabled, execution_count, last_executed_at)
- [x] `sequences` table (id, user_id, chatbot_id, name, description, auto_enroll, reply_behavior, steps JSON)
- [x] `sequence_enrollments` table (id, sequence_id, contact_id, status, current_step, enrolled_at, completed_at)
- [x] `keywords` table (id, user_id, chatbot_id, keywords array, response_type, response_text, flow_id, is_active)

### Automations API — Backend
- [x] `GET /api/v1/automations` — list all automations
- [x] `GET /api/v1/automations/{id}` — get automation detail (trigger + action config)
- [x] `POST /api/v1/automations/{id}/toggle` — enable/disable automation
- [x] Automation trigger types: new contact, contact tag added, contact field updated, conversation opened, conversation closed, pipeline stage changed, payment received, form submitted
- [x] Automation action types: trigger flow, send message, add tag, set custom field, add to pipeline, send webhook

### AI Sequences API — Backend
- [x] `GET /api/v1/sequences` — list sequences
- [x] `POST /api/v1/sequences` — create sequence with steps
- [x] `GET /api/v1/sequences/{id}` — get sequence detail
- [x] `PATCH /api/v1/sequences/{id}` — update sequence
- [x] `DELETE /api/v1/sequences/{id}` — delete sequence
- [x] `POST /api/v1/sequences/{id}/enroll` — enroll contact in sequence
- [x] `POST /api/v1/sequences/{id}/unenroll` — remove contact from sequence
- [x] Sequence step types: delay (seconds/minutes/hours/days), inactivity trigger, date field trigger
- [x] Auto-channel selection (chooses best available channel per contact)
- [ ] Meta 24-hour window detection (stops follow-ups before window closes)
- [x] Reply behaviour: stop / pause / continue sequence on reply

### Keywords API — Backend
- [x] `GET /api/v1/keywords` — list keyword rules (filterable by chatbot_id)
- [x] `POST /api/v1/keywords` — create keyword rule
- [x] `GET /api/v1/keywords/{id}` — get keyword rule
- [x] `PATCH /api/v1/keywords/{id}` — update keyword rule
- [x] `DELETE /api/v1/keywords/{id}` — delete keyword rule
- [x] Keyword matching engine (runs on every incoming message before AI)
- [x] Keyword rule scoped to specific widget or global

### Automation UI — Frontend
- [x] Automations list page (`/dashboard/automations`)
- [x] Create/edit automation modal (trigger type + conditions + action)
- [ ] Execution history table per automation
- [x] AI Sequences page (`/dashboard/sequences`)
- [x] Sequence editor (steps, delays, conditions, reply behaviour)
- [ ] Sequence enrollment stats (active, completed, cancelled)
- [x] Keywords page (`/dashboard/keywords`)
- [x] Create/edit keyword rule (keywords array, response type, text or flow)

---

## 🥈 P2 — High Revenue Impact (channels + lead gen + engagement)

---

## Phase 10 — Multi-Channel Messaging
> Goal: 11 communication channels all routed to unified inbox

### Web Chat Extensions
- [ ] `hideHeader` / `theme` / `primaryColor` URL parameters for widget
- [ ] Launcher chat bubble (`type: 'launcher'`) with position config
- [ ] Voice launcher widget (`type: 'voice_launcher'`) with icon options
- [ ] PWA installation prompt + service worker
- [ ] Web push notification subscription (VAPID keys)
- [ ] Push notification backend (`/api/push/subscribe` + `/api/push/send`)
- [ ] Persistent menu configuration (links/phone/flow triggers)
- [ ] Typing indicator shown during AI reply delay
- [ ] AI reply delay setting (0-30 seconds, fixed or random)

### Facebook Messenger
- [x] Facebook Page OAuth integration (`/api/integrations/facebook/connect`)
- [x] Webhook handler for Facebook messages (`POST /api/webhooks/facebook`)
- [x] Send messages via Messenger Graph API
- [ ] 24-hour messaging window enforcement
- [ ] Rich media (buttons, quick replies, carousels) for Messenger
- [x] Messenger channel in inbox
- [ ] Set/delete persistent menu via Messenger Profile API

### Instagram DM
- [x] Instagram DM webhook handler (`POST /api/webhooks/instagram`)
- [x] Send DM replies via Instagram Graph API
- [ ] Story mention automation
- [ ] Comment automation: auto-reply to post comments (public reply + DM)
- [x] Instagram channel in inbox

### WhatsApp Business API
- [x] WhatsApp webhook handler (`POST /api/webhooks/whatsapp`)
- [x] Send messages via WhatsApp Cloud API
- [ ] WhatsApp Template message management (sync from Meta)
- [ ] 24-hour session window + template fallback
- [ ] Rich media (interactive buttons, lists) for WhatsApp
- [x] WhatsApp channel in inbox

### Telegram
- [x] Telegram bot token configuration per chatbot
- [x] Telegram webhook handler (`POST /api/webhooks/telegram/{token}`)
- [x] Send messages via Telegram Bot API
- [ ] Telegram Bot Commands setup (`/start`, custom `/commands` triggering flows)
- [ ] Rich media (inline keyboards, reply keyboards) for Telegram
- [x] Telegram channel in inbox

### Discord
- [ ] Discord bot token configuration
- [ ] Discord bot message handler
- [ ] Send messages, embeds, add/remove roles via Discord API
- [ ] Discord channel in inbox

### SMS (Twilio)
- [x] Twilio phone number management (`/api/integrations/twilio/connect`)
- [x] Twilio SMS webhook handler (`POST /api/webhooks/twilio/sms`)
- [x] Send SMS via Twilio API
- [ ] MMS image support
- [x] SMS channel in inbox

### Phone Calls (Twilio + Voice AI)
- [ ] Inbound call webhook handler (`POST /api/webhooks/twilio/voice`)
- [ ] OpenAI Realtime API integration for voice calls (WebRTC/WebSocket)
- [ ] ElevenLabs outbound call trigger
- [ ] DTMF transfer destinations (press 1 for sales, press 2 for support)
- [ ] Missed-call AI takeover + SMS fallback configuration
- [ ] Post-call transcript saved to conversation
- [ ] AI-generated call summary saved to contact
- [ ] Phone channel in inbox

### X (Twitter)
- [ ] Twitter/X OAuth integration
- [ ] @Mention webhook monitor
- [ ] Auto-reply to mentions using AI agent
- [ ] X channel in inbox (mentions + replies)

### TikTok DM
- [ ] TikTok Business API integration
- [ ] TikTok DM webhook handler
- [ ] TikTok channel in inbox

### Email (Inbox)
- [ ] AWS SES or SMTP configuration per account/agent
- [ ] Compose email from inbox (to, subject, CC/BCC, attachments)
- [ ] AI email body generator (based on conversation context)
- [ ] Attachment support (up to 5 files, 25MB total)
- [ ] Email channel in inbox

---

## Phase 13 — Forms & Landing Pages
> Goal: Collect leads via forms, publish branded landing pages

### Database Tables
- [x] `forms` table (id, user_id, chatbot_id, name, description, fields JSON, is_active, success_message, submit_button_text, public_id)
- [x] `form_submissions` table (id, form_id, contact_id, data JSON, submitted_at)
- [x] `landing_pages` table (id, user_id, chatbot_id, title, name, slug, short_id, description, html_content, theme, primary_color, is_published, seo_meta JSON)

### Forms API — Backend
- [x] `GET /api/v1/forms` — list all forms
- [x] `POST /api/v1/forms` — create form with field definitions
- [x] `GET /api/v1/forms/{id}` — get form detail
- [x] `PATCH /api/v1/forms/{id}` — update form
- [x] `DELETE /api/v1/forms/{id}` — delete form + submissions
- [x] `GET /api/v1/forms/{id}/submissions` — list submissions (with pagination)
- [x] `POST /api/public/forms/{publicId}/submit` — public form submission (creates/updates contact)
- [x] Form field types: text, email, phone, number, select, multiselect, checkbox, textarea, date, file, signature

### Landing Pages API — Backend
- [x] `GET /api/v1/landing-pages` — list landing pages (paginated)
- [x] `POST /api/v1/landing-pages` — create landing page
- [x] `GET /api/v1/landing-pages/{id}` — get by numeric ID, shortId, or slug
- [x] `PATCH /api/v1/landing-pages/{id}` — update landing page
- [x] `DELETE /api/v1/landing-pages/{id}` — delete landing page
- [x] `POST /api/v1/landing-pages/{id}/publish` — toggle published status
- [x] `GET /p/{slug}` — public page render (no auth required)
- [x] URL parameter pre-fill: `?email=`, `?phone=`, `?first_name=`, `?scf=` (custom fields), `?agent=`, `?ref=`
- [ ] Attribution tracking (first-touch, last-touch, journey history)
- [ ] QR code generation per landing page with scan counter
- [ ] Dark mode and `?primaryColor=` URL parameters

### Forms & Landing Pages UI — Frontend
- [x] Forms list page (`/dashboard/forms`)
- [x] Form builder editor (drag-and-drop field builder)
- [x] Form embed code generator + direct link
- [x] Form submissions table (filterable, exportable to CSV)
- [x] Landing Pages list page (`/dashboard/landing-pages`)
- [x] Landing page editor (Code mode + Preview mode + AI generation)
- [x] AI content generation for landing page sections
- [x] SEO settings panel (title, description, OG tags, canonical, robots)
- [ ] QR code generator (PNG/SVG download, custom colors)
- [ ] Social sharing preview
- [x] Published page (`/p/{slug}`) — public URL with embedded widget option

---

## Phase 16 — Broadcast Hub & Social Tools
> Goal: Mass messaging across channels + social media management

### Database Tables
- [x] `broadcast_campaigns` table (id, user_id, name, channel, status, message_template, target_filter JSON, scheduled_at, sent_count, failed_count)
- [x] `social_accounts` table (id, user_id, platform, account_id, access_token, name, avatar_url)
- [x] `social_posts` table (id, user_id, account_ids, content, image_url, status, scheduled_at, published_at)
- [x] `comment_automations` table (id, user_id, page_id, enabled, ai_prompt, response_type, keyword_triggers array, delay_seconds)

### Broadcast Hub API — Backend
- [x] `GET /api/v1/broadcasts` — list campaigns
- [x] `POST /api/v1/broadcasts` — create broadcast (email/SMS/Telegram/push/WhatsApp/Messenger/phone)
- [x] `POST /api/v1/broadcasts/{id}/send` — send or schedule broadcast
- [x] `GET /api/v1/broadcasts/{id}/stats` — delivery + engagement analytics
- [x] Email broadcast: AWS SES bulk send, open/click tracking, HTML template
- [x] SMS broadcast: Twilio bulk SMS with personalization variables
- [x] Telegram broadcast: bulk message to all Telegram subscribers
- [ ] Push broadcast: VAPID bulk push to PWA subscribers
- [x] WhatsApp broadcast: Meta-approved template messages (24h compliance)
- [ ] Messenger broadcast: Facebook marketing messages
- [ ] Phone broadcast: ElevenLabs outbound call campaigns

### Social Poster API — Backend
- [x] `GET /api/v1/social/accounts` — list connected social accounts
- [x] `POST /api/v1/social/accounts/connect` — connect Facebook/Instagram/X
- [x] `GET /api/v1/social/posts` — post history
- [x] `POST /api/v1/social/posts` — create and publish/schedule post
- [x] `DELETE /api/v1/social/posts/{id}` — delete post
- [x] Facebook Page post via Graph API
- [x] Instagram post (requires image) via Graph API
- [ ] X/Twitter post via Twitter API v2 (publish-only, no scheduling)
- [x] AI caption generator using agent's LLM

### Comment Automation API — Backend
- [x] `GET /api/v1/comment-automations` — list comment automations per page
- [x] `POST /api/v1/comment-automations` — create automation
- [x] `PATCH /api/v1/comment-automations/{id}` — update configuration
- [x] `DELETE /api/v1/comment-automations/{id}` — delete
- [ ] Facebook comment webhook handler → AI public reply + DM trigger
- [ ] Instagram comment webhook handler → AI public reply

### Broadcast & Social UI — Frontend
- [x] Broadcast Hub page (`/dashboard/broadcast`) — channel selector tabs
- [ ] Email campaign composer (drag-and-drop HTML template builder)
- [ ] Audience segmentation (by agent, tags, custom fields)
- [ ] Campaign preview + test send
- [ ] Campaign schedule picker
- [ ] Delivery analytics table
- [x] Social Poster page (`/dashboard/social`)
- [x] Post composer (multi-platform select, caption, image upload)
- [x] AI caption generator button
- [x] Publish Now / Schedule toggle
- [x] Post history table with status
- [x] Comment Automation page (`/dashboard/comment-automation`)
- [x] Per-page toggle + AI prompt + keyword triggers + response type config

---

## 🥉 P3 — Monetisation (direct revenue channels)

---

## Phase 14 — Commerce Store
> Goal: Sell products via chatbot-powered storefront

### Database Tables
- [x] `commerce_stores` table (id, user_id, name, slug, description, is_active, currency, primary_color, default_view_mode, payment_provider, google_sheet_id)
- [x] `commerce_payments` table (id, store_id, user_id, contact_id, customer_name, customer_email, amount, currency, stripe_payment_intent_id, status, items JSON, metadata JSON)

### Commerce API — Backend
- [x] `GET /api/v1/stores` — list stores
- [x] `POST /api/v1/stores` — create store
- [x] `GET /api/v1/stores/{id}` — store detail
- [x] `PATCH /api/v1/stores/{id}` — update store
- [x] `DELETE /api/v1/stores/{id}` — delete store
- [x] `GET /api/v1/stores/{id}/products` — list products (from Google Sheet catalog, filter by category, maxItems)
- [x] `POST /api/v1/stores/{id}/products` — add product to catalog
- [x] `PATCH /api/v1/stores/{id}/products/{productId}` — update product (by originalName in Sheet)
- [x] `DELETE /api/v1/stores/{id}/products/{productId}` — delete product
- [x] `POST /api/v1/stores/{id}/sync` — sync products from Google Sheet
- [x] `GET /api/v1/stores/{idOrSlug}/public` — public store config (no auth)
- [x] `GET /api/v1/stores/{idOrSlug}/products/public` — public product catalog (no auth)
- [x] `POST /api/commerce/checkout/create-payment-intent` — validate cart + create Stripe PaymentIntent
- [x] `POST /api/commerce/checkout/confirm` — confirm payment + create contact + record order
- [x] `GET /api/commerce/stores/{id}/purchases` — list purchases (store owner only)
- [x] `GET /api/commerce/stores/{id}/purchases/{purchaseId}` — single purchase detail

### Commerce UI — Frontend
- [x] Stores list page (`/dashboard/stores`)
- [x] Store settings page (name, slug, currency, color, payment provider, Google Sheet connection)
- [x] Product catalog table (with category filter, add/edit/delete)
- [x] Product inventory sync from Google Sheet
- [x] Public storefront (`/store/{slug}`) — product grid/list view
- [x] Shopping cart with item management
- [x] Stripe checkout integration on storefront
- [x] Order confirmation page
- [x] Purchase history page (store owner view)
- [ ] Embed storefront in widget (chatbot can show products)

---

## Phase 15 — Digital Wallet & Loyalty Programs
> Goal: Issue Apple/Google Wallet passes (membership, punch card, points, etc.)

### Database Tables
- [x] `wallet_programs` table (id, user_id, name, type, description, status, config JSON, brand_overrides JSON, chatbot_id)
- [x] `wallet_cards` table (id, serial, program_id, customer_name, customer_email, customer_phone, contact_id, status, state JSON, google_pass_object_id, created_at)
- [x] `wallet_push_subscriptions` table (id, card_id, device_type, push_token, created_at)

### Wallet API — Backend
- [x] `GET /api/wallet/program-types` — list supported pass types
- [x] `GET /api/wallet/programs` — list wallet programs
- [x] `POST /api/wallet/programs` — create program (membership/punch_card/points/coupon/event_ticket/prepaid_balance/business_card)
- [x] `GET /api/wallet/programs/{id}` — program detail
- [x] `PATCH /api/wallet/programs/{id}` — update program (config, branding, widget link)
- [x] `POST /api/wallet/programs/bulk-delete` — bulk delete programs
- [x] `GET /api/wallet/programs/{id}/cards` — list issued cards
- [x] `POST /api/wallet/programs/{id}/cards` — issue card to customer (with deduplication)
- [x] `DELETE /api/wallet/cards/{serial}` — revoke card (removes from Google Wallet)
- [x] `POST /api/wallet/cards/{serial}/action` — perform card action (add_punch, remove_punch, redeem, set_punches, set_tier, add_points, remove_points, set_balance, check_in, un_check_in, deduct_balance, load_balance, refund_balance)
- [x] `POST /api/wallet/cards/{serial}/push` — send push notification to card (Apple + Google)
- [x] `POST /api/wallet/programs/{id}/push` — broadcast push to all active card holders
- [x] Apple Wallet PKPass generation (`.pkpass` file with signing cert)
- [x] Google Wallet pass object creation via Google Wallet API
- [x] APNs (Apple Push Notification service) integration for wallet updates
- [x] Google Wallet class-level broadcast push

### Wallet UI — Frontend
- [x] Wallet Programs list page (`/dashboard/wallet`)
- [x] Create program wizard (type selection + config per type)
- [x] Program detail page with issued cards table
- [x] Issue card modal (customer name, email, phone)
- [x] Card action panel (punch, redeem, add points, etc.)
- [x] Send push notification form (with template variables)
- [x] Broadcast push to all card holders
- [x] Program branding editor (colors, icons)
- [ ] Card public pass page — QR code for Apple/Google Wallet add button

---

## 🏅 P4 — Platform Expansion (differentiation + developer ecosystem)

---

## Phase 17 — Advanced AI Features
> Goal: Browser Agent, MCP servers, A2A Protocol, Voice Lab, Rich Content

### Voice Lab (ElevenLabs Voice Cloning)
- [x] Voice Lab page (`/dashboard/voice-lab`) — record voice in browser or upload audio
- [x] ElevenLabs voice cloning API integration (create voice + conversational agent)
- [x] Voice preview playback
- [x] Copy generated Agent ID to use in widget voice settings
- [ ] Voice agent ElevenLabs setup checklist (security overrides, client events)

### OpenAI Realtime API for Voice Calls
- [x] OpenAI Realtime API WebSocket proxy (server-side)
- [x] 10 voice options for Realtime API
- [x] xAI Grok Realtime API WebSocket proxy (5 voices: Eve, Ara, Leo, Rex, Sal)
- [x] Full function calling in voice mode (OpenAI + xAI)
- [x] MCP tool support in voice mode (OpenAI + xAI)
- [ ] Web search in voice mode (built-in Grok, tool for OpenAI)
- [x] Conversation history resume in voice (last 40 messages injected)

### Browser Agent (Cloud Browser)
- [x] Cloud browser session management (isolated per request)
- [x] `POST /api/browser/session` — create browser session
- [x] `POST /api/browser/action` — navigate, click, type, scroll, screenshot
- [x] `GET /api/browser/session/{id}/view` — live browser iframe URL
- [x] Direct Browse mode (AI visits specific URL, extracts content)
- [x] Autonomous Research mode (AI searches + visits multiple pages)
- [x] Autonomous Form Filling (AI fills and submits web forms)
- [ ] Private Sessions mode (hide live browser feed)
- [x] Allow Login Pages toggle
- [x] Max pages per session (1-20, default 5)
- [x] Auto-close on inactivity (4 min)
- [x] Block private IP ranges (SSRF protection)
- [ ] Monthly session limit per account
- [ ] Flow Builder AI Web node (Browse mode + Research mode)
- [x] Browser Agent toggle in agent settings

### MCP Servers (Model Context Protocol)
- [x] `mcp_server_configs` table (id, user_id, chatbot_id, name, server_url, auth_type, auth_config JSON, is_active)
- [x] `GET /api/v1/mcp-servers` — list MCP server configs
- [x] `POST /api/v1/mcp-servers` — add MCP server
- [x] `DELETE /api/v1/mcp-servers/{id}` — remove MCP server
- [x] MCP tool discovery (list available tools from server)
- [x] MCP tool execution during AI chat (server-side proxy)
- [x] MCP tool support in voice mode (OpenAI Realtime + xAI Grok)
- [x] MCP servers management page (`/dashboard/settings/mcp`)

### Google A2A Protocol
- [x] `GET /a2a/widgets/{widgetId}/agent.json` — A2A discovery endpoint
- [x] `POST /a2a/widgets/{widgetId}` — A2A message endpoint (JSON-RPC)
- [ ] A2A authentication via Google AI API key
- [ ] A2A quick test in widget channels tab
- [ ] A2A endpoint display in widget channels tab

### Rich Content & Dynamic Chat
- [ ] Rich content JSON renderer in `ChatWindow` (carousels, cards, quick replies, buttons)
- [ ] `<<<RICH>>> ... <<<END>>>` dynamic content parser in AI response pipeline
- [ ] Dynamic content instruction builder in agent settings
- [ ] AI-generated carousel/card/button template generator
- [ ] YouTube URL auto-embed in chat messages
- [ ] Carousel node in Flow Builder (swipeable cards)
- [ ] Quick replies node (disappear after selection, up to 13)
- [ ] Button types: URL, phone, email, postback, landing page

### AI Tasks (Flow Builder Node)
- [ ] AI Tasks node execution engine (multi-task checklist driven by AI)
- [ ] Configurable follow-up nudges (delay + max attempts)
- [ ] Follow-up instructions (gentle vs aggressive)
- [ ] `ai-tasks-complete` and `ai-tasks-maxnudges` output handles
- [ ] Meta 24-hour window detection (auto-stop follow-ups)
- [ ] AI Tasks works across all 11 channels

### Google Sheets Integration
- [ ] Google OAuth for Sheets access
- [ ] `GET /api/integrations/google/sheets` — list accessible spreadsheets
- [ ] Flow Action: Google Sheets — Send Data, Get Row, Get Multiple Rows, Get Random Row, Update Row, Clear Row
- [ ] Google Docs integration for system prompts (collaborative editing, 10-min sync)
- [ ] Google Docs: create/update docs from flows

### Additional AI Models
- [ ] DeepSeek provider integration
- [ ] Groq provider integration (fast inference)
- [ ] Perplexity provider integration
- [ ] xAI Grok provider (text + image generation)
- [ ] GPT-5 / GPT-5 Mini / GPT-5 Nano support
- [ ] Gemini 3.x Pro/Flash support
- [ ] Claude Opus 4.7 / Haiku 4.5 complete support
- [ ] AI image generation (`/image` slash command — Google Imagen)
- [ ] AI video generation (`/video` slash command — Google Veo)
- [ ] Streaming Mode toggle (fast plain-text, disables dynamic content + functions)
- [ ] Temperature setting per agent
- [ ] Max agent steps configuration

---

## Phase 18 — API Tokens & Widget Management API
> Goal: Programmatic platform control for integrations

### Database Tables
- [x] `api_tokens` table (id, user_id, name, token_hash, token_prefix, last_used_at)

### API Token Management
- [x] `GET /api/tokens` — list all API tokens
- [x] `POST /api/tokens` — generate new API token (full token shown once)
- [x] `DELETE /api/tokens/{id}` — revoke token
- [ ] `GET /api/v1/me` — get authenticated user info
- [x] API tokens management page (`/dashboard/settings/api-tokens`)
- [x] Bearer token auth on all `/api/v1/*` and `/api/manage/*` routes

### Widget Management API
- [ ] `GET /api/manage/widgets` — list widgets with key config fields
- [ ] `GET /api/manage/widgets/{id}` — full widget config
- [ ] `PUT /api/manage/widgets/{id}` — update any widget setting (name, prompt, model, voice, channels, toggles)
- [ ] `DELETE /api/manage/widgets/{id}` — delete widget
- [ ] `POST /api/manage/widgets/{id}/pause` — pause AI responses (human takeover)
- [ ] `POST /api/manage/widgets/{id}/unpause` — resume AI responses
- [ ] `POST /api/manage/widgets/{id}/enable-ai` — toggle AI per channel (webchat/telegram/discord/phone/tiktok/all)
- [ ] `GET /api/manage/widgets/{id}/functions` — list assigned functions + available
- [ ] `PUT /api/manage/widgets/{id}/functions` — assign functions to widget
- [ ] `GET /api/manage/functions` — list all functions
- [ ] `GET /api/manage/functions/{id}` — function detail
- [ ] `PUT /api/manage/functions/{id}` — update function (schema, output message, saveToContact)
- [ ] `DELETE /api/manage/functions/{id}` — delete function
- [ ] `POST /api/manage/functions/{id}/toggle` — toggle active
- [ ] `POST /api/manage/functions/{id}/enable` / `disable`

---

## Phase 19 — White Label & Sub-accounts
> Goal: 3-tier reseller hierarchy (Platform → Agencies → Tenants/Clients) with full brand isolation

### 19.1 — Database Schema (3-tier hierarchy)
- [ ] `platform_config` table — single row: platform name, logo, support email, Stripe account ID, updated_at
- [ ] `agencies` table — slug (subdomain), custom_domain, logo_url, favicon_url, primary_colour, support_email, from_email, smtp_config JSONB, plan (starter/growth/unlimited), status, owner_user_id
- [ ] `tenants` table — agency_id FK, name, slug, plan, status; UNIQUE(agency_id, slug)
- [ ] `impersonation_audit_log` table — id, actor_user_id, target_user_id, target_agency_id, started_at, ended_at, ip_address
- [ ] Alembic migration `000000000014_add_white_label_tables.py`

### 19.2 — Custom Domain Routing (Next.js Middleware)
- [ ] Extend `middleware.ts` to read `host` header and call `resolveAgency(host)`
- [ ] `resolveAgency()` helper: (a) exact match on `agencies.custom_domain` → load agency; (b) `{slug}.platform.com` → load by slug; (c) bare platform domain → platform admin mode
- [ ] Redis cache for domain→agency_id lookup (TTL 5 min, key: `agency:domain:{host}`)
- [ ] Set response headers `x-agency-id` and `x-agency-theme` (JSON: primaryColour, logo, name, favicon)
- [ ] Fallback gracefully when Redis is unavailable (DB direct lookup)

### 19.3 — Theme Provider (React)
- [ ] `AgencyThemeProvider` server component — reads `x-agency-theme` header, passes to client
- [ ] Client `ThemeInjector` — injects CSS variables `--brand-primary`, `--brand-primary-hover` into `:root`
- [ ] Dynamic favicon swap via `<link>` tag based on agency config
- [ ] Dynamic `<title>` and `og:image` metadata from agency config (per-layout server component)
- [ ] Replace all hardcoded "ChatCraft AI" strings in client-facing routes with `{agency.name ?? platformName}`
- [ ] Logo component that renders agency logo when present, platform logo as fallback

### 19.4 — Agency Admin UI
- [ ] `/agency` layout with agency-branded sidebar (reads theme from context)
- [ ] `/agency/dashboard` — KPIs: total clients, active conversations, revenue MTD
- [ ] `/agency/clients` — tenant list: create/edit/delete clients, impersonate client
- [ ] `/agency/settings/branding` — logo upload, primary colour picker, support email, from_email
- [ ] `/agency/settings/domain` — custom domain setup flow:
  - Step 1: input custom domain
  - Step 2: display CNAME DNS instructions (point to platform proxy)
  - Step 3: poll DNS verification every 30 s (`dns.resolve()` check via `/api/agency/verify-domain`)
  - Step 4: mark `custom_domain` verified in DB, activate routing
- [ ] `/agency/settings/email` — custom SMTP config form (host, port, user, password, from_name); send test email button
- [ ] `/agency/team` — invite/manage agency team members

### 19.5 — Agency & Tenant API (Backend)
- [ ] `POST /api/v1/agencies` — create agency (superadmin only)
- [ ] `GET /api/v1/agencies` — list agencies (superadmin)
- [ ] `GET /api/v1/agencies/{id}` — get agency detail
- [ ] `PATCH /api/v1/agencies/{id}` — update agency config/branding
- [ ] `DELETE /api/v1/agencies/{id}` — delete agency + cascade
- [ ] `GET /api/v1/agencies/{id}/tenants` — list tenants for agency
- [ ] `POST /api/v1/agencies/{id}/tenants` — create tenant/client
- [ ] `DELETE /api/v1/agencies/{id}/tenants/{tid}` — delete tenant
- [ ] `GET /api/v1/agency/me` — agency owner: get own agency config
- [ ] `PUT /api/v1/agency/me` — agency owner: update branding/settings
- [ ] `GET /api/v1/agency/me/domain-status` — check custom domain DNS propagation
- [ ] `POST /api/v1/agency/verify-domain` — trigger DNS check and mark verified
- [ ] `POST /api/v1/agency/send-test-email` — test SMTP config

### 19.6 — Branded Email (Zero Platform Leakage)
- [ ] Email service (`services/email.py`) updated to accept optional `agency_id`
- [ ] When `agency_id` present: use agency `smtp_config` if set, else use SendGrid subuser for that agency
- [ ] All transactional email templates: logo, primary_colour, support_email pulled from agency config at send time
- [ ] No platform name/logo in any agency-sent email footer, subject, or preheader
- [ ] `POST /api/v1/agency/send-test-email` — send a test email through the configured SMTP

### 19.7 — White-Label Widget
- [ ] Widget config endpoint `/api/widget/config/{token}` returns agency branding (not platform branding) when chatbot belongs to an agency-owned account
- [ ] `widget.js` served at `/widget.js` on agency's custom domain includes agency styles, not platform styles
- [ ] "Powered by" footer logic: growth+ plan → "Powered by {agency_name}"; starter → hidden (platform name never appears)
- [ ] Widget iframe `<title>` and `aria-label` use agency name

### 19.8 — Super-Admin Impersonation (complete remaining gaps)
- [x] Backend `POST /api/admin/users/{id}/impersonate` — generates JWT with `impersonated_by` claim (5 min TTL)
- [x] Frontend "Impersonate" button in `/admin/users/[id]` — copies token to clipboard
- [ ] Extend impersonation JWT to 15-min TTL (update `exp` in admin.py)
- [ ] Add `target_agency_id` to impersonation JWT payload for "View as Agency" mode
- [ ] `POST /api/admin/agencies/{id}/impersonate` — agency-level impersonation token
- [ ] Write impersonation start/end events to `impersonation_audit_log`
- [ ] Visible session banner: read impersonation claim from session JWT; show amber bar "Viewing as [Name] — Exit" with `signOut()` / token clear on exit
- [ ] Superadmin panel: `/admin/impersonation-log` — table of all impersonation sessions with actor, target, start/end times, IP

### 19.9 — Reseller Revenue & Licensing
- [ ] `subscriptions_reseller` table (agency_id, client_email, stripe_subscription_id, license_token, plan, amount, status)
- [ ] `GET /api/v1/agency/subscriptions` — list agency's client subscriptions
- [ ] `POST /api/v1/agency/subscriptions` — create client subscription + generate license token
- [ ] License validation API — validates `data-license` token on widget load
- [ ] Reseller revenue dashboard in agency UI (MRR, churn, client count)
- [ ] Custom pricing tiers editor (agency sets its own price per plan)

---

## 🔒 P5 — Production Launch (run in parallel throughout; finalise last)

---

## Phase 20 — Production Launch
> Goal: Secure, tested, fully launched

### Remaining Tests
- [ ] RAG service unit tests (`test_rag.py`)
- [ ] Stripe billing unit tests (`test_billing.py`)
- [ ] Voice service unit tests (`test_voice.py`)
- [ ] File processing unit tests (`test_file_processing.py`)
- [ ] CRM endpoints integration tests
- [ ] Flow builder execution engine integration tests
- [ ] Chat + KB integration test (message → stream → token log → RAG retrieval)
- [ ] Billing integration test (checkout → webhook → role update)
- [ ] E2E: Knowledge base upload → question → grounded answer
- [ ] E2E: Billing free tier → upgrade modal → subscribe → premium
- [ ] E2E: Widget embed → chat → conversation saved
- [ ] E2E: Creator dashboard → analytics → CSV export → GDPR delete

### Performance
- [ ] All list endpoints paginated (default 20/page) — verify all new Phase 8+ endpoints
- [ ] Chatbot configs cached at edge (CDN, 60s TTL)
- [ ] Redis caching for frequently read configs (widget config, KB stats)
- [ ] Database indexes verified on all major foreign keys
- [ ] pgvector IVFFlat index on embeddings
- [ ] Celery task priority queues (high for chat, low for embeddings)

### Final Security
- [ ] File upload virus scanning (ClamAV)
- [ ] API keys encrypted at rest (AES-256)
- [ ] Brute force protection on login
- [ ] OWASP Top 10 checklist review
- [ ] Penetration test on auth + billing endpoints
- [ ] Rate limiting on all public endpoints (including widget chat + webhooks)

### DevOps
- [ ] Production environment fully configured (Railway + Vercel + Supabase + Upstash)
- [ ] Staging environment with seed data
- [ ] Database backup automation (daily)
- [ ] Secrets rotated from dev defaults
- [ ] CDN + edge caching for widget.js
- [ ] Sentry alerts configured for production error rates
- [ ] Axiom dashboard for API latency + error monitoring
