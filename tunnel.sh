#!/usr/bin/env bash
set -e

ENV_FILE="$(dirname "$0")/.env"

echo "Starting backend tunnel (port 8000)..."
cloudflared tunnel --url http://localhost:8000 --logfile /tmp/cf-backend.log &
CF_BACKEND_PID=$!

echo "Waiting for backend tunnel URL..."
for i in $(seq 1 30); do
  BACKEND_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf-backend.log 2>/dev/null | head -1)
  [ -n "$BACKEND_URL" ] && break
  sleep 1
done

if [ -z "$BACKEND_URL" ]; then
  echo "ERROR: Could not get backend tunnel URL. Check /tmp/cf-backend.log"
  kill $CF_BACKEND_PID 2>/dev/null
  exit 1
fi

echo "Backend tunnel: $BACKEND_URL"

# Update .env with backend tunnel URL
sed -i "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=$BACKEND_URL|" "$ENV_FILE"
sed -i "s|GOOGLE_OAUTH_REDIRECT_URI=.*|GOOGLE_OAUTH_REDIRECT_URI=$BACKEND_URL/api/auth/google/callback|" "$ENV_FILE"

echo "Restarting frontend with new backend URL..."
docker compose restart frontend

echo "Waiting for frontend to be ready..."
for i in $(seq 1 60); do
  docker compose ps frontend | grep -q "healthy" && break
  sleep 2
done

echo "Starting frontend tunnel (port 3000)..."
cloudflared tunnel --url http://localhost:3000 --logfile /tmp/cf-frontend.log &
CF_FRONTEND_PID=$!

echo "Waiting for frontend tunnel URL..."
for i in $(seq 1 30); do
  FRONTEND_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cf-frontend.log 2>/dev/null | head -1)
  [ -n "$FRONTEND_URL" ] && break
  sleep 1
done

if [ -z "$FRONTEND_URL" ]; then
  echo "ERROR: Could not get frontend tunnel URL. Check /tmp/cf-frontend.log"
  kill $CF_FRONTEND_PID 2>/dev/null
  exit 1
fi

echo ""
echo "============================================"
echo "  App is live!"
echo "  Frontend : $FRONTEND_URL"
echo "  Backend  : $BACKEND_URL"
echo "============================================"
echo ""
echo "Add this to Google Console redirect URIs:"
echo "  $FRONTEND_URL/api/auth/callback/google"
echo "  $BACKEND_URL/api/auth/google/callback"
echo ""
echo "Press Ctrl+C to stop tunnels"

# Keep running until Ctrl+C
trap "kill $CF_BACKEND_PID $CF_FRONTEND_PID 2>/dev/null; echo 'Tunnels stopped.'" INT TERM
wait
