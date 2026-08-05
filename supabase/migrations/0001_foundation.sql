-- ============================================================================
-- 0001 — Foundation: extensions, helpers, identity, leads
--
-- Money is INTEGER CENTS everywhere. Never floats: 0.1 + 0.2 is not 0.3, and
-- a quote that does not reconcile to the printed total is a commercial problem.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Maintains updated_at on any table carrying that column.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Identity ────────────────────────────────────────────────────────────────
-- Mirrors auth.users. Single owner today; the role column exists now so adding
-- an estimator later is an insert, not a migration.

create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'owner'
             check (role in ('owner', 'estimator', 'crew', 'readonly')),
  created_at timestamptz not null default now()
);

-- True when the caller is a signed-in staff member. Central so tightening the
-- rule later is one edit rather than one per policy. Defined after the table it
-- reads — SQL function bodies are validated at creation time.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users u where u.id = auth.uid());
$$;

-- First sign-in provisions the staff row. Without this an authenticated user
-- has a session but no identity, and every is_staff() check fails closed.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ── Leads (public site) ─────────────────────────────────────────────────────
-- Pre-existing table from supabase/schema.sql, restated idempotently so a
-- fresh database can be built from migrations alone.

create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  name                 text not null,
  phone                text not null,
  email                text not null,
  address              text not null,
  lat                  double precision,
  lng                  double precision,
  place_id             text,
  selected_colour_id   text,
  selected_colour_name text,
  best_time            text,
  notes                text,
  source               text not null default 'web',
  ip                   inet,
  user_agent           text
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
