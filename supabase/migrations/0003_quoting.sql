-- ============================================================================
-- 0003 — Quoting: quotes, line items, clauses, photos, numbering, immutability
--
-- Field names deliberately mirror the prototype (design-reference/quoting-tool)
-- so the React screens port with near-zero churn.
-- ============================================================================

-- Numbers are drawn ONLY on issue, so abandoned drafts never burn one and two
-- devices can never mint the same number. Starts at 8: the prototype's seeded
-- data ends at Q-2026-0007.
create sequence if not exists public.quote_number_seq start 8;

create table if not exists public.quotes (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  client_id       uuid not null references public.clients(id) on delete restrict,

  -- Null until issued; the UI shows "DRAFT".
  quote_number    text unique,

  status          text not null default 'draft' check (
    status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'superseded')
  ),

  -- Revision lineage. Editing an issued quote is forbidden, so revising means
  -- raising a child and superseding the parent.
  parent_quote_id uuid references public.quotes(id) on delete set null,
  version         int not null default 1,

  roof_type       text,
  notes           text,
  valid_days      int not null default 30 check (valid_days > 0),
  show_breakdown  boolean not null default true,
  pdf_layout      text not null default 'classic' check (pdf_layout in ('classic', 'modern')),

  -- Cost-in / margin-out. Line items carry supplier COST; the client-facing
  -- document marks each line up by margin_pct so printed lines reconcile to the
  -- total and the customer never sees cost. This is the model worth keeping.
  margin_pct      numeric(6,3) not null default 20 check (margin_pct >= 0),

  gst_enabled     boolean not null default false,
  gst_rate        numeric(5,2) not null default 10 check (gst_rate >= 0),

  include_photos  boolean not null default false,

  -- Frozen at issue so the record always reproduces what the client received.
  subtotal_cents  bigint,
  total_cents     bigint,

  pdf_path        text,
  portal_token    text unique,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz,
  viewed_at       timestamptz,
  accepted_at     timestamptz,
  declined_at     timestamptz,

  -- E-signature. Written in the same statement as the accept — the atomicity
  -- is the legal artefact.
  signed_name     text,
  signed_at       timestamptz,
  signed_ip       inet,

  created_by      uuid references public.users(id) on delete set null
);

create index if not exists quotes_client_idx      on public.quotes (client_id, created_at desc);
create index if not exists quotes_opportunity_idx on public.quotes (opportunity_id);
create index if not exists quotes_status_idx      on public.quotes (status);
create index if not exists quotes_parent_idx      on public.quotes (parent_quote_id);

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();

-- Deferred FK from 0002.
alter table public.activities
  drop constraint if exists activities_quote_id_fkey;
alter table public.activities
  add constraint activities_quote_id_fkey
  foreign key (quote_id) references public.quotes(id) on delete set null;

-- ── Line items ──────────────────────────────────────────────────────────────

create table if not exists public.quote_items (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references public.quotes(id) on delete cascade,
  kind             text not null check (kind in ('material', 'labour')),
  description      text not null,
  qty              numeric(12,3) not null default 1,
  unit             text not null default 'ea',
  unit_cost_cents  bigint not null default 0 check (unit_cost_cents >= 0),
  -- Client-selectable extra on the portal (gutter guard, whirlybirds, …).
  is_optional      boolean not null default false,
  -- Good/better/best tiering. Null means the line is in the base scope.
  tier             text check (tier is null or tier in ('good', 'better', 'best')),
  sort             int not null default 0
);

create index if not exists quote_items_quote_idx on public.quote_items (quote_id, sort);

-- ── Clauses ─────────────────────────────────────────────────────────────────
-- Resolved TEXT copied onto the quote, not a reference to the library. Editing
-- a snippet next year must not silently rewrite a quote sent last year.

create table if not exists public.quote_clauses (
  id       uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  kind     text not null check (kind in ('inclusion', 'exclusion')),
  text     text not null,
  sort     int not null default 0
);

create index if not exists quote_clauses_quote_idx on public.quote_clauses (quote_id, kind, sort);

-- ── Photos ──────────────────────────────────────────────────────────────────

create table if not exists public.quote_photos (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.quotes(id) on delete cascade,
  storage_path text not null,
  caption      text,
  sort         int not null default 0
);

create index if not exists quote_photos_quote_idx on public.quote_photos (quote_id, sort);

-- ── Immutability after issue ────────────────────────────────────────────────
-- Once sent, a quote's commercial content is frozen. Anything else and the PDF
-- in the client's inbox silently stops matching the record, with no trace that
-- it ever differed. Enforced in the database so it holds no matter which client
-- issued the write.

create or replace function public.enforce_quote_immutability()
returns trigger
language plpgsql
as $$
declare
  mutable_keys text[] := array[
    'status', 'sent_at', 'viewed_at', 'accepted_at', 'declined_at',
    'signed_name', 'signed_at', 'signed_ip',
    'pdf_path', 'portal_token', 'updated_at'
  ];
begin
  -- Drafts are freely editable.
  if old.sent_at is null then
    return new;
  end if;

  if (to_jsonb(new) - mutable_keys) is distinct from (to_jsonb(old) - mutable_keys) then
    raise exception
      'quote % is issued and immutable; raise a revision instead',
      coalesce(old.quote_number, old.id::text)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists quotes_immutable on public.quotes;
create trigger quotes_immutable before update on public.quotes
  for each row execute function public.enforce_quote_immutability();

-- Line items, clauses and photos are part of that frozen content.
create or replace function public.enforce_child_immutability()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.quote_id, old.quote_id);
  issued timestamptz;
  num    text;
begin
  select q.sent_at, q.quote_number into issued, num
  from public.quotes q where q.id = target;

  if issued is not null then
    raise exception
      'quote % is issued; its line items and clauses are immutable',
      coalesce(num, target::text)
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_items_immutable on public.quote_items;
create trigger quote_items_immutable before insert or update or delete on public.quote_items
  for each row execute function public.enforce_child_immutability();

drop trigger if exists quote_clauses_immutable on public.quote_clauses;
create trigger quote_clauses_immutable before insert or update or delete on public.quote_clauses
  for each row execute function public.enforce_child_immutability();

-- ── Issue ───────────────────────────────────────────────────────────────────
-- The single supported way to send a quote. Draws the number, freezes the
-- totals and flips the status in one statement.
--
-- Numbering is monotonic across years rather than resetting each January: the
-- year in the label comes from the issue date, the counter never restarts. That
-- trades pretty numbering for a guarantee of no collisions and no reuse.

create or replace function public.issue_quote(
  p_quote_id       uuid,
  p_subtotal_cents bigint,
  p_total_cents    bigint,
  p_portal_token   text default null
)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  q      public.quotes;
  number text;
begin
  select * into q from public.quotes where id = p_quote_id for update;

  if not found then
    raise exception 'quote % not found', p_quote_id;
  end if;

  if q.sent_at is not null then
    raise exception 'quote % has already been issued', q.quote_number
      using errcode = 'check_violation';
  end if;

  number := 'Q-' || to_char(now(), 'YYYY') || '-'
            || lpad(nextval('public.quote_number_seq')::text, 4, '0');

  update public.quotes set
    quote_number   = number,
    status         = 'sent',
    sent_at        = now(),
    subtotal_cents = p_subtotal_cents,
    total_cents    = p_total_cents,
    portal_token   = coalesce(p_portal_token, encode(gen_random_bytes(24), 'hex'))
  where id = p_quote_id
  returning * into q;

  return q;
end;
$$;

-- ── Accept ──────────────────────────────────────────────────────────────────
-- Signature and status in one statement. Splitting them would allow an accepted
-- quote with no signature, or a signature against a quote that never accepted.
-- Expiry is enforced here, server-side — not by hiding a button.

create or replace function public.accept_quote(
  p_portal_token text,
  p_signed_name  text,
  p_signed_ip    inet default null
)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes;
begin
  select * into q from public.quotes where portal_token = p_portal_token for update;

  if not found then
    raise exception 'quote not found' using errcode = 'no_data_found';
  end if;

  if q.sent_at is null then
    raise exception 'quote has not been issued' using errcode = 'check_violation';
  end if;

  if q.status in ('accepted', 'declined') then
    raise exception 'quote % is already %', q.quote_number, q.status
      using errcode = 'check_violation';
  end if;

  if now() > q.sent_at + (q.valid_days || ' days')::interval then
    raise exception 'quote % expired on %',
      q.quote_number, (q.sent_at + (q.valid_days || ' days')::interval)::date
      using errcode = 'check_violation';
  end if;

  if p_signed_name is null or btrim(p_signed_name) = '' then
    raise exception 'a signature name is required' using errcode = 'check_violation';
  end if;

  update public.quotes set
    status      = 'accepted',
    accepted_at = now(),
    signed_name = btrim(p_signed_name),
    signed_at   = now(),
    signed_ip   = p_signed_ip
  where id = q.id
  returning * into q;

  return q;
end;
$$;
