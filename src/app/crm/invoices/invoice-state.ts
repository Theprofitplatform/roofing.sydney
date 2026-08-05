import type { Invoice, InvoiceKind, InvoiceStatus } from "@/lib/db/types";

/**
 * What an invoice is doing right now. Pure functions over plain rows, so the
 * server list and the client table reach the same answer without a round trip.
 *
 * Nothing here writes status. A trigger recomputes it from the sum of the
 * invoice's payments (`sync_invoice_payment_status`, migration 0006), and a
 * second writer to that fact would disagree the first time a payment is
 * reversed. These functions only ever read.
 */

const DAY_MS = 86_400_000;

/** The business's day, not UTC's — an invoice due today is not overdue at 11am. */
const BUSINESS_TIMEZONE = "Australia/Sydney";

const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Awaiting payment",
  part_paid: "Part paid",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  deposit: "Deposit",
  progress: "Progress claim",
  final: "Final invoice",
};

/** Today as a plain ISO day, comparable against a `date` column verbatim. */
export function businessToday(now: Date = new Date()): string {
  return DATE_FORMAT.format(now);
}

/** What is still owed. A voided invoice owes nothing, whatever its total says. */
export function balanceCents(
  invoice: Pick<Invoice, "status" | "total_cents">,
  paidCents: number,
): number {
  if (invoice.status === "void") return 0;
  return Math.max(0, invoice.total_cents - paidCents);
}

/** Only an unsettled invoice can run late; paid and void are finished. */
export function isOverdue(
  invoice: Pick<Invoice, "status" | "due_at" | "total_cents">,
  paidCents: number,
  now: Date = new Date(),
): boolean {
  if (!invoice.due_at) return false;
  if (balanceCents(invoice, paidCents) <= 0) return false;
  return invoice.due_at < businessToday(now);
}

/** Whole days past the due date. Zero when the invoice is not late. */
export function overdueDays(
  invoice: Pick<Invoice, "status" | "due_at" | "total_cents">,
  paidCents: number,
  now: Date = new Date(),
): number {
  if (!isOverdue(invoice, paidCents, now) || !invoice.due_at) return 0;
  const due = Date.parse(`${invoice.due_at}T00:00:00Z`);
  const today = Date.parse(`${businessToday(now)}T00:00:00Z`);
  return Math.max(0, Math.round((today - due) / DAY_MS));
}

/**
 * Which pill the status wears. The stylesheet ships five modifiers and no more,
 * so these map onto the existing vocabulary rather than inventing classes the
 * CSS does not define: brand tint for in-flight, green for settled, amber for
 * part paid, muted for finished-with.
 */
export function invoicePillClass(status: InvoiceStatus, overdue: boolean): string {
  if (overdue) return "pill pill--warning";
  switch (status) {
    case "paid": return "pill pill--sent";
    case "part_paid": return "pill pill--warning";
    case "sent": return "pill pill--viewed";
    default: return "pill pill--draft";
  }
}

export type InvoiceTab = "all" | "sent" | "part_paid" | "paid" | "overdue" | "void";

export const INVOICE_TABS: { id: InvoiceTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sent", label: "Awaiting" },
  { id: "part_paid", label: "Part paid" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
  { id: "void", label: "Void" },
];

export function matchesTab(
  tab: InvoiceTab,
  invoice: Pick<Invoice, "status" | "due_at" | "total_cents">,
  paidCents: number,
  now: Date = new Date(),
): boolean {
  switch (tab) {
    case "all": return true;
    case "overdue": return isOverdue(invoice, paidCents, now);
    case "sent": return invoice.status === "sent" || invoice.status === "draft";
    default: return invoice.status === tab;
  }
}

/** Short AU date for a table cell. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-AU", {
    timeZone: BUSINESS_TIMEZONE,
    day: "numeric",
    month: "short",
  });
}

/** Longer form for the detail rail, where the year matters. */
export function longDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-AU", {
    timeZone: BUSINESS_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
