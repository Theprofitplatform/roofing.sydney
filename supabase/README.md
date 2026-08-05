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
- anon and non-staff sessions read nothing and write nothing, per table
- readonly staff read but cannot write

Two test-only accommodations, because PGlite is not Supabase:

- `auth.users` and `auth.uid()` are stubbed in the harness.
- `pgcrypto` is unavailable in the WASM build, so `gen_random_bytes` is shimmed.
  Supabase has the real extension (`schema.sql` already depended on it).
  `gen_random_uuid()` needs no shim — it is core from PostgreSQL 13.

Tests run as the `anon` and `authenticated` roles with Supabase's grants
applied. This matters: superusers bypass RLS unconditionally, so a policy test
run as `postgres` passes vacuously and proves nothing.

## Still to wire up (later phases)

- Storage buckets for quote PDFs and site photos (Phase 3)
- `viewed_at` is written by the portal on first open (Phase 4). Until then it
  stays null, and the follow-up nudge would flag every sent quote forever.
- Lead → client → opportunity automation (Phase 5)
