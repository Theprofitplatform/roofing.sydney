#!/usr/bin/env bash
#
# Deploy roofing.sydney (public site + CRM) to the VPS.
#
# Run ON the VPS from the repo checkout:
#     ./scripts/deploy.sh
#
# Expects .env.production beside compose.yml holding both the NEXT_PUBLIC_*
# build values and the server-only runtime secrets. Never commit that file.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_FILE=".env.production"
PORT="${APP_PORT:-9030}"
HEALTH="http://127.0.0.1:${PORT}/api/health"

log()  { printf '\033[1;34m→\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ── Pre-flight ───────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "docker not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 required"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE missing — copy .env.example and fill it in"

# Build args must be present or the client bundle ships with undefined values
# and every Supabase call from the browser fails at runtime, not build time.
for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
    grep -qE "^${key}=.+" "$ENV_FILE" || fail "$key missing or empty in $ENV_FILE"
done

# A service-role key baked into the image would sit in the layer history forever.
if grep -qE '^\s*SUPABASE_SERVICE_ROLE_KEY' compose.yml; then
    fail "SUPABASE_SERVICE_ROLE_KEY appears in compose.yml build args — remove it"
fi

GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
export GIT_COMMIT APP_PORT="$PORT"
set -a
# shellcheck source=/dev/null  # runtime path, not resolvable statically
. "./$ENV_FILE"
set +a

log "Deploying ${GIT_COMMIT} on port ${PORT}"

# ── Build ────────────────────────────────────────────────────────────────────
log "Building image"
docker compose build --pull
ok "Image built"

# ── Swap ─────────────────────────────────────────────────────────────────────
PREV="$(docker inspect -f '{{.Image}}' roofing-app 2>/dev/null || echo '')"

log "Starting container"
docker compose up -d --remove-orphans

# ── Verify ───────────────────────────────────────────────────────────────────
log "Waiting for health"
for i in $(seq 1 30); do
    if curl -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1; then
        ok "Healthy after ${i}s"
        curl -fsS "$HEALTH"; echo
        ok "Deployed. Check https://app.roofing.sydney"
        exit 0
    fi
    sleep 1
done

# ── Rollback ─────────────────────────────────────────────────────────────────
printf '\033[1;31m✗\033[0m Health check failed — last 40 log lines:\n' >&2
docker compose logs --tail 40 app >&2 || true

if [[ -n "$PREV" ]]; then
    log "Rolling back to ${PREV:0:19}"
    docker tag "$PREV" roofing-sydney:latest
    docker compose up -d
    fail "Rolled back to previous image"
fi

fail "Deploy failed and there is no previous image to roll back to"
