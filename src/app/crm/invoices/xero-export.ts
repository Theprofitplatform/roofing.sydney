import "server-only";
import { getInvoice } from "@/lib/db/invoices";
import { getQuote, listQuotes, type QuoteDetail } from "@/lib/db/quotes";
import { getSettings } from "@/lib/db/library";
import { defaultSelection, resolveScope, type ScopeItem } from "@/lib/quote-pricing";
import { toXeroInvoicePayload, xeroCsvRows, type XeroCsvRow, type XeroInvoicePayload } from "@/lib/xero";

/**
 * Assembles what `src/lib/xero.ts` needs from the database. Kept out of
 * `actions.ts` because a "use server" module may only export async actions, and
 * these are ordinary functions the detail page also calls directly.
 */

/**
 * The lines the client actually bought: the tier they picked and the extras they
 * ticked, not every line the quote could have contained. Before acceptance
 * there is no answer yet, so the portal's opening default stands in.
 */
export function acceptedScope(detail: QuoteDetail): ScopeItem[] {
  const items = detail.items as ScopeItem[];
  if (!detail.quote.accepted_at) return resolveScope(items, defaultSelection(items));

  return resolveScope(items, {
    tier: detail.quote.selected_tier,
    optionalIds: detail.selections.map((s) => s.quote_item_id),
  });
}

/** The ACCREC body for one invoice, or null when the invoice is gone. */
export async function invoiceXeroPayload(invoiceId: string): Promise<XeroInvoicePayload | null> {
  const row = await getInvoice(invoiceId);
  if (!row) return null;

  const [settings, detail] = await Promise.all([
    getSettings(),
    row.quote ? getQuote(row.quote.id) : Promise.resolve(null),
  ]);

  return toXeroInvoicePayload(
    row.invoice,
    detail?.client ?? row.client,
    detail?.quote ?? null,
    detail ? acceptedScope(detail) : [],
    settings,
  );
}

/**
 * CSV rows for a selection of invoices.
 *
 * One round trip per invoice. That is an N+1, and deliberate: the export is an
 * operator pressing a button over a single roofer's book of work, and a bespoke
 * join would be a second definition of "what is on this invoice" to keep in step
 * with the one above.
 */
export async function invoiceCsvRows(invoiceIds: readonly string[]): Promise<XeroCsvRow[]> {
  const rows: XeroCsvRow[] = [];
  for (const id of invoiceIds) {
    const payload = await invoiceXeroPayload(id);
    if (payload) rows.push(...xeroCsvRows(payload));
  }
  return rows;
}

/**
 * Accepted quotes as draft sales invoices — the path John takes if Xero keeps
 * doing his invoicing and this app never raises one.
 *
 * Xero's importer requires an invoice number, so the quote number becomes it.
 * That also makes the import idempotent: re-running it updates the same Xero
 * invoice rather than raising a duplicate against the same job.
 */
export async function acceptedQuoteCsvRows(): Promise<XeroCsvRow[]> {
  const [quotes, settings] = await Promise.all([listQuotes(), getSettings()]);
  const accepted = quotes.filter((q) => q.quote.status === "accepted");

  const rows: XeroCsvRow[] = [];
  for (const { quote } of accepted) {
    // The list carries costed items but not their descriptions, and a Xero line
    // without a description is not an invoice line.
    const detail = await getQuote(quote.id);
    if (!detail) continue;

    const totalCents = detail.quote.accepted_total_cents ?? detail.quote.total_cents ?? 0;

    const payload = toXeroInvoicePayload(
      {
        invoice_number: detail.quote.quote_number,
        kind: "final",
        total_cents: totalCents,
        due_at: null,
        created_at: detail.quote.created_at,
        sent_at: detail.quote.accepted_at ?? detail.quote.sent_at,
      },
      detail.client,
      detail.quote,
      acceptedScope(detail),
      settings,
    );

    rows.push(...xeroCsvRows(payload));
  }
  return rows;
}
