#!/usr/bin/env bash
# Regression tests for tracker-lock.sh. Run: bash .planning/scripts/tracker-lock.test.sh
# Uses a throwaway lock namespace name prefix (tst-) and cleans up after itself.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S="$SCRIPT_DIR/tracker-lock.sh"
LOCKS="$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir)/tracker-locks"

pass=0; fail=0
check() { # check <description> <expected-exit> <actual-exit>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1 (expected exit $2, got $3)"; fi
}
cleanup() { rm -rf "$LOCKS"/tst-* "$LOCKS"/tst-*.crashed.* "$LOCKS"/tst-*.stolen.* 2>/dev/null; }
trap cleanup EXIT
cleanup

# happy path
bash "$S" claim tst-w1 claude >/dev/null 2>&1;                            check "claim free lock" 0 $?
bash "$S" claim tst-w1 claude >/dev/null 2>&1;                            check "idempotent re-claim same session" 0 $?
bash "$S" touch tst-w1 claude >/dev/null 2>&1;                            check "heartbeat own lock" 0 $?
bash "$S" release tst-w1 claude >/dev/null 2>&1;                          check "release own lock" 0 $?

# contention / identity edges
bash "$S" claim tst-w1 claude >/dev/null 2>&1
bash "$S" claim tst-w1 codex >/dev/null 2>&1;                             check "other executor refused" 1 $?
TRACKER_SESSION_ID=other bash "$S" claim tst-w1 claude >/dev/null 2>&1;   check "same executor OTHER session refused" 1 $?
TRACKER_SESSION_ID=other bash "$S" touch tst-w1 claude >/dev/null 2>&1;   check "heartbeat from other session refused" 1 $?
bash "$S" release tst-w1 codex >/dev/null 2>&1;                           check "release by non-owner refused" 1 $?
bash "$S" steal tst-w1 codex >/dev/null 2>&1;                             check "steal fresh lock refused" 1 $?
bash "$S" release tst-w1 claude >/dev/null 2>&1

# failure / recovery cases
bash "$S" claim '../tst-esc' claude >/dev/null 2>&1;                      check "path-traversal name rejected" 1 $?
bash "$S" claim '' claude >/dev/null 2>&1;                                check "empty name rejected" 1 $?
mkdir -p "$LOCKS/tst-crash"; touch -t "$(date -v-5M '+%Y%m%d%H%M' 2>/dev/null || date -d '5 minutes ago' '+%Y%m%d%H%M')" "$LOCKS/tst-crash"
bash "$S" claim tst-crash codex >/dev/null 2>&1;                          check "ownerless crashed lock recovered" 0 $?
bash "$S" release tst-crash codex >/dev/null 2>&1
mkdir -p "$LOCKS/tst-fresh"
bash "$S" claim tst-fresh claude >/dev/null 2>&1;                         check "ownerless FRESH lock stays held" 1 $?
rm -rf "$LOCKS/tst-fresh"

# staleness + atomic steal race
bash "$S" claim tst-stale claude >/dev/null 2>&1
touch -t "$(date -v-7H '+%Y%m%d%H%M' 2>/dev/null || date -d '7 hours ago' '+%Y%m%d%H%M')" "$LOCKS/tst-stale"
bash "$S" claim tst-stale codex >/dev/null 2>&1;                          check "stale lock reports exit 2" 2 $?
wins=$( (bash "$S" steal tst-stale codex 2>/dev/null & TRACKER_SESSION_ID=x2 bash "$S" steal tst-stale claude 2>/dev/null & wait) | grep -c STOLEN )
check "concurrent steal: exactly one winner" 1 "$wins"
rm -rf "$LOCKS/tst-stale"

# claim race atomicity
wins=$( (bash "$S" claim tst-race claude 2>/dev/null & TRACKER_SESSION_ID=x2 bash "$S" claim tst-race codex 2>/dev/null & wait) | grep -c CLAIMED )
check "concurrent claim: exactly one winner" 1 "$wins"

echo "----"
echo "PASS: $pass  FAIL: $fail"
[ "$fail" -eq 0 ]
