# syntax=docker/dockerfile:1.7
# =============================================================================
# ChatCraft AI — Next.js 14 Frontend
# Multi-stage build: deps → builder → final standalone image
#
# BuildKit is required (default in Docker 23+). Enable in older Docker with:
#   DOCKER_BUILDKIT=1 docker build ...
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps — install node_modules
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install libc compat for Alpine (required by some native modules)
RUN apk add --no-cache libc6-compat

# Copy workspace manifests AND lockfile — the lockfile is what `npm ci` uses
# to install a byte-identical tree. Without it, npm falls back to `install`
# semantics and the cache invalidates on every deploy even when nothing changed.
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/

# `npm ci` is deterministic (lockfile-strict, no writes to lockfile) and
# considerably faster than `npm install` for cold caches. The BuildKit cache
# mount persists ~/.npm across builds so unchanged deps re-hydrate in seconds.
RUN --mount=type=cache,target=/root/.npm \
    npm ci


# -----------------------------------------------------------------------------
# Stage 2: builder — compile Next.js
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy installed modules from deps stage (npm workspaces hoists everything
# into the root node_modules; there is no separate frontend/node_modules)
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY shared/ ./shared/
COPY frontend/ ./frontend/
COPY package.json ./

# Build args for public env vars baked into the bundle at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_SENTRY_DSN
# BACKEND_URL is read by next.config.mjs INSIDE rewrites(), which Next.js
# resolves at build time into routes-manifest.json. If unset at build,
# it falls back to http://backend:8000, which doesn't exist in the prod
# blue/green setup (only backend_blue/backend_green) — leaving every
# proxied /api/* rewrite failing with EAI_AGAIN. Must be a build arg.
ARG BACKEND_URL

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV BACKEND_URL=$BACKEND_URL

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/frontend

# Persist Next.js's incremental build cache across deploys — same idea as the
# npm cache above. First deploy pays full build cost, subsequent code-only
# changes reuse compiled/typechecked chunks.
RUN --mount=type=cache,target=/app/frontend/.next/cache \
    npm run build


# -----------------------------------------------------------------------------
# Stage 3: final — lean runtime with standalone output
# -----------------------------------------------------------------------------
FROM node:20-alpine AS final

WORKDIR /app

RUN apk add --no-cache curl

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only the standalone Next.js output and static files
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/frontend/public ./frontend/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
