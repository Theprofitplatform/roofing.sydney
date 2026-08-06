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

### W1 — Provision Supabase for the CRM

**Status:** BLOCKED (needs the account holder — no Supabase project exists) — claude 2026-08-07
**Spec:** `docs/crm-runbook.md` §1

The CRM is merged to `main` (PR #2, merge commit `9389477`) but has never run
against a live database. Provisioning is the only thing between here and a
working CRM. Steps, in order: run migrations `0001`→`0014`, then `seed.sql`,
then confirm the private `quotes` storage bucket exists (`0014` creates it if
the `storage` schema is present), then turn off email signups after John's
first sign-in.

**Done means:** the whole spine driven in one go — build a quote from a
template, issue it, open the portal link from the email in a private window,
accept it, confirm a job appears. That single path exercises issue → PDF →
storage → mail → portal → `viewed_at` → accept → job.

### W2 — First VPS deploy of app.roofing.sydney

**Status:** BLOCKED (on W1 — no point deploying against no database) — claude 2026-08-07
**Spec:** `deploy/README.md`

First run of `./scripts/deploy.sh` on the VPS; also the first real test of the
Dockerfile, which has never been built. Then the nginx vhost
(`deploy/nginx/app.roofing.sydney.conf`), then certbot once DNS resolves.

**Trap:** `NEXT_PUBLIC_*` values must be passed as Docker **build args**, not
just runtime env — they are inlined into the client and middleware bundles at
build time. Supplying them only at runtime leaves middleware undefined and
every CRM request 503s.

**Done means:** `curl https://app.roofing.sydney/api/health` returns healthy
and `/login` renders, with `roofing.sydney` unchanged.

---

## Done log (newest first)

### W0 — Merge the CRM branch to main

**Status:** DONE (2026-08-06, verified) — claude
PR #2 (`feat/crm-phase-0`, 15 commits, 212 files, +36,139/−84) merged as
`9389477`. Verified before merging in a throwaway worktree: `tsc --noEmit`
clean, 348 unit tests, 132 PGlite DB tests, `next build` 35 routes, public
marketing site untouched. Merge commit preserved all 15 phase commits; the
branch was kept, not deleted. Nothing deployed — `main` does not auto-deploy.
