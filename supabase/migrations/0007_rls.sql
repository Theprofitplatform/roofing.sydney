-- ============================================================================
-- 0007 — Row Level Security
--
-- Every table gets RLS ON with real policies. The pre-existing `leads` pattern
-- (RLS enabled, zero policies, service-role writes) is safe only because
-- nothing reads it — an operator app that reads and edits cannot inherit it.
--
-- The service role bypasses RLS entirely, so the public lead form and any
-- server-side admin path keep working untouched.
-- ============================================================================

-- Write access. Owners and estimators author; crew update job progress only;
-- readonly never writes.
create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('owner', 'estimator')
  );
$$;

-- ── Helper: apply the standard staff policy set to a table ──────────────────
do $$
declare
  t text;
  staff_tables text[] := array[
    'clients', 'opportunities', 'activities',
    'quotes', 'quote_items', 'quote_clauses', 'quote_photos',
    'price_book', 'snippets', 'job_templates', 'settings',
    'jobs', 'variations', 'invoices', 'payments'
  ];
begin
  foreach t in array staff_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_select', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_staff())',
      t || '_staff_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.can_write())',
      t || '_staff_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_update', t);
    execute format(
      'create policy %I on public.%I for update using (public.can_write()) with check (public.can_write())',
      t || '_staff_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (public.can_write())',
      t || '_staff_delete', t);
  end loop;
end;
$$;

-- Crew may move a job along without being able to author quotes.
drop policy if exists jobs_crew_update on public.jobs;
create policy jobs_crew_update on public.jobs
  for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'crew'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'crew'));

-- ── Pipeline stages: readable by staff, seeded by service role only ─────────
alter table public.pipeline_stages enable row level security;
alter table public.pipeline_stages force row level security;

drop policy if exists pipeline_stages_staff_select on public.pipeline_stages;
create policy pipeline_stages_staff_select on public.pipeline_stages
  for select using (public.is_staff());

-- ── Users: a staff member reads the roster, only owners change it ───────────
alter table public.users enable row level security;
alter table public.users force row level security;

drop policy if exists users_staff_select on public.users;
create policy users_staff_select on public.users
  for select using (auth.uid() is not null);

drop policy if exists users_owner_write on public.users;
create policy users_owner_write on public.users
  for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'owner'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'owner'));

-- ── Leads: public form writes via service role; staff read ──────────────────
alter table public.leads enable row level security;

drop policy if exists leads_staff_select on public.leads;
create policy leads_staff_select on public.leads
  for select using (public.is_staff());

drop policy if exists leads_staff_update on public.leads;
create policy leads_staff_update on public.leads
  for update using (public.can_write()) with check (public.can_write());

-- ── Client portal ───────────────────────────────────────────────────────────
-- Deliberately NO anon policy on quotes. The portal resolves portal_token
-- server-side through the service role and returns only that quote. Exposing a
-- token-matching policy to the anon role would make the whole table probeable.
