-- ============================================================================
-- 0006 — Money: invoices, payments
--
-- Phase 8 tables. Created now so the schema is complete and the money column
-- can be switched on without a migration against live data — but nothing
-- upstream depends on these, which is what keeps Phase 8 deferrable.
-- ============================================================================

create sequence if not exists public.invoice_number_seq start 1;

create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid references public.jobs(id) on delete set null,
  quote_id              uuid references public.quotes(id) on delete set null,
  invoice_number        text unique,
  kind                  text not null check (kind in ('deposit', 'progress', 'final')),
  status                text not null default 'draft' check (
    status in ('draft', 'sent', 'part_paid', 'paid', 'void')
  ),
  total_cents           bigint not null check (total_cents >= 0),
  due_at                date,
  sent_at               timestamptz,
  paid_at               timestamptz,
  stripe_payment_intent text,
  xero_invoice_id       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- An invoice detached from both a job and a quote is unreconcilable.
  constraint invoices_has_parent check (job_id is not null or quote_id is not null)
);

create index if not exists invoices_job_idx    on public.invoices (job_id);
create index if not exists invoices_status_idx on public.invoices (status);

-- Stripe retries webhooks. Without this a duplicate delivery books the payment
-- twice and the invoice silently overpays.
create unique index if not exists invoices_stripe_pi_idx
  on public.invoices (stripe_payment_intent)
  where stripe_payment_intent is not null;

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  method      text not null check (method in ('stripe', 'bank_transfer', 'cash', 'other')),
  reference   text,
  received_at timestamptz not null default now(),
  created_by  uuid references public.users(id) on delete set null
);

create index if not exists payments_invoice_idx on public.payments (invoice_id);

-- Keeps invoice status in step with what has actually been received, rather
-- than trusting the caller to remember.
create or replace function public.sync_invoice_payment_status()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
  paid   bigint;
  total  bigint;
begin
  select coalesce(sum(p.amount_cents), 0) into paid
  from public.payments p where p.invoice_id = target;

  select i.total_cents into total from public.invoices i where i.id = target;

  update public.invoices set
    status  = case
                when paid <= 0     then 'sent'
                when paid >= total then 'paid'
                else 'part_paid'
              end,
    paid_at = case when paid >= total then now() else null end
  where id = target
    and status <> 'void';

  return coalesce(new, old);
end;
$$;

drop trigger if exists payments_sync_status on public.payments;
create trigger payments_sync_status after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_payment_status();
