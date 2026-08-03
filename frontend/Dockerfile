# =============================================================================
# ChatCraft AI — Next.js 14 Frontend
# Multi-stage build: deps → builder → final standalone image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps — install node_modules
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install libc compat for Alpine (required by some native modules)
RUN apk add --no-cache libc6-compat

# Copy workspace manifests
COPY package.json ./
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/

# Install all workspace deps
RUN npm install --workspaces


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

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/frontend

RUN npm run build


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
