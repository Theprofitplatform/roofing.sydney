-- ============================================================================
-- 0011 — Money: invoice numbering, deposits, payment recording
--
-- Phase 8. The deposit is already PRINTED on the quote PDF with no way to take
-- the money; this closes that. Nothing upstream depends on any of it, which is
-- what keeps the money column deferrable.
-- ============================================================================

-- Same reasoning as quote numbers (0003): the year in the label comes from the
-- issue date but the counter never restarts each January. That trades pretty
-- numbering for a guarantee of no collisions and no reuse — and a reused
-- invoice number is a reconciliation problem, not a cosmetic one.
create or replace function public.next_invoice_number()
returns text
language sql
volatile
as $$
  select 'INV-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;

-- ── Raising an invoice ──────────────────────────────────────────────────────
-- Opens at 'sent': an invoice nobody has been told about is not an invoice, and
-- a draft state here only invites the number to be drawn twice.

create or replace function public.raise_invoice(
  p_kind        text,
  p_total_cents bigint,
  p_quote_id    uuid default null,
  p_job_id      uuid default null,
  p_due_at      date default null
)
returns public.invoices
language plpgsql
as $$
declare
  inv public.invoices;
begin
  -- invoices_has_parent would catch this, but a raw constraint name in the
  -- operator's face teaches nothing about why it is refused.
  if p_quote_id is null and p_job_id is null then
    raise exception 'an invoice must be attached to a quote or a job to be reconcilable'
      using errcode = 'check_violation';
  end if;

  if p_total_cents is null or p_total_cents < 0 then
    raise exception 'an invoice total must be zero or more cents'
      using errcode = 'check_violation';
  end if;

  insert into public.invoices (
    kind, quote_id, job_id, total_cents, due_at, invoice_number, status, sent_at
  ) values (
    p_kind, p_quote_id, p_job_id, p_total_cents, p_due_at,
    public.next_invoice_number(), 'sent', now()
  )
  returning * into inv;

  return inv;
end;
$$;

-- ── Deposits ────────────────────────────────────────────────────────────────
-- Accepting twice — a double-click, a retried notification — must not raise two
-- deposit invoices against one signature. The index is the guarantee; the
-- pre-check below is what turns the second call into a no-op instead of an
-- error the caller has to interpret.
--
-- Nulls are distinct in a unique index, so deposits raised against a job with
-- no quote are unaffected.
create unique index if not exists invoices_deposit_per_quote_idx
  on public.invoices (quote_id)
  where kind = 'deposit';

create or replace function public.raise_deposit_invoice(p_quote_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  q      public.quotes;
  s      public.settings;
  inv    public.invoices;
  amount bigint;
begin
  select * into q from public.quotes where id = p_quote_id;

  if not found then
    raise exception 'quote % not found', p_quote_id using errcode = 'no_data_found';
  end if;

  if q.status <> 'accepted' then
    raise exception 'quote % is %; a deposit is only due on acceptance',
      coalesce(q.quote_number, p_quote_id::text), q.status
      using errcode = 'check_violation';
  end if;

  select * into s from public.settings where id = 1;

  -- Deposits off is a business choice, not a fault. Returning null lets the
  -- accept path call this unconditionally.
  if not coalesce(s.deposit_enabled, false) then
    return null;
  end if;

  select * into inv from public.invoices where quote_id = q.id and kind = 'deposit';

  if found then
    return inv;
  end if;

  -- The deposit follows what the client actually agreed to, which is the base
  -- scope plus whatever tier and extras they chose — not the issued total.
  amount := round(coalesce(q.accepted_total_cents, q.total_cents, 0) * s.deposit_pct / 100.0)::bigint;

  inv := public.raise_invoice('deposit', amount, q.id, null, null);

  return inv;
end;
$$;

-- ── Payments ────────────────────────────────────────────────────────────────
-- Stripe retries webhooks. Without this a duplicate delivery books the payment
-- twice and payments_sync_status dutifully marks an invoice overpaid — a silent
-- reconciliation error, which is the worst kind.
create unique index if not exists payments_reference_idx
  on public.payments (invoice_id, reference)
  where reference is not null;

create or replace function public.record_payment(
  p_invoice_id   uuid,
  p_amount_cents bigint,
  p_method       text,
  p_reference    text default null
)
returns public.payments
language plpgsql
as $$
declare
  p public.payments;
begin
  -- payments_sync_status already moves the invoice to part_paid/paid from the
  -- sum of what has been received. Setting status here as well would give two
  -- writers to one fact, and they would disagree the first time a payment is
  -- reversed.
  insert into public.payments (invoice_id, amount_cents, method, reference)
  values (
    p_invoice_id,
    p_amount_cents,
    p_method,
    -- An empty reference is not an idempotency key; keep it null so the partial
    -- index does not treat two blank manual receipts as the same payment.
    nullif(btrim(coalesce(p_reference, '')), '')
  )
  returning * into p;

  return p;
end;
$$;
