-- ============================================================================
-- 0002 — CRM core: clients, pipeline, activities
-- ============================================================================

-- ── Clients ─────────────────────────────────────────────────────────────────

create table if not exists public.clients (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  email            text,
  property_address text,
  lat              double precision,
  lng              double precision,
  source           text,
  -- Provenance: which public-site enquiry became this client, if any.
  lead_id          uuid references public.leads(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.users(id) on delete set null
);

create index if not exists clients_name_idx on public.clients (lower(name));
create index if not exists clients_lead_idx on public.clients (lead_id);

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- ── Pipeline ────────────────────────────────────────────────────────────────
-- Stages are rows, not an enum, so reordering or renaming does not need a
-- migration and a lost stage cannot orphan an opportunity.

create table if not exists public.pipeline_stages (
  id          text primary key,
  label       text not null,
  sort        int  not null,
  is_terminal boolean not null default false
);

create table if not exists public.opportunities (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  stage_id    text not null references public.pipeline_stages(id) default 'enquiry',
  title       text,
  roof_type   text,
  -- Required when the stage is 'lost'. Enforced by trigger below: an outcome
  -- with no reason teaches you nothing about why you are losing work.
  lost_reason text check (
    lost_reason is null
    or lost_reason in ('price', 'timing', 'went_elsewhere', 'no_response', 'cancelled')
  ),
  visit_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.users(id) on delete set null
);

create index if not exists opportunities_client_idx on public.opportunities (client_id);
create index if not exists opportunities_stage_idx  on public.opportunities (stage_id);

drop trigger if exists opportunities_touch on public.opportunities;
create trigger opportunities_touch before update on public.opportunities
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_lost_reason()
returns trigger
language plpgsql
as $$
begin
  if new.stage_id = 'lost' and new.lost_reason is null then
    raise exception 'a lost opportunity requires lost_reason'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_lost_reason on public.opportunities;
create trigger opportunities_lost_reason before insert or update on public.opportunities
  for each row execute function public.enforce_lost_reason();

-- ── Activities ──────────────────────────────────────────────────────────────
-- Contact log and task list in one table: a call you intend to make and a call
-- you made differ only by whether done_at is set.

create table if not exists public.activities (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references public.clients(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  quote_id       uuid,  -- FK added in 0003, once quotes exists
  kind           text not null
                 check (kind in ('note', 'call', 'email', 'sms', 'visit', 'task')),
  body           text,
  due_at         timestamptz,
  done_at        timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.users(id) on delete set null
);

create index if not exists activities_client_idx on public.activities (client_id, created_at desc);
create index if not exists activities_open_idx   on public.activities (due_at)
  where done_at is null;
