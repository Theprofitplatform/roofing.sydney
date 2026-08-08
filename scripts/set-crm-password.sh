#!/usr/bin/env bash
#
# Set (or reset) a CRM operator's password.
#
# Run ON `base`, where the Supabase service-role key lives:
#     ./scripts/set-crm-password.sh john@roofing.sydney
#
# Prompts twice, echoes nothing, and never takes the password as an argument —
# an argument would land in shell history and in the process list, where any
# other user on the box can read it.
#
# Self-signup is disabled (DISABLE_SIGNUP=true), so this is the only way an
# account gets a usable password. The user must already exist; create one with
# --create if not.

set -euo pipefail

ENV_FILE="${SUPABASE_ENV:-$HOME/stacks/roofing-supabase/.env}"
API="${SUPABASE_URL:-https://db.roofing.sydney}"
STACK_DIR="${STACK_DIR:-$HOME/stacks/roofing-supabase}"
MIN_LEN=12

fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }

CREATE=0
EMAIL=""
for arg in "$@"; do
    case "$arg" in
        --create) CREATE=1 ;;
        -*) fail "unknown flag: $arg" ;;
        *) EMAIL="$arg" ;;
    esac
done
[[ -n "$EMAIL" ]] || fail "usage: $0 <email> [--create]"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found — set SUPABASE_ENV"

SERVICE_ROLE_KEY="$(grep -E '^SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2-)"
[[ -n "$SERVICE_ROLE_KEY" ]] || fail "SERVICE_ROLE_KEY missing from $ENV_FILE"

read -rsp "New password for ${EMAIL}: " PW1; echo
read -rsp "Repeat: " PW2; echo
[[ "$PW1" == "$PW2" ]] || fail "passwords do not match"
(( ${#PW1} >= MIN_LEN )) || fail "too short — use at least ${MIN_LEN} characters"

api() {
    curl -sS --max-time 20 \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" "$@"
}

# The admin API has no lookup-by-email, so resolve the id in Postgres. Reading
# it here also means a typo'd address fails loudly instead of silently creating
# nothing.
USER_ID="$(docker compose --project-directory "$STACK_DIR" exec -T db \
    psql -U postgres -d postgres -tAc \
    "select id from auth.users where email = '${EMAIL//\'/\'\'}'" 2>/dev/null | tr -d '[:space:]')"

# Build the JSON with a real encoder — a password is exactly the kind of string
# that contains quotes and backslashes, and hand-rolled interpolation would
# either corrupt it or break out of the literal.
json_body() {
    EMAIL="$EMAIL" NEW_PW="$PW1" CREATING="$1" python3 -c '
import json, os
body = {"password": os.environ["NEW_PW"]}
if os.environ["CREATING"] == "1":
    body |= {"email": os.environ["EMAIL"], "email_confirm": True}
print(json.dumps(body))
'
}

if [[ -z "$USER_ID" ]]; then
    (( CREATE )) || fail "no account for ${EMAIL} — pass --create to make one"
    json_body 1 | api -X POST "${API}/auth/v1/admin/users" --data-binary @- >/dev/null
    ok "created ${EMAIL}"
else
    json_body 0 | api -X PUT "${API}/auth/v1/admin/users/${USER_ID}" --data-binary @- >/dev/null
    ok "password updated for ${EMAIL}"
fi

unset PW1 PW2
ok "sign in at https://app.roofing.sydney/login"
