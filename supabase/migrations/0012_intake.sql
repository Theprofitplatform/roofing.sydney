-- ============================================================================
-- 0012 — Intake: a public enquiry becomes a pipeline card
--
-- The public site's leads table is completely disconnected from quoting today.
-- This is the join, and it is the highest-value integration in the plan: a
-- submission on roofing.sydney has to appear on the board within seconds, with
-- no re-typing of a name and address the customer already gave us.
-- ============================================================================

-- One client per lead. The public form is retried by impatient thumbs and by
-- the network; without this the same enquiry forks into two clients and the
-- history splits down the middle.
create unique index if not exists clients_lead_unique_idx
  on public.clients (lead_id)
  where lead_id is not null;

-- Superseded by the unique index above, which serves the same lookups.
drop index if exists public.clients_lead_idx;

-- Provenance on the card itself, not just on the client.
--
-- Without this, "which opportunity did intake create for this lead?" has to be
-- inferred — and the obvious inference, the client's oldest opportunity, breaks
-- the moment two share a `created_at`, because the only tiebreaker left is a
-- random uuid. That is not a theoretical tie: it showed up under parallel test
-- load, returning the wrong card in three runs out of eight. Recording the lead
-- makes the answer exact instead of probable.
alter table public.opportunities
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

create unique index if not exists opportunities_lead_unique_idx
  on public.opportunities (lead_id)
  where lead_id is not null;

-- Called by the service role from the public lead route, where there is no
-- session at all — so nothing here may depend on auth.uid(). created_by stays
-- null: the enquiry was authored by the homeowner, not by staff.
create or replace function public.intake_lead(p_lead_id uuid)
returns public.opportunities
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads;
  c public.clients;
  o public.opportunities;
begin
  select * into l from public.leads where id = p_lead_id;

  if not found then
    raise exception 'lead % not found', p_lead_id using errcode = 'no_data_found';
  end if;

  -- Already taken in? Hand back the exact card this lead produced. Matching on
  -- lead_id rather than on "the client's oldest opportunity" means a client who
  -- enquires twice, or whom the operator has since added work for, still
  -- resolves to the right one.
  select * into o from public.opportunities where lead_id = l.id;
  if found then
    return o;
  end if;

  select * into c from public.clients where lead_id = l.id;

  if not found then
    insert into public.clients (
      name, phone, email, property_address, lat, lng, source, lead_id
    ) values (
      l.name, l.phone, l.email, l.address, l.lat, l.lng,
      coalesce(l.source, 'web'),
      l.id
    )
    returning * into c;
  end if;

  insert into public.opportunities (client_id, lead_id, stage_id, title)
  values (
    c.id,
    l.id,
    'enquiry',
    -- The card has to identify the property at a glance, so the colour the
    -- homeowner picked leads and the address anchors it. Concatenation yields
    -- null when no colour was chosen, which falls through to the address alone.
    coalesce(nullif(btrim(l.selected_colour_name), '') || ' — ' || l.address, l.address)
  )
  returning * into o;

  return o;
end;
$$;
