#!/usr/bin/env bash
# Atomic work-item / site-lane locks for .planning/TRACKER.md executors (Claude + Codex).
#
# Usage:
#   tracker-lock.sh claim   <lock-name> <executor>   # e.g. claim W1 codex / claim site-hottyres claude
#   tracker-lock.sh touch   <lock-name> <executor>   # heartbeat: refresh a held lock (run at least hourly in long batches)
#   tracker-lock.sh release <lock-name> <executor>
#   tracker-lock.sh status                           # list all held locks
#   tracker-lock.sh steal   <lock-name> <executor>   # take over a stale lock (only if older than STALE_HOURS)
#
# Exit codes: 0 = success, 1 = lock held by someone else / bad usage, 2 = stale (steal allowed)
#
# Locks live in <main-repo>/.git/tracker-locks/<name>/ — inside the SHARED git dir, so all
# worktrees of this repo see the same locks, and git never tracks them.
# mkdir is atomic: if two agents race, exactly one wins.
# Identity = executor name + session id (CLAUDE_CODE_SESSION_ID / TRACKER_SESSION_ID / agent
# process pid), so two concurrent sessions of the SAME tool are still kept apart.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_COMMON_DIR="$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || {
  echo "ERROR: not inside a git repository — locks need the shared .git dir" >&2
  exit 1
}
LOCK_DIR="$GIT_COMMON_DIR/tracker-locks"
STALE_HOURS="${STALE_HOURS:-6}"

# Session id: stable per agent session. Grandparent pid fallback = the agent process
# that spawned the shell that ran this script.
SESSION="${TRACKER_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-${CODEX_SESSION_ID:-ppid-$(ps -o ppid= -p $PPID | tr -d ' ')}}}"

mkdir -p "$LOCK_DIR"

usage() {
  grep '^#   tracker-lock' "${BASH_SOURCE[0]}" | sed 's/^# *//' >&2
  exit 1
}

validate_name() {
  # No slashes, no empty, no dot-only names — lock names must stay inside LOCK_DIR.
  case "$1" in
    ''|.|..) echo "ERROR: invalid lock name '$1'" >&2; exit 1 ;;
  esac
  if ! printf '%s' "$1" | grep -qE '^[A-Za-z0-9][A-Za-z0-9._-]*$'; then
    echo "ERROR: invalid lock name '$1' (allowed: letters, digits, . _ -; must not start with .)" >&2
    exit 1
  fi
}

lock_age_seconds() {
  local path="$1" now mtime
  now=$(date +%s)
  # GNU stat first (-c), BSD stat fallback (-f). Exactly one form works per platform.
  mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null) || return 1
  case "$mtime" in ''|*[!0-9]*) return 1 ;; esac
  echo $(( now - mtime ))
}

age_hours() { echo $(( ${1:-0} / 3600 )); }

# `|| true` guards pipefail when the owner file is missing (crashed claim).
owner_field() { { sed -n "s/^$2=//p" "$1/owner" 2>/dev/null || true; } | head -1; }

write_owner() {
  printf 'owner=%s\nsession=%s\nclaimed=%s\n' "$1" "$SESSION" "$(date '+%Y-%m-%d %H:%M:%S %z')" > "$2/owner"
}

cmd="${1:-}"

case "$cmd" in
  claim)
    [ $# -eq 3 ] || usage
    name="$2"; executor="$3"; validate_name "$name"
    path="$LOCK_DIR/$name"
    if mkdir "$path" 2>/dev/null; then
      write_owner "$executor" "$path"
      echo "CLAIMED: $name by $executor (session ${SESSION:0:12})"
      exit 0
    fi
    holder=$(owner_field "$path" owner); holder="${holder:-unknown}"
    holder_session=$(owner_field "$path" session)
    if [ "$holder" = "$executor" ] && [ "$holder_session" = "$SESSION" ]; then
      echo "ALREADY YOURS: $name (claimed earlier this session by $executor) — proceed"
      exit 0
    fi
    age=$(lock_age_seconds "$path" || echo 0)
    # Ownerless lock = a claim crashed between mkdir and writing owner. After a 60s
    # grace period it is safe to take over atomically (mv wins for exactly one taker).
    if [ ! -f "$path/owner" ] && [ "$age" -ge 60 ]; then
      if mv "$path" "$path.crashed.$$" 2>/dev/null; then
        rm -rf "$path.crashed.$$"
        if mkdir "$path" 2>/dev/null; then
          write_owner "$executor" "$path"
          echo "CLAIMED: $name by $executor (recovered ownerless lock from a crashed claim)"
          exit 0
        fi
      fi
      echo "HELD: $name — another agent recovered it first. Pick another item." >&2
      exit 1
    fi
    if [ "$(age_hours "$age")" -ge "$STALE_HOURS" ]; then
      echo "HELD-STALE: $name held by $holder for $(age_hours "$age")h (>${STALE_HOURS}h) with no heartbeat. Likely a dead session." >&2
      echo "If certain no other agent is mid-mutation, run: tracker-lock.sh steal $name $executor" >&2
      exit 2
    fi
    if [ "$holder" = "$executor" ]; then
      echo "HELD: $name is claimed by ANOTHER $executor session (${holder_session:0:12}, $(age_hours "$age")h ago). A second $executor is running — DO NOT work this item/site." >&2
    else
      echo "HELD: $name is claimed by $holder ($(age_hours "$age")h ago). DO NOT work this item/site — pick another." >&2
    fi
    exit 1
    ;;
  touch)
    [ $# -eq 3 ] || usage
    name="$2"; executor="$3"; validate_name "$name"
    path="$LOCK_DIR/$name"
    holder=$(owner_field "$path" owner)
    holder_session=$(owner_field "$path" session)
    if [ "$holder" != "$executor" ] || [ "$holder_session" != "$SESSION" ]; then
      echo "REFUSED: $name is not held by $executor in this session — cannot heartbeat it." >&2
      exit 1
    fi
    command touch "$path"
    echo "HEARTBEAT: $name refreshed by $executor"
    ;;
  release)
    [ $# -eq 3 ] || usage
    name="$2"; executor="$3"; validate_name "$name"
    path="$LOCK_DIR/$name"
    if [ ! -d "$path" ]; then
      echo "NOT HELD: $name (nothing to release)"
      exit 0
    fi
    holder=$(owner_field "$path" owner); holder="${holder:-unknown}"
    holder_session=$(owner_field "$path" session)
    if [ "$holder" != "$executor" ]; then
      echo "REFUSED: $name is held by $holder, not $executor. Release denied." >&2
      exit 1
    fi
    if [ "$holder_session" != "$SESSION" ]; then
      echo "WARNING: releasing a lock claimed by a DIFFERENT $executor session (${holder_session:0:12}). Only do this if that session is dead." >&2
    fi
    rm -rf "$path"
    echo "RELEASED: $name by $executor"
    ;;
  steal)
    [ $# -eq 3 ] || usage
    name="$2"; executor="$3"; validate_name "$name"
    path="$LOCK_DIR/$name"
    if [ ! -d "$path" ]; then
      echo "NOT HELD: $name — just claim it normally"
      exit 1
    fi
    age=$(lock_age_seconds "$path" || echo 0)
    if [ "$(age_hours "$age")" -lt "$STALE_HOURS" ]; then
      holder=$(owner_field "$path" owner); holder="${holder:-unknown}"
      echo "REFUSED: $name held by $holder only $(age_hours "$age")h ago (<${STALE_HOURS}h) — not stale. Cannot steal." >&2
      exit 1
    fi
    # Atomic takeover: mv wins for exactly one stealer; the loser's mv fails.
    if ! mv "$path" "$path.stolen.$$" 2>/dev/null; then
      echo "REFUSED: $name was stolen or released by another agent first." >&2
      exit 1
    fi
    rm -rf "$path.stolen.$$"
    if ! mkdir "$path" 2>/dev/null; then
      echo "REFUSED: another agent claimed $name in the takeover window. It is theirs." >&2
      exit 1
    fi
    write_owner "$executor" "$path"
    echo "STOLEN: $name now held by $executor (previous lock was $(age_hours "$age")h stale)"
    ;;
  status)
    found=0
    for path in "$LOCK_DIR"/*/; do
      [ -d "$path" ] || continue
      found=1
      name=$(basename "$path")
      holder=$(owner_field "$path" owner); holder="${holder:-unknown}"
      holder_session=$(owner_field "$path" session)
      when=$(owner_field "$path" claimed); when="${when:-?}"
      age=$(lock_age_seconds "$path" || echo 0)
      echo "$name — held by $holder (session ${holder_session:0:12}) since $when (last heartbeat $(age_hours "$age")h ago)"
    done
    [ "$found" -eq 1 ] || echo "No locks held."
    ;;
  *)
    usage
    ;;
esac
