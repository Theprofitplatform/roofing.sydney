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

**Status:** BLOCKED (on W1 — `deploy.sh` hard-refuses without real Supabase keys) — claude 2026-08-08
**Spec:** `deploy/README.md`

Everything around the container is now done and verified (2026-08-08):

- DNS `A app.roofing.sydney → 31.97.222.218`, **DNS-only/grey cloud** (zone
  `676dca309fb89a9da458ab972ca98e21`). Resolves on 1.1.1.1 / 8.8.8.8 / 9.9.9.9.
- nginx vhost enabled, `nginx -t` clean, reloaded; `roofing.sydney` unaffected
  (still 200 through Cloudflare after the reload).
- TLS issued by Let's Encrypt, expires 2026-11-05, auto-renew scheduled.
  `http://` → 301 → `https://`, and `https://` answers **502** — correct, there
  is no container behind it yet.
- Port 9030 confirmed free; Docker 29.6.1 / Compose v5.3.1 present; 178 G free.

What remains is only `./scripts/deploy.sh`, and it cannot run yet: lines 32–34
`fail` if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
missing or empty from `.env.production`. Do **not** work around that guard with
placeholder values: the guard's own 503 is a clear, self-describing failure,
whereas a syntactically valid but fake URL sails past it and instead fails
inside `supabase.auth.getUser()` on every CRM request — an opaque 500 that
looks like an outage. A fake-key deploy would prove the Dockerfile builds and
nothing else.

**Clone target:** `~/roofing-app`, **not** `~/roofing.sydney` — see W3.

**Trap:** `NEXT_PUBLIC_*` values must be passed as Docker **build args**, not
just runtime env — they are inlined into the client and middleware bundles at
build time. Supplying them only at runtime leaves middleware undefined and
every CRM request 503s.

**Done means:** `curl https://app.roofing.sydney/api/health` returns healthy
and `/login` renders, with `roofing.sydney` unchanged.

### W3 — Reconcile the live public site with git, and supervise it

**Status:** TODO — raised by claude 2026-08-08
**Spec:** `deploy/README.md` § "How the public site is actually served"

`deploy/README.md` claimed the public site was on Vercel. It is not: it is this
same VPS, nginx `roofing.sydney` → `127.0.0.1:3402`, served by a hand-started
`next-server` (pid 1993359) out of `~/roofing.sydney` with **no pm2 entry and
no systemd unit** — it does not survive a reboot.

That checkout is 23 commits behind `main` (at `63c5ae6`) with a dirty working
tree on top. It was snapshotted 2026-08-08 to `rescue/vps-live-site-2026-08-08`
(commit `eb9d63c`, pushed) before anything else was touched.

**The snapshot turned out to be unnecessary, and the first read of it was
wrong.** The dirty tree measures 466 lines only against the stale `63c5ae6`.
Against `main` the live site differs by **4 files, +36/−102**, and every
difference is `main` being newer — `SiteNav` extracted, `next/link` for raw
anchors, the `/preview` route, an explicit font stack against a pre-hydration
serif flash, ~89 lines of `redesign.css` theming. The uncommitted work was an
earlier draft of changes since committed properly. Nothing exists only on the
box; there is nothing in the rescue branch to merge. Keep it as a snapshot.

So the live site is **behind** `main`, not ahead, and `git pull` there is safe.
Verified safe to run `main` on the public host without Supabase: `middleware.ts`
returns at the `!isCrmHost(host)` branch (line 81) before any Supabase client is
constructed, so the public site does not need the CRM's env at all.

What actually needs doing:

1. Bring `~/roofing.sydney` to `origin/main` and rebuild.
2. Put it under supervision — pm2 or a systemd unit. Best option is to retire
   the loose `next-server` entirely and serve the public site from the CRM
   container: add a second vhost per the comment at the foot of
   `deploy/nginx/app.roofing.sydney.conf`. That waits on W2.

**Not started — this restarts the live marketing site**, so it wants a chosen
moment rather than being folded into unrelated work.

**Done means:** roofing.sydney serves from a supervised process at a commit
that exists on `origin/main`, and survives `sudo reboot`.

---

## Done log (newest first)

### W0 — Merge the CRM branch to main

**Status:** DONE (2026-08-06, verified) — claude
PR #2 (`feat/crm-phase-0`, 15 commits, 212 files, +36,139/−84) merged as
`9389477`. Verified before merging in a throwaway worktree: `tsc --noEmit`
clean, 348 unit tests, 132 PGlite DB tests, `next build` 35 routes, public
marketing site untouched. Merge commit preserved all 15 phase commits; the
branch was kept, not deleted. Nothing deployed — `main` does not auto-deploy.
