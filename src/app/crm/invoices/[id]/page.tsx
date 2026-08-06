import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInvoice, listInvoices, listPayments } from "@/lib/db/invoices";
import { getJobForQuote } from "@/lib/db/jobs";
import { getQuote } from "@/lib/db/quotes";
import { getSettings } from "@/lib/db/library";
import { isStripeConfigured } from "@/lib/stripe";
import { computeDisplayTotals, computeTotals, displayAmountCents, displayUnitCents } from "@/lib/money";
import { acceptedScope } from "../xero-export";
import { InvoiceScreen, type ScopeLine, type SiblingInvoice } from "./invoice-screen";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const row = await getInvoice(id);
  return { title: row?.invoice.invoice_number ?? "Invoice" };
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  const row = await getInvoice(id);
  if (!row) notFound();

  const [payments, settings, everyInvoice, detail] = await Promise.all([
    listPayments(id),
    getSettings(),
    listInvoices(),
    row.quote ? getQuote(row.quote.id) : Promise.resolve(null),
  ]);

  // A progress claim belongs to the job even when it was raised off the quote,
  // so completion and billing reconcile against the same object.
  const job = row.quote ? await getJobForQuote(row.quote.id) : null;
  const jobId = row.invoice.job_id ?? job?.id ?? null;

  // What the client agreed to buy, priced as they saw it. Cost and margin are
  // computed alongside because the operator is entitled to both — the client
  // never sees this screen.
  let scope: ScopeLine[] = [];
  let scopeTotalCents = 0;
  let costCents = 0;
  let marginCents = 0;

  if (detail) {
    const items = acceptedScope(detail);
    const margin = detail.quote.margin_pct;
    const totals = computeTotals(detail.quote, items);
    const display = computeDisplayTotals(detail.quote, items, totals);

    scope = items.map((item) => ({
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      unitCents: displayUnitCents(item, margin),
      amountCents: displayAmountCents(item, margin),
    }));
    scopeTotalCents = display.total;
    costCents = totals.subtotal;
    marginCents = totals.margin;
  }

  // Every invoice raised against the same work, this one included.
  const related = everyInvoice.filter((other) =>
    row.quote ? other.quote?.id === row.quote.id : other.invoice.job_id === row.invoice.job_id,
  );

  const siblings: SiblingInvoice[] = related
    .filter((other) => other.invoice.id !== id)
    .map((other) => ({
      id: other.invoice.id,
      number: other.invoice.invoice_number,
      kind: other.invoice.kind,
      status: other.invoice.status,
      totalCents: other.invoice.total_cents,
    }));

  // What is left to bill, so the "raise another" dialog opens on the right
  // number instead of an empty field. Voided invoices billed nothing.
  const billed = related
    .filter(({ invoice }) => invoice.status !== "void")
    .reduce((sum, { invoice }) => sum + invoice.total_cents, 0);
  const unbilledCents = Math.max(0, scopeTotalCents - billed);

  return (
    <InvoiceScreen
      row={row}
      payments={payments}
      scope={scope}
      scopeTotalCents={scopeTotalCents}
      costCents={costCents}
      marginCents={marginCents}
      unbilledCents={unbilledCents}
      siblings={siblings}
      quoteId={row.quote?.id ?? null}
      jobId={jobId}
      gstOn={Boolean(settings.gst_registered && detail?.quote.gst_enabled)}
      stripeReady={isStripeConfigured()}
    />
  );
}
