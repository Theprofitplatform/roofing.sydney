-- ============================================================================
-- 0009 — Sales leverage: revisions, price book uplift, templates
--
-- Lock-on-issue is only tolerable if revising is one action. Everything here
-- exists to make the frozen document workable rather than obstructive.
-- ============================================================================

-- ── Revisions ───────────────────────────────────────────────────────────────
-- Editing an issued quote is forbidden, so revising means raising a child and
-- superseding the parent. The clone is a DRAFT: no number, no token, no totals,
-- no signature. Those are drawn afresh when the revision is itself issued —
-- reusing the parent's number would put two different documents behind one
-- reference, which is the exact failure lock-on-issue exists to prevent.

create or replace function public.revise_quote(
  p_quote_id   uuid,
  p_created_by uuid default null
)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.quotes;
  child  public.quotes;
begin
  select * into parent from public.quotes where id = p_quote_id for update;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'no_data_found';
  end if;

  -- A draft has not left the building; revising it is just editing it.
  if parent.sent_at is null then
    raise exception 'quote % has not been issued; edit the draft instead', p_quote_id
      using errcode = 'check_violation';
  end if;

  if parent.status = 'superseded' then
    raise exception 'quote % has already been superseded', parent.quote_number
      using errcode = 'check_violation';
  end if;

  insert into public.quotes (
    opportunity_id, client_id, parent_quote_id, version, status,
    roof_type, notes, valid_days, show_breakdown, pdf_layout,
    margin_pct, gst_enabled, gst_rate, include_photos, created_by
  ) values (
    parent.opportunity_id, parent.client_id, parent.id, parent.version + 1, 'draft',
    parent.roof_type, parent.notes, parent.valid_days, parent.show_breakdown, parent.pdf_layout,
    parent.margin_pct, parent.gst_enabled, parent.gst_rate, parent.include_photos,
    coalesce(p_created_by, parent.created_by)
  )
  returning * into child;

  insert into public.quote_items (
    quote_id, kind, description, qty, unit, unit_cost_cents, is_optional, tier, sort)
  select child.id, kind, description, qty, unit, unit_cost_cents, is_optional, tier, sort
  from public.quote_items where quote_id = parent.id;

  -- Clauses are copied text, not references, so the revision carries the exact
  -- wording the parent carried even if the library has moved on since.
  insert into public.quote_clauses (quote_id, kind, text, sort)
  select child.id, kind, text, sort
  from public.quote_clauses where quote_id = parent.id;

  insert into public.quote_photos (quote_id, storage_path, caption, sort)
  select child.id, storage_path, caption, sort
  from public.quote_photos where quote_id = parent.id;

  update public.quotes set status = 'superseded' where id = parent.id;

  return child;
end;
$$;

-- ── Price book uplift ───────────────────────────────────────────────────────
-- "+6% on all Sheet roofing" after a supplier letter, rather than fourteen
-- hand edits. margin_floor_pct will not catch a stale cost — it tests the
-- margin, not whether the underlying cost is real — so keeping costs current in
-- bulk is the only defence.
--
-- price_book_cost_touch already restamps cost_updated_at on any cost change;
-- doing it here as well would be two writes claiming the same fact.

create or replace function public.uplift_price_book(
  p_category text,
  p_pct      numeric
)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  if p_pct is null then
    raise exception 'an uplift percentage is required' using errcode = 'check_violation';
  end if;

  if p_pct < -100 then
    raise exception 'an uplift of % per cent would drive unit costs below zero', p_pct
      using errcode = 'check_violation';
  end if;

  -- Archived rows are history; repricing them would rewrite what a past quote
  -- was costed against. A null category means every category.
  update public.price_book set
    unit_cost_cents = round(unit_cost_cents * (1 + p_pct / 100.0))::bigint
  where archived_at is null
    and (p_category is null or category = p_category);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ── Save a quote as a template ──────────────────────────────────────────────
-- The prototype's templates were a hardcoded window global. The whole point of
-- moving them into a table is that the quote John just spent an hour costing
-- becomes the starting point for the next one.

create or replace function public.save_quote_as_template(
  p_quote_id uuid,
  p_label    text,
  p_sub      text default null,
  p_icon     text default null
)
returns public.job_templates
language plpgsql
as $$
declare
  q public.quotes;
  t public.job_templates;
begin
  if p_label is null or btrim(p_label) = '' then
    raise exception 'a template label is required' using errcode = 'check_violation';
  end if;

  select * into q from public.quotes where id = p_quote_id;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'no_data_found';
  end if;

  insert into public.job_templates (
    label, sub, icon, roof_type, valid_days, margin_pct, show_breakdown, notes, line_items, sort
  ) values (
    btrim(p_label), p_sub, p_icon,
    q.roof_type, q.valid_days, q.margin_pct, q.show_breakdown, q.notes,
    -- Cost only. A template that carried marked-up prices would double the
    -- margin the moment margin_pct is applied to it again.
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'kind',            qi.kind,
          'description',     qi.description,
          'qty',             qi.qty,
          'unit',            qi.unit,
          'unit_cost_cents', qi.unit_cost_cents
        )
        order by qi.sort, qi.description
      )
      from public.quote_items qi where qi.quote_id = q.id
    ), '[]'::jsonb),
    coalesce((select max(jt.sort) + 1 from public.job_templates jt), 1)
  )
  returning * into t;

  return t;
end;
$$;
