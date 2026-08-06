-- ============================================================================
-- 0010 — Operations: jobs from accepted quotes, completion, variations
--
-- Phase 7. The accepted quote already holds the scope, the price and the
-- signature; re-entering any of it by hand is how a job ends up being run
-- against something the client never agreed to.
-- ============================================================================

-- One job per accepted quote. This is what makes create_job_from_quote safely
-- idempotent — a double-submit or a retried webhook collides here rather than
-- opening a second job against the same signature.
create unique index if not exists jobs_quote_unique_idx on public.jobs (quote_id);

-- Superseded by the unique index above, which serves the same lookups.
drop index if exists public.jobs_quote_idx;

create or replace function public.create_job_from_quote(
  p_quote_id        uuid,
  p_scheduled_start date default null,
  p_scheduled_end   date default null
)
returns public.jobs
language plpgsql
as $$
declare
  j public.jobs;
begin
  -- Returning the existing job rather than raising: the caller is "accept
  -- created a job", and an accept that fires twice is a retry, not an error.
  select * into j from public.jobs where quote_id = p_quote_id;

  if found then
    return j;
  end if;

  -- jobs_require_accepted enforces the accepted-quote rule; restating it here
  -- would give two places to keep in step.
  insert into public.jobs (quote_id, scheduled_start, scheduled_end)
  values (p_quote_id, p_scheduled_start, p_scheduled_end)
  returning * into j;

  return j;
end;
$$;

-- ── Completion ──────────────────────────────────────────────────────────────

create or replace function public.complete_job(
  p_job_id     uuid,
  p_crew_notes text default null
)
returns public.jobs
language plpgsql
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;

  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'no_data_found';
  end if;

  if j.status = 'cancelled' then
    raise exception 'job % is cancelled and cannot be signed off', p_job_id
      using errcode = 'check_violation';
  end if;

  update public.jobs set
    status       = 'complete',
    -- The sign-off date is a record of when work finished. Re-running the
    -- action to append crew notes must not move it.
    completed_at = coalesce(j.completed_at, now()),
    crew_notes   = coalesce(nullif(btrim(coalesce(p_crew_notes, '')), ''), j.crew_notes)
  where id = j.id
  returning * into j;

  return j;
end;
$$;

-- ── Attachments ─────────────────────────────────────────────────────────────
-- Not photos. An engineer's report, a colour sheet or a warranty certificate is
-- part of the job record and has to survive the crew's phone.

create table if not exists public.job_attachments (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  storage_path text not null,
  filename     text,
  kind         text check (
    kind is null
    or kind in ('engineer_report', 'colour_sheet', 'warranty', 'photo', 'other')
  ),
  caption      text,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.users(id) on delete set null
);

create index if not exists job_attachments_job_idx on public.job_attachments (job_id, created_at desc);

alter table public.job_attachments enable row level security;
alter table public.job_attachments force row level security;

drop policy if exists job_attachments_staff_select on public.job_attachments;
create policy job_attachments_staff_select on public.job_attachments
  for select using (public.is_staff());

drop policy if exists job_attachments_staff_insert on public.job_attachments;
create policy job_attachments_staff_insert on public.job_attachments
  for insert with check (public.can_write());

drop policy if exists job_attachments_staff_update on public.job_attachments;
create policy job_attachments_staff_update on public.job_attachments
  for update using (public.can_write()) with check (public.can_write());

drop policy if exists job_attachments_staff_delete on public.job_attachments;
create policy job_attachments_staff_delete on public.job_attachments
  for delete using (public.can_write());

-- Crew may attach, but not remove.
--
-- `can_write()` is owner/estimator only, which would have left the crew unable
-- to upload the very paperwork this table exists to collect — the engineer's
-- report and the colour sheet arrive from the roof, on a phone, not from the
-- office. Deletion stays with the office: losing a document nobody realises is
-- gone is a worse failure than an extra one nobody needed, and there is no
-- undo for an attachment that only ever existed on someone's camera roll.
drop policy if exists job_attachments_crew_insert on public.job_attachments;
create policy job_attachments_crew_insert on public.job_attachments
  for insert
  with check (exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'crew'
  ));

-- ── Variations ──────────────────────────────────────────────────────────────
-- The seeded exclusions promise latent conditions "will be quoted as a
-- variation", so the document already commits to this workflow. A variation is
-- its own quote against the same client and opportunity, linked to the job.
--
-- Note it is NOT given parent_quote_id: that column means "this supersedes
-- that", and a variation adds to the original job rather than replacing it. The
-- variations row is the link.

create or replace function public.raise_variation(
  p_job_id     uuid,
  p_reason     text,
  p_created_by uuid default null
)
returns public.quotes
language plpgsql
as $$
declare
  j      public.jobs;
  parent public.quotes;
  v      public.quotes;
  author uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a variation requires a reason' using errcode = 'check_violation';
  end if;

  select * into j from public.jobs where id = p_job_id;

  if not found then
    raise exception 'job % not found', p_job_id using errcode = 'no_data_found';
  end if;

  select * into parent from public.quotes where id = j.quote_id;

  author := coalesce(p_created_by, parent.created_by);

  insert into public.quotes (
    opportunity_id, client_id, status,
    roof_type, notes, valid_days, show_breakdown, pdf_layout,
    margin_pct, gst_enabled, gst_rate, created_by
  ) values (
    parent.opportunity_id, parent.client_id, 'draft',
    parent.roof_type, btrim(p_reason), parent.valid_days, parent.show_breakdown, parent.pdf_layout,
    parent.margin_pct, parent.gst_enabled, parent.gst_rate, author
  )
  returning * into v;

  insert into public.variations (job_id, quote_id, reason, created_by)
  values (j.id, v.id, btrim(p_reason), author);

  return v;
end;
$$;
