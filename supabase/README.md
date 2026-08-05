# Database

## Applying to a new Supabase project

Run in order, in the SQL editor (or via `supabase db push` once the CLI is set up):

```
migrations/0001_foundation.sql    extensions, helpers, users, leads
migrations/0002_crm.sql           clients, pipeline, opportunities, activities
migrations/0003_quoting.sql       quotes, items, clauses, photos, numbering, immutability
migrations/0004_libraries.sql     price book, snippets, templates, settings
migrations/0005_operations.sql    jobs, variations
migrations/0006_money.sql         invoices, payments
migrations/0007_rls.sql           row level security for every table
migrations/0008_portal.sql        portal view/accept/decline, tiers, extras
migrations/0009_leverage.sql      revisions, price-book uplift, save-as-template
migrations/0010_operations.sql    job creation, completion, variations, attachments
migrations/0011_money.sql         invoice numbering, deposits, payment recording
migrations/0012_intake.sql        public lead → client → opportunity
seed.sql                          libraries + settings, from the prototype
```

All migrations are idempotent — re-running them is safe and changes nothing.

`schema.sql` is the **superseded** original. Do not apply it alongside the
migrations.

## Design rules

**Money is integer cents.** Never floats, anywhere, ever.

**Cost in, margin out.** `quote_items.unit_cost_cents` is what the supplier
charges. The client-facing document marks every line up by `quotes.margin_pct`,
so the printed lines reconcile to the printed total and the customer never sees
cost. A generic invoicing schema stores only a sell price and cannot express
this; it is the single most important thing to preserve.

**Issued quotes are immutable.** Once `sent_at` is set, only status, timestamps,
signature fields, `pdf_path` and `portal_token` may change. Enforced by a
trigger, not by a disabled button, so it holds no matter which client writes.
Revising means raising a child quote with `parent_quote_id` and superseding the
parent.

**Quote numbers come from a sequence, drawn on issue only.** Drafts have no
number. Two devices cannot mint `Q-2026-0008` twice, and abandoned drafts do not
punch holes in the numbering. The counter does not reset each January — the year
in the label comes from the issue date. That trades tidy per-year numbering for
a guarantee of no collisions and no reuse.

**Clauses are copied, not referenced.** `quote_clauses` stores resolved text.
Editing a snippet next year must not silently rewrite a quote sent last year.

**Payment terms are a placeholder.** For NSW licensed building work the wording
must be owner-supplied or professionally reviewed (e.g. against the Home
Building Act). Never generated.

## Storage

One **private** bucket named `quotes` holds issued PDFs, site photos and job
attachments:

```
<quote_id>/<quote_number>.pdf     issued quote artefact — written once
<quote_id>/photos/<file>          site photos
jobs/<job_id>/<file>              engineer's reports, colour sheets, warranties
```

Create it in the dashboard (Storage → New bucket → `quotes`, **not** public) or:

```sql
insert into storage.buckets (id, name, public) values ('quotes', 'quotes', false)
on conflict (id) do nothing;
```

Leave it private and add no policies. Every read goes through the service role,
which issues a short-lived signed URL — the client portal included. A public
bucket would make every quote PDF enumerable by anyone who guessed a quote id,
and a signed URL that never expires is a link that leaks.

## Provisioning checklist

1. Create the Supabase project (AU region — Sydney, `ap-southeast-2`).
2. Apply `migrations/0001` → `0012` in order, then `seed.sql`.
3. Create the private `quotes` bucket (above).
4. Auth → Providers: enable **Email**, and turn OFF "Enable email signups" once
   John's account exists. This is a single-operator tool; open signup on a magic
   link means anyone who knows the URL can request one.
5. Auth → URL Configuration: add `https://app.roofing.sydney/auth/callback` as a
   redirect URL.
6. Copy the project URL, anon key and service role key into the environment. The
   two `NEXT_PUBLIC_*` values are **build args** for Docker; the service role key
   is runtime-only and must never be a build arg — a build arg is recoverable
   from the image's layer history.
7. Sign in once. The `on_auth_user_created` trigger provisions the `public.users`
   row; without it a session exists but `is_staff()` fails closed and every read
   returns nothing.

## Testing

```bash
npm run test:db
```

Runs every migration and the seed against real PostgreSQL 18 (PGlite, in
process — no Docker or server needed) and asserts:

- all tables exist and every one has RLS enabled
- the seed matches `design-reference/quoting-tool/app/data.js` exactly
- issuing draws `Q-YYYY-NNNN`, and five concurrent issues never collide
- editing an issued quote throws; drafts stay editable
- accepting an expired quote throws; signature and status are written together
- first view stamps `viewed_at`; a second view does not move it
- revising an issued quote yields a v2 and supersedes the parent
- a deposit invoice cannot be raised twice, and a retried Stripe reference cannot
  be booked twice
- `intake_lead` run twice yields one client and one opportunity
- anon and non-staff sessions read nothing and write nothing, per table
- readonly staff read but cannot write

Tests run as the `anon` and `authenticated` roles with Supabase's grants
applied. This matters: superusers bypass RLS unconditionally, so a policy test
run as `postgres` passes vacuously and proves nothing.

Two test-only accommodations, because PGlite is not Supabase:

- `auth.users` and `auth.uid()` are stubbed in the harness.
- `pgcrypto` is unavailable in the WASM build, so `gen_random_bytes` is shimmed.
  Supabase has the real extension (`schema.sql` already depended on it).
  `gen_random_uuid()` needs no shim — it is core from PostgreSQL 13.

The application layer is covered separately by `npm test`, which additionally
exercises the calc engine, quote lifecycle flags, tier/extras scope resolution,
the reporting aggregations, the PDF renderer and the Xero export.
