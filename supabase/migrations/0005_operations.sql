-- ============================================================================
-- 0005 — Operations: jobs, variations
--
-- Tables land now so accepted quotes have somewhere to go; the screens arrive
-- in Phase 7.
-- ============================================================================

create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references public.quotes(id) on delete restrict,
  status          text not null default 'scheduled' check (
    status in ('scheduled', 'in_progress', 'on_hold', 'complete', 'cancelled')
  ),
  scheduled_start date,
  scheduled_end   date,
  completed_at    timestamptz,
  crew_notes      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint jobs_dates_ordered check (
    scheduled_start is null or scheduled_end is null or scheduled_end >= scheduled_start
  )
);

create index if not exists jobs_quote_idx  on public.jobs (quote_id);
create index if not exists jobs_status_idx on public.jobs (status);

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- A job may only be raised against an accepted quote.
create or replace function public.enforce_job_from_accepted_quote()
returns trigger
language plpgsql
as $$
declare
  s text;
begin
  select q.status into s from public.quotes q where q.id = new.quote_id;

  if s is distinct from 'accepted' then
    raise exception 'cannot open a job against a quote with status %', coalesce(s, 'missing')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_require_accepted on public.jobs;
create trigger jobs_require_accepted before insert on public.jobs
  for each row execute function public.enforce_job_from_accepted_quote();

-- ── Variations ──────────────────────────────────────────────────────────────
-- The seeded exclusions promise "will be quoted as a variation", so the
-- document commits to a workflow the tool must be able to perform. A variation
-- is itself a quote, linked back to the job.

create table if not exists public.variations (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  quote_id   uuid references public.quotes(id) on delete set null,
  reason     text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index if not exists variations_job_idx on public.variations (job_id);
