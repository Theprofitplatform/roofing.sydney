---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Phase 1 ready to execute — blocked on Nearmap credentials
last_updated: "2026-08-08T00:00:00.000Z"
last_activity: 2026-08-08
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 3
  completed_plans: 1
  percent: 25
---

# Project State — Roofing Sydney AI Roof Visualizer

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-23)

**Core value:** A homeowner can see exactly what their home will look like with a new roof — accurately segmented, photorealistic — before committing to a quote.

**Current focus:** Phase 1 — High-Res Imagery

---

## Status

**Milestone:** v1 — AI Roof Visualization Uplift
**Phase:** 1 of 4 complete (Phase 4 — human UAT pending)
**Progress:** ██░░░░░░░░ 25%

> **This milestone has not advanced since 2026-04-25.** The 25% is accurate.
> The work that happened in between belongs to a parallel track — see
> *Parallel Track: Operator CRM* below — which is not part of this roadmap and
> deliberately does not count toward this percentage.

---

## Parallel Track: Operator CRM (not part of this milestone)

Planned in `docs/roofing-crm-build-plan.md`, outside GSD. Tracked day-to-day in
`.planning/TRACKER.md`, which is the live source of truth for it.

**Status as of 2026-08-08:** all ten phases merged to `main` — PR #2
(`feat/crm-phase-0`, 15 commits, 212 files, +36,139/−84), merge commit
`9389477`. Verified before merge: `tsc --noEmit` clean, 348 unit tests, 132
PGlite database tests, `next build` 35 routes.

**Not yet live.** Nothing has run against a real database and the Dockerfile has
never been built. `TRACKER.md` W1 (provision Supabase) and W2 (first VPS deploy)
are both BLOCKED. Merging to `main` deployed nothing — production is a manual
`./scripts/deploy.sh` on the VPS.

**What it changed in this repo, that the AI phases need to know:**

- `src/middleware.ts` now routes on the `Host` header — `app.roofing.sydney`
  renders `src/app/crm`, everything else renders the public marketing site the
  visualiser lives on. Phases 1–3 all operate on the public host and are
  unaffected, but any new route must now be reachable on the right host.
- `NEXT_PUBLIC_*` env vars are inlined into the client **and middleware**
  bundles at build time. They must be exported before `npm run build` and
  passed as Docker **build args** — supplied only at runtime, middleware gets
  `undefined` and every request 503s. This applies to any new
  `NEXT_PUBLIC_*` var Phases 1–3 introduce.
- The public marketing site was not otherwise touched.

---

## Phase Tracker

| # | Phase | Status | Plans |
|---|-------|--------|-------|
| 1 | High-Res Imagery | Ready to execute | 2 |
| 2 | AI Segmentation | Not started | — |
| 3 | AI Render + UX Polish | Not started | — |
| 4 | Main Site Rebrand + CTA | ✓ Complete (human UAT pending) | 1/1 |

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-23 | Nearmap pay-per-site for imagery | Licensed for AI use, 15cm/pixel AU, ~$8 AUD/property |
| 2026-04-23 | SAM-2 via Replicate for segmentation | $0.021/run, was already in codebase |
| 2026-04-23 | FLUX.1 Fill via fal.ai for render | $0.05/image, best structure-preserving inpainting available |
| 2026-04-23 | YOLO mode, coarse granularity | Fast iteration, developer-led project |
| 2026-08-06 | Merge the CRM to `main` before Supabase exists | `main` does not auto-deploy (no CI workflows; Coolify tracks `staging`; prod is a manual VPS script), so merging is cheap and reversible via `git revert -m 1 9389477`. Keeping a 36k-line branch open longer would only accrue drift against the marketing site. |
| 2026-08-06 | Merge commit, not squash | The 15 commits are one-per-phase and carry the reasoning; squashing would flatten a build plan into one opaque diff. |
| 2026-08-06 | Keep `feat/crm-phase-0` after merging | Nothing has run against a live database yet; the branch stays until W1/W2 pass. |

---

## Session Continuity

**Last activity:** 2026-08-08
**Stopped at:** CRM merged to `main` (parallel track, see above). This milestone
is untouched since 2026-04-25 — Phase 1 is planned but never executed.
**Next action:** Phase 1 is blocked on a Nearmap pay-per-site account. Two
things gate it, and one of them is now shared with the CRM:

1. Nearmap API credentials — still unanswered since 2026-04-23.
2. **A Supabase project** — Phase 1 caches Nearmap images in a Supabase Storage
   bucket (`nearmap-images`), and the CRM's `TRACKER.md` W1 provisions Supabase
   for the same repo. Doing W1 unblocks the caching half of Phase 1 for free.
   Provision once, use for both.

With credentials in hand: `/gsd:execute-phase 1`. Also still outstanding from
April — send `docs/client-intake.md` to the client.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260425-5vu | Light theme hero cream background | 2026-04-25 | be4d24c | [260425-5vu](./quick/260425-5vu-change-light-theme-hero-section-backgrou/) |
| 260425-hkq | AU roofing research + client intake + prod checklist | 2026-04-25 | — | [260425-hkq](./quick/260425-hkq-research-au-roofing-website-best-practic/) |

---

## Accumulated Context

### Roadmap Evolution

- Phase 4 added: Main Site Rebrand + CTA — rename to Australian Roofing Contractors, metal roofing only, add "Check My Roof Design" CTA → roofing.sydney (independent of AI phases)
- 2026-08-06: the operator CRM landed on `main` as a parallel track, not a
  roadmap phase. It was planned separately in `docs/roofing-crm-build-plan.md`
  and never entered this ROADMAP, so no phase numbers changed and the milestone
  percentage is unaffected. If the CRM is ever brought under GSD it needs its
  own milestone, not phases appended to v1.

---

## Open Questions

- Nearmap pay-per-site account: does developer have API credentials yet?
  (Open since 2026-04-23 — this is what Phase 1 is actually blocked on.)
- fal.ai: trial credits available on signup — use those for FLUX.1 Fill testing
- Replicate: `REPLICATE_API_TOKEN` may already be in `.env` (was used for old SAM-2 integration)
- Supabase: one project now serves both tracks — the CRM's schema and Phase 1's
  `nearmap-images` cache bucket. Confirm the bucket is created alongside the
  CRM's `quotes` bucket when W1 is worked, so Phase 1 does not need a second
  provisioning round.
- Does this milestone still have a sponsor? It has sat untouched since
  2026-04-25 while all effort went to the CRM. Worth an explicit decision to
  resume or retire rather than leaving it nominally "in_progress".
