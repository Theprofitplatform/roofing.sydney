# roofing.sydney — production ↔ git divergence report

**THE-354** (Codex Wave 2 Lane H) · anchor **THE-85** / **THE-84**
Captured 2026-07-27. All VPS access **read-only**; nothing on the VPS was modified.

## Headline

**The source divergence THE-85 was raised for no longer exists.** The production
tree is byte-for-byte identical to git `main`, on a **different remote** than the
board records. The residual gaps are (1) the pm2 deploy manifest, (2) two stale
lookalike trees/repos that still hold the old divergence, and (3) dead source that
is in git but not rendered.

## The remote moved — this is why the board thinks it's still diverged

| | Board's record (THE-85) | Verified 2026-07-27 |
|---|---|---|
| Prod `origin` | `github.com/Avi977/roofing.sydney` | `github.com/Theprofitplatform/roofing.sydney` |
| Push blocker | Theprofitplatform has `push: false` on Avi977's repo | Resolved by **moving to the org repo**, not by granting collaborator access |
| Prod HEAD | `9b87052`, unpushed | `451ad0c`, **pushed and equal to `origin/main`** |

The 2026-07-26 verification comment on THE-85 (`pushed_at: 2026-05-11`, "nothing
pushed in 2.5 months", "live has `navtoggle`, git has 0") checked
`Avi977/roofing.sydney`. That repo is now **abandoned** — still at `63c5ae6`, three
commits behind. The check was accurate about that repo and wrong about production.

## Proof that prod source == git

Run on the VPS against `/home/clawdbot/roofing.sydney`:

```
$ git diff HEAD --stat | wc -l               → 0     (no modified tracked files)
$ git status --porcelain -uall | wc -l       → 0     (no untracked files at all)
$ git rev-parse HEAD origin/main
451ad0c2f6596a0dcde827af10727384cc1d5e07
451ad0c2f6596a0dcde827af10727384cc1d5e07             (identical)
$ git ls-remote origin refs/heads/main
451ad0c2f6596a0dcde827af10727384cc1d5e07             (matches GitHub)
$ git ls-files | wc -l                       → 126
```

`status -uall` returning zero is the strong claim: **every** file in the production
tree is either tracked-and-unmodified or gitignored. There is no untracked source.

## File by file

### What production has that git does not

Only gitignored artefacts — nothing was withheld from the branch that belongs in it.

| Path | Class | Committed here? | Why |
|---|---|---|---|
| `.env.local` | **Secrets** — 14 keys incl. Mapbox, Nearmap, Replicate, Gemini, Supabase service-role, Resend | **No — never** | Matched by `.env*` in `.gitignore`; mode `0600`. Key *names* only are listed below; no value was read into any artefact. |
| `.next/` | Build output (built 2026-07-18 11:25:38 UTC) | No | `/.next/` gitignored |
| `node_modules/` | Dependencies | No | gitignored; `package-lock.json` is tracked |
| `next-env.d.ts` | Next.js generated types | No | generated at build |
| `tsconfig.tsbuildinfo` | TS incremental cache | No | `*.tsbuildinfo` gitignored |
| `ecosystem.config.cjs` | **pm2 deploy manifest** | **Yes — this PR** | Did not exist on disk; reconstructed from the live pm2 process (see below) |

Secret key names present in `.env.local` (names only, deliberately no values):
`NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_CONTACT_PHONE`, `TILE_PROVIDER`,
`MAPBOX_ACCESS_TOKEN`, `NEARMAP_API_KEY`, `REPLICATE_API_TOKEN`, `GEMINI_API_KEY`,
`N8N_WEBHOOK_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `LEAD_NOTIFICATION_FROM`,
`CONTRACTOR_NOTIFICATION_EMAIL`. `.env.example` is tracked and carries no values.

### What git has that production does not render

`src/components/home/HeroBand.tsx` is **defined and exported but imported nowhere**
(`grep -rn HeroBand src` matches only its own definition). `src/app/page.tsx` imports
`SiteNav`, `HeroSlideshow`, `HouseColourViz`, `QuoteForm` — not `HeroBand`.

This is why live serves zero occurrences of "satellite" while the file still contains
the over-promising copy THE-84 was raised for:

- `HeroBand.tsx:84` — "Drop your address to see your home from satellite and paint the roof"
- `HeroBand.tsx:140` — "We'll fetch a satellite view and let you repaint the roof…"

Remaining `satellite` matches are legitimate: `api/tiles/[z]/[x]/[y]/route.ts`
(Mapbox tile URL), `privacy/page.tsx` (accurate disclosure), `RoofSwatchViz.tsx`
("Satellite view · roof recoloured in real time" — also in an unrendered component).

**Not fixed here.** Deleting dead components is a separate change; this lane is
capture-and-propose. Flagged to THE-84.

### The deploy manifest — the one real prod-only artefact

pm2 runs `roofing-sydney` from an ad-hoc invocation; the config lives only in
`/home/clawdbot/.pm2/dump.pm2`, so a rebuilt VPS could not reproduce the deploy.
`ecosystem.config.cjs` in this PR is a **field-for-field capture** of the running
process, read from `pm2 jlist`:

| Field | Live process | Manifest |
|---|---|---|
| `name` | `roofing-sydney` | ✅ same |
| `pm_cwd` | `/home/clawdbot/roofing.sydney` | ✅ same |
| `pm_exec_path` | `…/node_modules/next/dist/bin/next` | ✅ same (relative to `cwd`) |
| `args` | `['start']` | ✅ same |
| `exec_mode` | `fork_mode` | ✅ `fork` |
| `autorestart` | `true` | ✅ same |
| `max_memory_restart` | `629145600` (600 MB) | ✅ `600M` |
| `env.PORT` | `3402` | ✅ same |
| `env.NODE_ENV` | `production` | ✅ same |

Only `time: true` (log timestamps) is not readable from `jlist` and is carried over
from the earlier `reconcile/live-redesign` draft — cosmetic, no runtime effect.

An equivalent commit already exists **only on the VPS**, on the local branch
`reconcile/live-redesign` (`b7452af`, 2026-07-18). That branch was never pushed and
is now 3 commits behind `main`. This PR supersedes it; the VPS branch can be deleted
by an operator once merged.

## Serving topology (verified, unchanged from THE-85's correction)

```
nginx roofing.sydney / www.roofing.sydney → proxy_pass 127.0.0.1:3402
  → pm2 id 11 "roofing-sydney" (owner clawdbot, fork, next start, next@15.5.15)
  → cwd /home/clawdbot/roofing.sydney
```

`.next` was built 2026-07-18 11:25:38 UTC, ~3 minutes **before** HEAD `451ad0c`
(11:28:51 UTC). That is not staleness: `git diff --stat 3ce6b84 451ad0c` shows the
merge added only `.planning/TRACKER.md`, `.planning/scripts/tracker-lock.sh`,
`.planning/scripts/tracker-lock.test.sh`, `AGENTS.md` — **no runtime source**. The
running build is a faithful build of current `main`. pm2 uptime 2 days (restart, not
rebuild).

Live probes (Chrome UA, 2026-07-27): `/` → 200 with `navtoggle` present and zero
`satellite`; `/about` → 200; `/contact` → 200; `/preview` → **307 → `/`** (still the
dead end tracked on THE-84).

## Traps that still hold the old divergence

Both are **not served** — but either could be mistaken for production.

1. **`/home/avi/roofing.sydney`** — stale dev duplicate at `63c5ae6` with **16
   uncommitted modified files**, remote still `Avi977/roofing.sydney`. This is the
   tree THE-85 originally pointed at. Recommend the operator archive or delete it;
   while it exists, any diagnosis that lands there reproduces the old wrong answer.
2. **`github.com/Avi977/roofing.sydney`** — abandoned at `63c5ae6`, 3 behind, owned
   by a personal account. It still contains the over-promising copy in a *rendered*
   form. Recommend archiving it on GitHub so no future deploy or clone targets it.

Also note **`origin/staging`** (`05a0e7f`, "chore: coolify staging auto-deploy
canary") — one file, `.coolify-staging`, ahead of `main`. Not deployed to
production; flagged only so it is not mistaken for drift.

## What this PR does and does not do

**Does:** add `ecosystem.config.cjs` (the only prod-only non-artefact) and this
report. Two files, no runtime source touched.

**Does not:** merge, deploy, build, `npm install/ci`, restart pm2, or modify anything
on the VPS. Merging this changes no running behaviour — pm2 keeps its existing dump
until an operator explicitly reloads from the manifest.

## Recommended operator decisions (per CLAUDE.md §1/§2 — operator-only)

1. Review and merge this PR. Merging alone is safe and changes nothing live.
2. Adopt the manifest on the box, at a quiet moment:
   `cd /home/clawdbot/roofing.sydney && pm2 startOrReload ecosystem.config.cjs && pm2 save`
   — **do not** rebuild on the VPS during this; builds there get earlyoom-killed.
3. Delete the superseded VPS branch: `git -C /home/clawdbot/roofing.sydney branch -D reconcile/live-redesign`
4. Archive `Avi977/roofing.sydney` on GitHub and remove/rename `/home/avi/roofing.sydney`.
5. Update THE-85 to reflect the org-repo move, then close it — the source divergence
   it tracks is gone.
