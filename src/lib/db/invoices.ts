import "server-only";
import { db, admin, unwrap, unwrapMaybe, unwrapList, DbError } from "./client";
import type { Client, Invoice, InvoiceKind, Payment, PaymentMethod, Quote } from "./types";

/**
 * Money in. Nothing upstream depends on this module — that is deliberate, and it
 * is what keeps the whole money column deferrable if John decides Xero should
 * keep doing the invoicing.
 */

export interface InvoiceRow {
  invoice: Invoice;
  quote: Pick<Quote, "id" | "quote_number" | "roof_type"> | null;
  client: Pick<Client, "id" | "name" | "email"> | null;
  paid_cents: number;
}

type InvoiceShape = Invoice & {
  quote: (InvoiceRow["quote"] & { client: InvoiceRow["client"] }) | null;
  payments: Pick<Payment, "amount_cents">[];
};

const INVOICE_SELECT = `
  *,
  quote:quotes (id, quote_number, roof_type, client:clients (id, name, email)),
  payments (amount_cents)
`;

function toRow(row: InvoiceShape): InvoiceRow {
  const { quote, payments, ...invoice } = row;
  const client = quote?.client ?? null;
  const quoteFields = quote ? { id: quote.id, quote_number: quote.quote_number, roof_type: quote.roof_type } : null;
  return {
    invoice: invoice as Invoice,
    quote: quoteFields,
    client,
    paid_cents: payments.reduce((sum, p) => sum + p.amount_cents, 0),
  };
}

export async function listInvoices(): Promise<InvoiceRow[]> {
  const supabase = await db();
  const rows = unwrapList<InvoiceShape>(
    "listInvoices",
    await supabase.from("invoices").select(INVOICE_SELECT).order("created_at", { ascending: false }),
  );
  return rows.map(toRow);
}

export async function getInvoice(id: string): Promise<InvoiceRow | null> {
  const supabase = await db();
  const row = unwrapMaybe<InvoiceShape>(
    "getInvoice",
    await supabase.from("invoices").select(INVOICE_SELECT).eq("id", id).single(),
  );
  return row ? toRow(row) : null;
}

export async function raiseInvoice(
  kind: InvoiceKind,
  totalCents: number,
  opts: { quoteId?: string | null; jobId?: string | null; dueAt?: string | null } = {},
): Promise<Invoice> {
  const supabase = await db();
  return unwrap<Invoice>(
    "raiseInvoice",
    await supabase
      .rpc("raise_invoice", {
        p_kind: kind,
        p_total_cents: totalCents,
        p_quote_id: opts.quoteId ?? null,
        p_job_id: opts.jobId ?? null,
        p_due_at: opts.dueAt ?? null,
      })
      .single(),
  );
}

/**
 * Raise the deposit the PDF already promises. Returns null when deposits are
 * switched off in settings — that is a configuration answer, not an error.
 * Idempotent: accepting a quote twice cannot bill the deposit twice.
 */
export async function raiseDepositInvoice(quoteId: string): Promise<Invoice | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .rpc("raise_deposit_invoice", { p_quote_id: quoteId })
    .maybeSingle();
  if (error) throw new DbError("raiseDepositInvoice", error);
  return (data as Invoice | null) ?? null;
}

export async function listPayments(invoiceId: string): Promise<Payment[]> {
  const supabase = await db();
  return unwrapList<Payment>(
    "listPayments",
    await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("received_at", { ascending: true }),
  );
}

/**
 * Book a payment. A trigger reconciles the invoice status from the sum of its
 * payments, so part-payments settle correctly without the caller reasoning about
 * it. `reference` is unique per invoice, which is what makes a retried Stripe
 * webhook idempotent.
 */
export async function recordPayment(
  invoiceId: string,
  amountCents: number,
  method: PaymentMethod,
  reference?: string | null,
): Promise<Payment> {
  const supabase = await db();
  return unwrap<Payment>(
    "recordPayment",
    await supabase
      .rpc("record_payment", {
        p_invoice_id: invoiceId,
        p_amount_cents: amountCents,
        p_method: method,
        p_reference: reference ?? null,
      })
      .single(),
  );
}

/**
 * Webhook path. Stripe posts with no operator session, so this runs as the
 * service role. Duplicate deliveries are absorbed by the unique index on
 * (invoice_id, reference) — a conflict here means "already booked", not a fault.
 */
export async function recordStripePayment(
  invoiceId: string,
  amountCents: number,
  paymentIntentId: string,
): Promise<{ booked: boolean }> {
  const supabase = admin();

  const { error: markError } = await supabase
    .from("invoices")
    .update({ stripe_payment_intent: paymentIntentId })
    .eq("id", invoiceId)
    .is("stripe_payment_intent", null);
  if (markError && markError.code !== "23505") {
    throw new DbError("recordStripePayment/mark", markError);
  }

  const { error } = await supabase.rpc("record_payment", {
    p_invoice_id: invoiceId,
    p_amount_cents: amountCents,
    p_method: "stripe",
    p_reference: paymentIntentId,
  });

  // 23505 = unique_violation: this delivery is a retry we have already booked.
  if (error) {
    if (error.code === "23505") return { booked: false };
    throw new DbError("recordStripePayment", error);
  }
  return { booked: true };
}

export async function findInvoiceByPaymentIntent(
  paymentIntentId: string,
): Promise<Invoice | null> {
  const supabase = admin();
  return unwrapMaybe<Invoice>(
    "findInvoiceByPaymentIntent",
    await supabase
      .from("invoices")
      .select("*")
      .eq("stripe_payment_intent", paymentIntentId)
      .single(),
  );
}

export async function voidInvoice(id: string): Promise<Invoice> {
  const supabase = await db();
  return unwrap<Invoice>(
    "voidInvoice",
    await supabase.from("invoices").update({ status: "void" }).eq("id", id).select("*").single(),
  );
}
