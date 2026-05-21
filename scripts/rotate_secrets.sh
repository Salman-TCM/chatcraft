#!/usr/bin/env bash
# Generates new cryptographically-secure values for all dev-default secrets.
# Run this before deploying to production; paste the output into your .env or
# provider secret stores (Railway, Vercel, GitHub Actions).

set -euo pipefail

echo "# ============================================================="
echo "# ChatCraft AI — Generated Secrets  ($(date -u +"%Y-%m-%dT%H:%M:%SZ"))"
echo "# Copy these into your production secret store."
echo "# NEVER commit this output to version control."
echo "# ============================================================="
echo ""

gen() {
  local name="$1"
  local len="${2:-32}"
  local value
  value=$(openssl rand -hex "$len")
  echo "${name}=${value}"
}

gen_base64() {
  local name="$1"
  local bytes="${2:-32}"
  local value
  value=$(openssl rand -base64 "$bytes" | tr -d '\n/')
  echo "${name}=${value}"
}

echo "# --- Core app ---"
gen SECRET_KEY 32
gen NEXTAUTH_SECRET 32
echo ""

echo "# --- Database ---"
gen POSTGRES_PASSWORD 20
echo ""

echo "# --- JWT (keep algorithm as-is unless you know what you are doing) ---"
echo "JWT_ALGORITHM=HS256"
echo ""

echo "# --- VAPID (Web Push) ---"
echo "# Regenerate with:  npx web-push generate-vapid-keys"
if command -v npx &>/dev/null; then
  npx --yes web-push generate-vapid-keys 2>/dev/null | grep -E "^(Public|Private)" \
    | sed 's/Public Key:/VAPID_PUBLIC_KEY=/' \
    | sed 's/Private Key:/VAPID_PRIVATE_KEY=/' \
    || gen_base64 VAPID_PUBLIC_KEY 33
else
  gen_base64 VAPID_PUBLIC_KEY 33
  gen_base64 VAPID_PRIVATE_KEY 32
fi
echo ""

echo "# --- Reminder: also rotate in your provider dashboards ---"
echo "# STRIPE_SECRET_KEY         → Stripe Dashboard > Developers > API Keys"
echo "# STRIPE_WEBHOOK_SECRET     → Stripe Dashboard > Webhooks (re-add endpoint)"
echo "# ANTHROPIC_API_KEY         → console.anthropic.com/keys"
echo "# OPENAI_API_KEY            → platform.openai.com/api-keys"
echo "# RESEND_API_KEY            → resend.com/api-keys"
echo "# SUPABASE_KEY              → Supabase Dashboard > Settings > API"
echo "# AWS_ACCESS_KEY_ID/SECRET  → AWS IAM (create new key, deactivate old)"
