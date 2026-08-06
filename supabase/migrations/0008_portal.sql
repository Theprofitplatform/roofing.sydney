-- ============================================================================
-- 0008 — Client portal: view tracking, decline, tiered acceptance
--
-- The homeowner never gets an account — an account is friction at exactly the
-- moment you want a signature. Every path here is reached by portal_token and
-- executed by the service role, so these functions carry their own guards
-- rather than leaning on a policy.
-- ============================================================================

-- ── What the client settled on ──────────────────────────────────────────────
-- Tier and optional extras are chosen AFTER issue, by the homeowner, so they
-- are not part of the frozen document. total_cents stays exactly as issued —
-- the base scope the PDF printed — and accepted_total_cents records what was
-- actually agreed once the choice resolved. Keeping the two apart is what lets
-- you answer "what did we send" and "what did they buy" separately.

alter table public.quotes add column if not exists selected_tier        text;
alter table public.quotes add column if not exists accepted_total_cents bigint;
alter table public.quotes add column if not exists declined_reason      text;

alter table public.quotes drop constraint if exists quotes_selected_tier_check;
alter table public.quotes add constraint quotes_selected_tier_check check (
  selected_tier is null or selected_tier in ('good', 'better', 'best')
);

-- The accepted total is the only money figure on a quote that arrives from
-- outside the business, and it is what the deposit is drawn against. Guarding it
-- in the column rather than only in accept_quote means no later writer can book
-- a negative sale, whichever path it comes in on.
alter table public.quotes drop constraint if exists quotes_accepted_total_nonneg;
alter table public.quotes add constraint quotes_accepted_total_nonneg check (
  accepted_total_cents is null or accepted_total_cents >= 0
);

-- The client's pick of optional extras. Deliberately its own table and
-- deliberately OUTSIDE enforce_child_immutability: quote_items are the frozen
-- offer, this is the homeowner's answer to it, made after issue.
create table if not exists public.quote_selections (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references public.quotes(id) on delete cascade,
  quote_item_id uuid not null references public.quote_items(id) on delete cascade,
  selected_at   timestamptz not null default now(),

  constraint quote_selections_unique unique (quote_id, quote_item_id)
);

create index if not exists quote_selections_quote_idx on public.quote_selections (quote_id);

-- ── Immutability, revisited ─────────────────────────────────────────────────
-- Accepting now writes three more columns. All three are records of the
-- client's decision rather than commercial content, so they join the mutable
-- set — otherwise accept_quote trips the very guard that protects it.

create or replace function public.enforce_quote_immutability()
returns trigger
language plpgsql
as $$
declare
  mutable_keys text[] := array[
    'status', 'sent_at', 'viewed_at', 'accepted_at', 'declined_at',
    'signed_name', 'signed_at', 'signed_ip',
    'selected_tier', 'accepted_total_cents', 'declined_reason',
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

-- ── First open ──────────────────────────────────────────────────────────────
-- viewed_at was sample data in the prototype that nothing ever wrote, so every
-- sent quote flagged as needing follow-up forever. The first open is what
-- clears the nudge, which is precisely why re-opening must not restamp it: a
-- client who reads the quote four times has still only been reached once.

create or replace function public.record_quote_view(p_portal_token text)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes;
begin
  select * into q from public.quotes where portal_token = p_portal_token;

  if not found then
    raise exception 'quote not found' using errcode = 'no_data_found';
  end if;

  if q.viewed_at is not null then
    return q;
  end if;

  -- The `viewed_at is null` predicate makes the first open atomic under
  -- concurrent loads; a loser updates nothing and re-reads the winner's stamp.
  update public.quotes set
    viewed_at = now(),
    status    = case when quotes.status = 'sent' then 'viewed' else quotes.status end
  where id = q.id and viewed_at is null
  returning * into q;

  if not found then
    select * into q from public.quotes where portal_token = p_portal_token;
  end if;

  return q;
end;
$$;

-- ── Decline ─────────────────────────────────────────────────────────────────
-- A declined quote is an outcome, not a dead end: the reason is what tells you
-- whether 22% on re-roofs is winning or losing work.

create or replace function public.decline_quote(
  p_portal_token text,
  p_reason       text default null
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

  -- Same withdrawal rule as accept_quote below: a document the business has
  -- retracted cannot be answered, only ignored.
  if q.status in ('superseded', 'expired') then
    raise exception 'quote % is % and is no longer open for signature',
      coalesce(q.quote_number, q.id::text), q.status
      using errcode = 'check_violation';
  end if;

  update public.quotes set
    status          = 'declined',
    declined_at     = now(),
    declined_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = q.id
  returning * into q;

  return q;
end;
$$;

-- ── Accept ──────────────────────────────────────────────────────────────────
-- Signature, status, tier and extras in ONE statement. Splitting them would
-- allow an accepted quote with no signature, or a signature against a scope the
-- client never picked. That atomicity is the legal artefact.
--
-- The three-argument signature from 0003 is dropped rather than replaced:
-- `create or replace` with new defaulted parameters leaves both versions
-- resident, and a two-argument call would then be ambiguous at run time.

drop function if exists public.accept_quote(text, text, inet);

create or replace function public.accept_quote(
  p_portal_token         text,
  p_signed_name          text,
  p_signed_ip            inet   default null,
  p_selected_item_ids    uuid[] default null,
  p_selected_tier        text   default null,
  p_accepted_total_cents bigint default null
)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  q      public.quotes;
  stray  uuid[];
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

  -- Revising supersedes the parent but does NOT invalidate its portal link, and
  -- the homeowner still has the first email. Without this the client can sign the
  -- withdrawn v1 while v2 is out for signature, and create_job_from_quote will
  -- then open a job against a document the business has already replaced — the
  -- exact two-documents-one-negotiation failure lock-on-issue exists to prevent.
  -- 'expired' is refused for the same reason: a quote retired by the follow-up
  -- sweep has been withdrawn, whatever its dates now say.
  if q.status in ('superseded', 'expired') then
    raise exception 'quote % is % and is no longer open for signature',
      coalesce(q.quote_number, q.id::text), q.status
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

  if p_selected_tier is not null and p_selected_tier not in ('good', 'better', 'best') then
    raise exception 'unknown tier %', p_selected_tier using errcode = 'check_violation';
  end if;

  -- quotes_accepted_total_nonneg would catch this, but a raw constraint name in
  -- the operator's face teaches nothing about which figure was refused.
  if p_accepted_total_cents is not null and p_accepted_total_cents < 0 then
    raise exception 'an accepted total cannot be negative (got % cents)', p_accepted_total_cents
      using errcode = 'check_violation';
  end if;

  -- A selection must name an optional line ON THIS QUOTE. Without the scope
  -- check a caller could bind another client's extras to this acceptance.
  if p_selected_item_ids is not null then
    select array_agg(sel.id) into stray
    from unnest(p_selected_item_ids) as sel(id)
    where not exists (
      select 1 from public.quote_items qi
      where qi.id = sel.id and qi.quote_id = q.id and qi.is_optional
    );

    if stray is not null then
      raise exception 'line items % are not client-selectable extras on quote %',
        stray, coalesce(q.quote_number, q.id::text)
        using errcode = 'check_violation';
    end if;

    insert into public.quote_selections (quote_id, quote_item_id)
    select q.id, sel.id from unnest(p_selected_item_ids) as sel(id)
    on conflict on constraint quote_selections_unique do nothing;
  end if;

  update public.quotes set
    status               = 'accepted',
    accepted_at          = now(),
    signed_name          = btrim(p_signed_name),
    signed_at            = now(),
    signed_ip            = p_signed_ip,
    selected_tier        = p_selected_tier,
    accepted_total_cents = coalesce(p_accepted_total_cents, q.total_cents)
  where id = q.id
  returning * into q;

  return q;
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Staff read the client's choice; nobody writes it through PostgREST. The
-- portal inserts via accept_quote under the service role, for the same reason
-- 0007 gives for not exposing quotes to anon: a token-matching policy would
-- make the table probeable.

alter table public.quote_selections enable row level security;
alter table public.quote_selections force row level security;

drop policy if exists quote_selections_staff_select on public.quote_selections;
create policy quote_selections_staff_select on public.quote_selections
  for select using (public.is_staff());
