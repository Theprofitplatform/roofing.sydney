-- ============================================================================
-- 0004 — Libraries: price book, clause snippets, job templates, settings
-- ============================================================================

-- ── Price book ──────────────────────────────────────────────────────────────
-- cost_updated_at is not decoration. margin_floor_pct guards the MARGIN, not
-- whether the underlying cost is real — a 20% margin on a cost that rose 12%
-- is not a 20% margin. Staleness is surfaced at point of use.

create table if not exists public.price_book (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('material', 'labour')),
  category        text not null,
  description     text not null,
  unit            text not null,
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  supplier        text,
  supplier_sku    text,
  cost_updated_at timestamptz not null default now(),
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists price_book_category_idx on public.price_book (category)
  where archived_at is null;

-- Any change to the cost restamps cost_updated_at; edits to the description or
-- supplier must not reset the staleness clock.
create or replace function public.touch_cost_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.unit_cost_cents is distinct from old.unit_cost_cents then
    new.cost_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists price_book_cost_touch on public.price_book;
create trigger price_book_cost_touch before update on public.price_book
  for each row execute function public.touch_cost_updated_at();

-- ── Clause snippets ─────────────────────────────────────────────────────────

create table if not exists public.snippets (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('inclusion', 'exclusion')),
  text       text not null,
  is_default boolean not null default false,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Job templates ───────────────────────────────────────────────────────────
-- Was window.ARC_TEMPLATES — hardcoded and uneditable in the prototype. A table
-- so "save this quote as a template" becomes possible.

create table if not exists public.job_templates (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  sub            text,
  icon           text,
  roof_type      text,
  valid_days     int,
  margin_pct     numeric(6,3),
  show_breakdown boolean not null default true,
  notes          text,
  -- Line items as [{kind, description, qty, unit, unit_cost_cents}, …]
  line_items     jsonb not null default '[]'::jsonb,
  sort           int not null default 0,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ── Settings ────────────────────────────────────────────────────────────────
-- Single row, enforced by the primary key check.

create table if not exists public.settings (
  id                 int primary key default 1 check (id = 1),

  business_name      text,
  legal_name         text,
  owner_name         text,
  licence_no         text,
  abn                text,
  acn                text,
  phone              text,
  email              text,
  site               text,
  address            text,
  logo_path          text,

  -- Master switch. A per-quote gst_enabled must not be settable while the
  -- business is not registered — see the trigger below.
  gst_registered     boolean not null default false,
  gst_rate           numeric(5,2) not null default 10 check (gst_rate >= 0),

  deposit_enabled    boolean not null default false,
  deposit_pct        numeric(5,2) not null default 10 check (deposit_pct between 0 and 100),

  default_margin_pct numeric(6,3) not null default 20,
  default_valid_days int not null default 30,
  margin_floor_pct   numeric(6,3) not null default 15,
  follow_up_days     int not null default 7,

  -- PLACEHOLDER by design. Owner-supplied or professionally reviewed (e.g.
  -- against the NSW Home Building Act). Never generated — this is licensed
  -- building work.
  payment_terms      text,

  updated_at         timestamptz not null default now()
);

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- Reconciles the two GST flags the prototype left unrelated.
create or replace function public.enforce_gst_registration()
returns trigger
language plpgsql
as $$
begin
  if new.gst_enabled
     and not coalesce((select s.gst_registered from public.settings s where s.id = 1), false)
  then
    raise exception 'cannot enable GST on a quote while the business is not GST-registered'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_gst_registration on public.quotes;
create trigger quotes_gst_registration before insert or update on public.quotes
  for each row when (new.gst_enabled) execute function public.enforce_gst_registration();
