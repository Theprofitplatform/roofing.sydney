# Australian Roofing Contractors — CRM build plan

**Target:** `app.roofing.sydney` — operator CRM, Dockerised, on the existing VPS
**Public site:** `roofing.sydney` — unchanged, becomes the top of the funnel
**Source of truth for features:** `docs/quoting-system-feature-plan.md` (gap analysis)
**Design reference:** `design-reference/quoting-tool/` (working prototype, all 5 screens verified)

---

## Decisions locked

| # | Decision | Consequence |
|---|---|---|
| 1 | **Full CRM incl. invoicing & payments** | Money-in column is in scope: invoices, deposits, Stripe, Xero export |
| 2 | **Supabase cloud + Dockerised Next.js** | Managed Postgres/Auth/Storage/backups; we containerise only the app |
| 3 | **Single owner login, roles-ready schema** | John logs in; `users`/`role` columns and RLS written for a team, one account exists |
| 4 | **One repo, route group + middleware** | `src/app/(crm)/**` served on `app.roofing.sydney`; one build, one container |

### One flag on decision 1

Your own gap analysis argues against rebuilding what Xero already does — and I agree with it. Invoicing, payment reconciliation and AR aging are a large build whose main beneficiary is a business billing many customers the same amount monthly, which a roofer is not.

I've planned it in full as asked. What I've done to de-risk it: **money lands last (Phase 8)** and depends on nothing upstream. Phases 0–7 deliver a complete lead→quote→accept→job→completion system that works with Xero doing the invoicing. If Phase 8 never happens, nothing before it is wasted or half-built. That keeps the call reversible at the point where you'll have the most information — after John has used the thing for a month.

---

## Target architecture

```
                    roofing.sydney            app.roofing.sydney
                    (public, marketing)       (CRM, authed)
                          │                         │
                          └────────┬────────────────┘
                                   │
                          nginx (host, TLS via certbot)
                                   │
                          127.0.0.1:9030
                                   │
                    ┌──────────────────────────┐
                    │  Docker: roofing-app     │
                    │  Next.js 15 standalone   │
                    │  node:22-alpine, nonroot │
                    └──────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
        Supabase cloud        Resend            Stripe (Phase 8)
        Postgres/Auth/Storage  email             deposits
```

**Host routing.** One Next.js app, two hostnames. `middleware.ts` reads the `Host` header and rewrites `app.roofing.sydney/*` into the `(crm)` route group, everything else into `(public)`. Auth is enforced in the same middleware — unauthenticated CRM requests redirect to `/login`; the client portal (`/q/[token]`) is explicitly exempt.

Why one app rather than two: the highest-value integration in the whole plan is the public lead form writing straight into the CRM pipeline. In one app that's a function call and a shared type. Across two deployments it's a contract you have to version.

---

## Data model

Everything money is **integer cents**. Field names match the prototype so the React screens port with near-zero churn.

```sql
-- ── Identity ────────────────────────────────────────────────────────────
create table users (               -- mirrors auth.users
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'owner'
    check (role in ('owner','estimator','crew','readonly')),
  created_at timestamptz not null default now()
);

-- ── CRM core ────────────────────────────────────────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, email text,
  property_address text,
  lat double precision, lng double precision,
  source text,                     -- 'web' | 'referral' | 'phone' | ...
  lead_id uuid references leads(id),   -- provenance from the public site
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create table pipeline_stages (     -- seeded, reorderable
  id text primary key,             -- enquiry|qualified|visit_booked|quoted|won|lost
  label text not null, sort int not null, is_terminal bool default false
);

create table opportunities (       -- the "job" as a sales object
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  stage_id text not null references pipeline_stages(id) default 'enquiry',
  title text, roof_type text,
  lost_reason text                 -- price|timing|went_elsewhere|no_response|cancelled
    check (lost_reason is null or lost_reason in
      ('price','timing','went_elsewhere','no_response','cancelled')),
  visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activities (          -- contact log + tasks, one table
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  kind text not null,              -- note|call|email|sms|visit|task
  body text,
  due_at timestamptz, done_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

-- ── Quoting ─────────────────────────────────────────────────────────────
create sequence quote_number_seq start 8;   -- prototype ends at Q-2026-0007

create table quotes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  client_id uuid not null references clients(id),
  quote_number text unique,        -- null until issued; drawn from sequence
  status text not null default 'draft'
    check (status in ('draft','sent','viewed','accepted','declined','expired','superseded')),
  parent_quote_id uuid references quotes(id),   -- revision lineage
  version int not null default 1,
  roof_type text, notes text,
  valid_days int not null default 30,
  show_breakdown bool not null default true,
  pdf_layout text not null default 'classic',
  margin_pct numeric(5,2) not null default 20,
  gst_enabled bool not null default false,
  gst_rate numeric(5,2) not null default 10,
  include_photos bool not null default false,
  subtotal_cents bigint, total_cents bigint,    -- frozen on issue
  pdf_path text,                                -- Supabase Storage object
  portal_token text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz, viewed_at timestamptz,
  accepted_at timestamptz, declined_at timestamptz,
  signed_name text, signed_at timestamptz, signed_ip inet,
  created_by uuid references users(id)
);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  kind text not null check (kind in ('material','labour')),
  description text not null,
  qty numeric(12,3) not null default 1,
  unit text not null default 'ea',
  unit_cost_cents bigint not null default 0,
  is_optional bool not null default false,     -- client-selectable extra
  tier text,                                   -- null|good|better|best
  sort int not null default 0
);

create table quote_clauses (       -- resolved text, copied at issue
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  kind text not null check (kind in ('inclusion','exclusion')),
  text text not null, sort int not null default 0
);

create table quote_photos (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  storage_path text not null, caption text, sort int not null default 0
);

-- ── Libraries ───────────────────────────────────────────────────────────
create table price_book (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('material','labour')),
  category text not null, description text not null,
  unit text not null, unit_cost_cents bigint not null,
  supplier text, supplier_sku text,
  cost_updated_at timestamptz not null default now(),   -- staleness flag
  archived_at timestamptz
);

create table snippets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('inclusion','exclusion')),
  text text not null, is_default bool not null default false
);

create table job_templates (       -- was hardcoded window.ARC_TEMPLATES
  id uuid primary key default gen_random_uuid(),
  label text not null, sub text, icon text,
  roof_type text, valid_days int, margin_pct numeric(5,2),
  show_breakdown bool default true, notes text,
  payload jsonb not null           -- line items
);

create table settings (            -- single row
  id int primary key default 1 check (id = 1),
  business_name text, legal_name text, owner_name text,
  licence_no text, abn text, acn text,
  phone text, email text, site text, address text,
  logo_path text,
  gst_registered bool not null default false,   -- master switch
  gst_rate numeric(5,2) not null default 10,
  deposit_enabled bool not null default false,
  deposit_pct numeric(5,2) not null default 10,
  default_margin_pct numeric(5,2) not null default 20,
  default_valid_days int not null default 30,
  margin_floor_pct numeric(5,2) not null default 15,
  follow_up_days int not null default 7,
  payment_terms text               -- owner-supplied. NOT generated.
);

-- ── Operations (Phase 7) ────────────────────────────────────────────────
create table jobs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id),
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','on_hold','complete','cancelled')),
  scheduled_start date, scheduled_end date,
  completed_at timestamptz, crew_notes text
);

create table variations (          -- exclusions text promises these
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  quote_id uuid references quotes(id),          -- variation raised as its own quote
  reason text, created_at timestamptz not null default now()
);

-- ── Money (Phase 8) ─────────────────────────────────────────────────────
create table invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  quote_id uuid references quotes(id),
  invoice_number text unique,
  kind text not null check (kind in ('deposit','progress','final')),
  status text not null default 'draft'
    check (status in ('draft','sent','part_paid','paid','void')),
  total_cents bigint not null,
  due_at date, sent_at timestamptz, paid_at timestamptz,
  stripe_payment_intent text, xero_invoice_id text
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount_cents bigint not null,
  method text not null check (method in ('stripe','bank_transfer','cash','other')),
  reference text, received_at timestamptz not null default now()
);
```

### Two constraints enforced in the database, not the app

**Immutability after issue.** A sent quote must not silently change, or the PDF in the client's inbox stops matching your record with no trace. A `before update` trigger on `quotes` rejects any change to a non-status column once `sent_at is not null`. Allowed set: `status`, `viewed_at`, `accepted_at`, `declined_at`, `signed_*`, `pdf_path`. Revising means raising `-v2` with a `parent_quote_id`. Enforced in Postgres so it holds regardless of which client wrote it.

**Quote numbers.** `nextval('quote_number_seq')` drawn **only on issue**, formatted `Q-YYYY-NNNN`. Drafts display `DRAFT`. This kills both the two-tab collision and the holes abandoned drafts punch in the numbering.

### RLS

Every table gets RLS on with real policies from day one — not the current write-only `leads` pattern, which works only because nothing reads it. Shape:

- Staff tables: `using (auth.uid() in (select id from users))`, writes gated on `role`.
- `leads`: public form keeps its service-role insert path; CRM reads via authed policy.
- Client portal: **no Supabase session**. `/q/[token]` resolves a high-entropy `portal_token` server-side and returns only that quote's data through a service-role query. Homeowners never get an account — accounts are friction at exactly the moment you want a signature.

---

## Phases

Infrastructure comes first so every subsequent phase ships to a real URL the day it's written.

| # | Phase | Delivers | Depends on |
|---|---|---|---|
| 0 | Docker + deploy | `app.roofing.sydney` live, TLS, CI deploy, authed empty shell | — |
| 1 | Schema + auth + RLS | All tables, policies, triggers, seed migration | 0 |
| 2 | Port the prototype | 5 screens on React 19 + Supabase, cost/margin model intact | 1 |
| 3 | Issue discipline | Numbering, lock-on-issue, stored PDF, real Resend send | 2 |
| 4 | Client portal | Magic link, `viewed_at`, accept/decline, e-signature | 3 |
| 5 | CRM core | Lead→pipeline wiring, activities, outcomes, loss reasons | 2 |
| 6 | Sales leverage | Revisions, tiers, optional extras, template CRUD, price staleness | 3 |
| 7 | Operations | Jobs, scheduling, completion, variations | 4 |
| 8 | Money | Invoices, deposits, Stripe, Xero export | 7 |
| 9 | Reporting | Win rate, pipeline value, margin achieved, conversion by type | 5 |

---

### Phase 0 — Docker + deploy

Get the pipe working before there's anything in it.

**Deliverables**
- `output: "standalone"` in `next.config.ts`; multi-stage `Dockerfile` on `node:22-alpine`, non-root `nextjs` user, `HEALTHCHECK` on `/api/health`
- `compose.yml` binding `127.0.0.1:9030:3000` — container never faces the internet directly
- `middleware.ts` host split: `app.roofing.sydney` → `(crm)`, else `(public)`
- nginx vhost `app.roofing.sydney` → `127.0.0.1:9030`, certbot TLS
- `/login` with Supabase Auth email magic link; authed shell renders the sidebar and nothing else
- Deploy script following your existing VPS conventions

**The Docker trap to get right on day one.** `NEXT_PUBLIC_*` values are inlined at *build* time, not read at runtime. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` must be passed as `--build-arg`, and the image is therefore environment-specific. Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REPLICATE_API_TOKEN`, later `STRIPE_SECRET_KEY`) stay runtime env and never enter the image. Getting this backwards bakes a service-role key into a layer.

**Port note.** 9030 is a proposal — verify nothing is listening before wiring nginx. Your VPS has a documented history of port drift causing 502s; check the live listener, don't trust this document.

**Success criteria**
1. `https://app.roofing.sydney` serves the CRM shell over valid TLS
2. `https://roofing.sydney` is byte-identical to today
3. Unauthenticated CRM request redirects to `/login`; magic link round-trips
4. `docker compose up -d` on a clean host reproduces the deploy from the repo alone

---

### Phase 1 — Schema + auth + RLS

**Deliverables**
- Migrations for every table above, in `supabase/migrations/`
- `pipeline_stages`, `snippets`, `price_book`, `job_templates`, `settings` seeded from `design-reference/quoting-tool/app/data.js`
- RLS policies on all tables; `users` row auto-created on first sign-in
- The two triggers: issue-lock, and `updated_at` maintenance
- `src/lib/db/` typed query layer — generated Supabase types, one module per entity

**Success criteria**
1. Anon key can read nothing outside the public lead insert path — verified by a test that asserts denial
2. Issue-lock trigger rejects an edit to a sent quote (test asserts the throw)
3. Concurrent issue of two quotes yields two distinct numbers (test asserts no collision)
4. Seeded price book and clauses match the prototype exactly

---

### Phase 2 — Port the prototype

The React component code ports largely as-is. What changes: `window.ARC_*` globals become Supabase queries, the 9 modules become ES modules, Babel leaves the browser, and `localStorage` state becomes server state.

**Deliverables**
- Quotes list, Builder, Quote view, Clients, Settings as Next.js routes under `(crm)`
- The cost-in/margin-out engine ported verbatim — this is the thing worth keeping, and it is the one thing generic CRMs get wrong
- Price book picker, area calculator, clause checklist, photo upload → Supabase Storage
- Design tokens folded into the existing Tailwind 4 setup (prototype CSS is already the same OKLCH system)
- `margin_floor_pct` warning preserved

**Explicitly not ported:** `TweaksPanel`, `/*EDITMODE-*/` markers, in-browser Babel, the theme/accent/density switcher.

**Success criteria**
1. Every prototype screen reachable and functional against real data
2. A quote built in the CRM produces byte-comparable totals to the prototype for identical inputs
3. Refresh, second browser and second device all show the same quotes — the `localStorage` failure mode is gone
4. Tests: happy path; edge cases (`margin_pct: 0`, GST off, zero line items); failure (save without client must fail)

---

### Phase 3 — Issue discipline

Everything that must be true before a document leaves the building.

**Deliverables**
- Issue action: draw number, freeze `subtotal_cents`/`total_cents`, snapshot clauses, flip to `sent`
- Server-side PDF render (`@react-pdf/renderer` or headless Chromium) stored in Supabase Storage at `pdf_path` — an artefact, not a live re-render
- Real Resend send. **Commit `sent` first, then attempt mail inside try/catch.** On mail failure report "issued as Q-2026-0008 but the email failed" rather than 500-ing an already-issued document
- Both PDF layouts preserved

**Success criteria**
1. Issued quote has an immutable stored PDF that reproduces exactly what the client received
2. Forcing a Resend failure leaves the quote issued and surfaces an accurate error
3. Editing an issued quote is rejected at the database layer
4. GST off and GST on both reconcile: printed line items sum to the printed total

---

### Phase 4 — Client portal

The single biggest commercial win available, and the thing that activates the follow-up engine already written in the prototype.

**Deliverables**
- `/q/[token]` — hosted quote page, no login, rate-limited
- First open sets `viewed_at` (which is currently sample data that nothing ever writes — without this, every sent quote flags as needing follow-up forever)
- Accept / Decline with `signed_name` + `signed_at` + `signed_ip` written **in the same transaction as the accept** — that atomicity is the legal artefact, don't split the writes
- Server-side guard: an expired quote cannot be accepted. A guard, not a hidden button
- Accept fires notification to John

**Success criteria**
1. Opening the link sets `viewed_at` once; the follow-up nudge clears
2. Accept writes signature fields atomically — a partial write is impossible
3. Accepting an expired quote is refused server-side (test asserts the throw)
4. Token is high-entropy, single-quote scoped, and leaks nothing about other records

---

### Phase 5 — CRM core

This is where it stops being a quoting tool.

**Deliverables**
- Public lead form writes `leads` → auto-creates `clients` + `opportunities` at `enquiry`. Currently the website's leads table is completely disconnected from quoting; this is the highest-value integration in the plan and neither app has it today
- Pipeline board: enquiry → qualified → visit booked → quoted → won/lost, one-tap advance
- **Outcomes** — mark accepted/declined with a required loss reason. The prototype renders an "Accepted" badge that nothing ever sets, so the tool currently cannot tell you whether you won
- Activities: call notes, site observations, tasks with due dates, "open tasks" view
- Follow-up actions wired to the existing nudges — one-click templated follow-up email, snooze, logged contact

**Success criteria**
1. A submission on `roofing.sydney` appears as a pipeline card within seconds
2. Every quote reaches a terminal outcome; `lost` requires a reason
3. Open-tasks view drives the day; nudges lead to an action, not a shrug
4. Per-client history shows every call, email and visit

---

### Phase 6 — Sales leverage

**Deliverables**
- **Revisions**: `Q-2026-0007` → `-v2`, parent pointer, prior marked `superseded`, both on one opportunity. The necessary companion to lock-on-issue — immutability is only tolerable if revising is one click
- **Good/better/best tiers** and **client-selectable optional extras** with a live portal total. For a re-roofing business this is likely the highest-revenue feature in the list — it moves the conversation from "is this too expensive" to "which one"
- Template CRUD + "save this quote as a template"
- Price book: `cost_updated_at` staleness flag in the picker, bulk uplift ("+6% on all Sheet roofing"), supplier/SKU. `margin_floor_pct` will not catch stale costs — it tests the margin, not whether the underlying cost is real

**Success criteria**
1. Revising an issued quote produces a linked `-v2` and supersedes the parent
2. Portal tier/extra selection updates the total live and records the client's choice
3. Price book items older than a threshold are flagged at point of use
4. A quote can be saved as a template and reused

---

### Phase 7 — Operations

**Deliverables**
- Accepted quote → `job`, scheduled dates, status through to completion
- Variations raised as child quotes against the job — the exclusions wording already promises "will be quoted as a variation", so the document currently commits to a workflow the tool cannot perform
- Completion sign-off, crew notes, non-photo attachments (engineer's report, colour sheet, warranty)

**Success criteria**
1. Accepting a quote creates a job with no manual re-entry
2. A variation is traceable to its parent job and quote
3. Completed jobs carry a signed-off record

---

### Phase 8 — Money *(deferrable — see the flag at the top)*

**Deliverables**
- Invoices: deposit on acceptance, progress claims, final. The deposit is already *printed* on the PDF with no way to take the money
- Stripe (AU) payment links — anonymous signed link where the signature is the credential
- Payment recording incl. manual bank transfer, part-payment
- Xero export of accepted quotes and invoices

**Success criteria**
1. Accepting a quote with deposits enabled raises the deposit invoice automatically
2. A Stripe payment marks the invoice paid via verified webhook, idempotently
3. Manual payments and part-payments reconcile correctly
4. Xero export produces a line-item payload Xero accepts

---

### Phase 9 — Reporting

Win rate, average quote value, quoted-vs-achieved margin, pipeline value by month, conversion by job type and lead source. Nearly all of it unlocks the moment Phase 5's outcomes exist. Until then you are quoting blind — no feedback on whether 22% on re-roofs is winning or losing work.

---

## Costs

| Item | Cost | Note |
|---|---|---|
| Supabase | $0 → $25/mo | Free tier fine to start; Pro when storage/backups matter |
| VPS | $0 marginal | Existing box, one more container |
| Resend | $0 → $20/mo | 100 emails/day free |
| Stripe | 1.7% + $0.30 AU | Phase 8 only, per transaction |
| Domain/TLS | $0 | certbot |
| Replicate SAM-2 | ~$0.021/run | Existing, scales with quote volume |
| Nearmap | ~$8/property | If the measurement feature goes live — cost this before shipping it |

Phases 0–7 add roughly **$0–45/month**. The paid-API line items scale with volume and deserve a cap before the aerial-measurement feature ships.

---

## Risks

| Risk | Mitigation |
|---|---|
| `NEXT_PUBLIC_*` baked into image; service-role key leaked into a layer | Build args for public vars only; secrets runtime-only; scan the built image in Phase 0 |
| RLS misconfigured — CRM data readable by anon | Policies from day one, plus a test that asserts anon denial per table |
| Port drift causing 502 | Verify live listener before wiring nginx; your VPS has a documented history of exactly this |
| Scope creep via Phase 8 | Hard dependency ordering; nothing upstream depends on money |
| Prototype's `localStorage` habits surviving the port | Phase 2 success criterion 3 tests cross-device explicitly |
| Payment terms wording | Ships as an explicit placeholder. Owner-supplied or professionally reviewed against the NSW Home Building Act — never generated. This discipline exists in the prototype; it survives the rewrite |

---

## Open questions

1. **GST direction.** The business is not GST-registered today. When it is: exclusive-add (trade norm, current model) or inclusive (what homeowners read)? `gst_registered` becomes the master switch either way and the rate moves to settings — but the direction is a deliberate choice, not a default.
2. **Does John invoice at all, or only quote?** If he invoices in Xero, Phase 8 collapses to an export and the money column disappears. Worth settling before Phase 7 finishes.
3. **Aerial roof measurement.** SAM-2 segmentation already runs on the public site; `roof-editor.tsx` computes no area at all. Polygon → m² needs metres-per-pixel from zoom + latitude plus a pitch multiplier. High value, meaningful API cost — its own phase once the core lands.
4. **Nearmap account** — still open from the existing roadmap; blocks the imagery phases there.

---

## Relationship to the existing GSD roadmap

`.planning/ROADMAP.md` tracks v1 — AI Roof Visualisation (Phase 1 of 4 complete). That milestone is about the **public** site's visualiser and is independent of this work; they share only the `leads` table, which Phase 5 reads. Recommended: land this as milestone **v2 — Operator CRM**, run it in parallel, and let the visualiser milestone continue on its own track.

---

*Plan created 2026-08-06. Decisions 1–4 locked with the client; Phase 8 flagged deferrable.*
