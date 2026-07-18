# Shared Work Tracker — roofing.sydney

Living tracker for all in-flight work. **Both Claude and Codex read and update this file.** Plans/specs stay in their own docs; live state lives here.

## Protocol (both executors)

1. **Read this file FIRST** before starting or resuming any work item — another executor may have advanced it.
2. **Claim via the lock script — MANDATORY, atomic, race-free:**
   ```bash
   bash .planning/scripts/tracker-lock.sh claim W1 <claude|codex>              # the work item
   bash .planning/scripts/tracker-lock.sh claim lane-<system> <claude|codex>   # any shared live system you'll mutate (deploy target, prod DB, live site)
   ```
   - Exit 0 → yours, proceed. Also update the item's status line to `IN PROGRESS (<executor> <date>)`.
   - Exit 1 → **held by another agent (possibly another session of your own tool). Do NOT work this item or touch that system.** Pick a different unclaimed item, or stop and report.
   - Exit 2 → stale (>6h with no heartbeat, likely dead session). Steal ONLY if certain no other agent is mid-mutation: `tracker-lock.sh steal <name> <executor>`.
   - Lock names: letters/digits/`._-` only, no slashes.
3. **Heartbeat long work:** if a batch runs longer than ~1h, run `tracker-lock.sh touch <name> <executor>` at least hourly — otherwise your live lock goes stale at 6h and becomes stealable mid-mutation.
4. **Release when you stop** (done, blocked, or paused): `tracker-lock.sh release <name> <executor>` for every lock you hold, and update the status line with date, executor, and a one-line result.
5. **Picking work autonomously:** take the topmost `TODO` item whose locks you can acquire. Don't work an item marked `IN PROGRESS` by another executor even if its lock is missing — UNLESS the status date is >24h old with no lock; then note the takeover in the status line and proceed.
6. **This is the ONLY task list for this repo.** Do not create or use other task stores (task-journal `.claude/tasks.json`, todo files, new tracker files). Mid-task pause state goes in the item's status line, e.g. `IN PROGRESS (claude 2026-07-10) — paused at step 3/7, next: <command>`.
7. Dates are absolute (`2026-07-10`), never "today"/"next week".
8. **Done = verified** (run it, load the page, hit the endpoint), not "code written". Say so in the status line.
9. Completed items move to the Done log at the bottom (newest first) — don't delete them.
10. New work gets a new item under Active with a fresh ID (`W<n>`) and a pointer to its plan/spec if one exists.

Status vocabulary: `TODO` · `IN PROGRESS (who, date)` · `BLOCKED (on what)` · `WAITING (until when / on what event)` · `DONE (date, verification)`.

Check what's held at any time: `bash .planning/scripts/tracker-lock.sh status`. Locks live in the shared `.git/tracker-locks/` (one namespace across all worktrees; never committed). Identity is executor + session, so two concurrent sessions of the same tool are also kept apart.

---

## Active

(no tracked items yet — add work here as W1, W2, ...)

---

## Done log (newest first)
