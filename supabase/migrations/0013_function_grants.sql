-- ============================================================================
-- 0013 — Function privileges
--
-- RLS is only half the story. PostgreSQL grants EXECUTE on a new function to
-- PUBLIC by default, and Supabase exposes every function in `public` over
-- PostgREST as `/rest/v1/rpc/<name>`. A SECURITY DEFINER function is therefore
-- reachable by anyone holding the anon key — and it runs with the definer's
-- privileges, which is precisely the point of the exemption and precisely the
-- danger.
--
-- Two concrete exposures this closes:
--
--   1. `accept_quote` takes the accepted figure as a parameter. Left callable by
--      anon, a homeowner with their own portal token could accept at a total of
--      their choosing — and `raise_deposit_invoice` bills against that number.
--   2. Every portal function returns `public.quotes`, whose row carries
--      `margin_pct` and `subtotal_cents`. Those are the internal margin and the
--      cost basis. Returning them to an unauthenticated caller hands over the
--      cost-in/margin-out model the whole product exists to protect.
--
-- The application already calls each function through the right client
-- (src/lib/db/portal.ts uses the service role; the operator paths use the
-- signed-in session), so nothing legitimate loses access here.
-- ============================================================================

-- Supabase provisions this role; PGlite does not. Create it only if missing so
-- the migration replays in both places.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

do $$
declare
  fn text;

  -- Reachable only through the service role: the client portal (the homeowner
  -- has no session, the token is the credential) and the public lead intake.
  service_only text[] := array[
    'public.record_quote_view(text)',
    'public.decline_quote(text, text)',
    'public.accept_quote(text, text, inet, uuid[], text, bigint)',
    'public.intake_lead(uuid)'
  ];

  -- Operator actions. `authenticated` alone is not authorisation — each of these
  -- either runs as the caller under RLS, or checks staff membership itself. What
  -- the revoke buys is that `anon` cannot reach them at all, which matters most
  -- for the two SECURITY DEFINER entries: without it, anyone with the anon key
  -- and a draft's uuid could issue a quote at any total, or supersede a live one.
  operator text[] := array[
    'public.issue_quote(uuid, bigint, bigint, text)',
    'public.revise_quote(uuid, uuid)',
    'public.uplift_price_book(text, numeric)',
    'public.save_quote_as_template(uuid, text, text, text)',
    'public.create_job_from_quote(uuid, date, date)',
    'public.complete_job(uuid, text)',
    'public.raise_variation(uuid, text, uuid)',
    'public.raise_invoice(text, bigint, uuid, uuid, date)',
    'public.raise_deposit_invoice(uuid)',
    'public.record_payment(uuid, bigint, text, text)'
  ];
begin
  foreach fn in array service_only loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;

  foreach fn in array operator loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end
$$;

-- `is_staff()` and `can_write()` are deliberately left executable by everyone.
-- They are called from inside RLS policies, which evaluate as the querying role;
-- revoking them would make every policy fail with a permission error rather than
-- a denial. They read only whether the caller is staff and disclose nothing else.

-- Table-level grants mirror Supabase's defaults so RLS remains the only gate on
-- data. Restated here so a database built from migrations alone behaves like a
-- real project rather than silently denying everything at the privilege layer.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
