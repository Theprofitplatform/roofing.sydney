-- Run this once in your Supabase project's SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text not null,
  address text not null,
  lat double precision,
  lng double precision,
  place_id text,
  selected_colour_id text,
  selected_colour_name text,
  best_time text,
  notes text,
  source text not null default 'web',
  ip inet,
  user_agent text
);

-- For MVP we insert via the service role key from a Next.js API route,
-- which bypasses RLS. Keep RLS enabled so anon/auth can't touch the table directly.
alter table public.leads enable row level security;

-- No policies = no access for anon/authenticated roles. Only service role writes.

create index if not exists leads_created_at_idx on public.leads (created_at desc);
