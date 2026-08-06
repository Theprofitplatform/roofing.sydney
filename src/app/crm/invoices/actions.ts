"use server";

import { revalidateCrm } from "@/lib/revalidate";
import { DbError, isRuleViolation } from "@/lib/db/client";
import {
  getInvoice,
  raiseInvoice,
  recordPayment,
  voidInvoice,
} from "@/lib/db/invoices";
import { getJobForQuote } from "@/lib/db/jobs";
import { getQuote } from "@/lib/db/quotes";
import { getSettings } from "@/lib/db/library";
import { createCheckoutSession, StripeNotConfiguredError } from "@/lib/stripe";
import { toXeroCsv } from "@/lib/xero";
import { money } from "@/lib/money";
import { portalUrl, siteUrl } from "@/lib/urls";
import { balanceCents } from "./invoice-state";
import { acceptedQuoteCsvRows, invoiceCsvRows, invoiceXeroPayload } from "./xero-export";
import type { InvoiceKind, PaymentMethod } from "@/lib/db/types";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * What the operator is allowed to read.
 *
 * A trigger rejecting on purpose has a message written for them — "a deposit is
 * only due on acceptance" — and that should reach the screen intact, minus the
 * call-site prefix DbError adds for the log. Any other database failure is a
 * fault, and a raw Postgres string in the UI teaches nothing while leaking the
 * schema.
 */
function operatorMessage(error: unknown): string {
  if (isRuleViolation(error) && error instanceof Error) {
    const split = error.message.indexOf(": ");
    return split === -1 ? error.message : error.message.slice(split + 2);
  }
  if (error instanceof StripeNotConfiguredError) return error.message;
  if (error instanceof DbError) {
    console.error("[invoices]", error.message, error.details);
    return "The database refused that. Try again, and check the server log if it persists.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function refresh(invoiceId?: string) {
  revalidateCrm("/invoices");
  if (invoiceId) revalidateCrm(`/invoices/${invoiceId}`);
}

const MANUAL_METHODS: PaymentMethod[] = ["bank_transfer", "cash", "other"];

export interface RecordPaymentInput {
  invoiceId: string;
  amountCents: number;
  method: PaymentMethod;
  reference?: string | null;
}

/**
 * Book a payment received outside Stripe.
 *
 * The invoice's status is not set here and must not be: `sync_invoice_payment_status`
 * recomputes it from the sum of the payments, so a part-payment settles to
 * `part_paid` and the one that closes it settles to `paid` without this action
 * reasoning about either.
 */
export async function recordPaymentAction(input: RecordPaymentInput): Promise<Result<object>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (!MANUAL_METHODS.includes(input.method)) {
    return { ok: false, error: "Choose how the payment was received." };
  }

  try {
    const row = await getInvoice(input.invoiceId);
    if (!row) return { ok: false, error: "That invoice no longer exists." };
    if (row.invoice.status === "void") {
      return { ok: false, error: "This invoice has been voided. Raise a new one instead." };
    }

    // A typo is far likelier than a genuine overpayment, and an overpaid invoice
    // is a reconciliation problem that surfaces months later at BAS time.
    const outstanding = balanceCents(row.invoice, row.paid_cents);
    if (input.amountCents > outstanding) {
      return {
        ok: false,
        error: `That is more than the ${money(outstanding)} outstanding on this invoice.`,
      };
    }

    await recordPayment(
      input.invoiceId,
      input.amountCents,
      input.method,
      input.reference?.trim() || null,
    );
    refresh(input.invoiceId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: operatorMessage(error) };
  }
}

/**
 * Mint a Stripe Checkout link for the balance.
 *
 * The link returns the homeowner to their own quote portal — they already have
 * that URL, it is where their document lives, and it needs no session. Landing a
 * paying customer on the marketing homepage would be the alternative.
 */
export async function createPaymentLinkAction(
  invoiceId: string,
): Promise<Result<{ url: string; expiresAt: string; amountCents: number }>> {
  try {
    const row = await getInvoice(invoiceId);
    if (!row) return { ok: false, error: "That invoice no longer exists." };
    if (row.invoice.status === "void") {
      return { ok: false, error: "A voided invoice cannot be paid." };
    }
    const balance = balanceCents(row.invoice, row.paid_cents);
    if (balance <= 0) {
      return { ok: false, error: "This invoice is already paid in full." };
    }

    const [settings, detail] = await Promise.all([
      getSettings(),
      row.quote ? getQuote(row.quote.id) : Promise.resolve(null),
    ]);

    const returnTo = portalUrl(detail?.quote.portal_token) ?? `${siteUrl()}/`;

    const session = await createCheckoutSession({
      // The BALANCE, not the total. A deposit already banked by transfer would
      // otherwise be charged a second time, and the webhook books whatever
      // Stripe settles — an overpayment nothing in the system complains about.
      invoice: { ...row.invoice, total_cents: balance },
      client: detail?.client ?? row.client,
      settings,
      successUrl: `${returnTo}?paid=1`,
      cancelUrl: returnTo,
    });

    return {
      ok: true,
      url: session.url,
      expiresAt: session.expiresAt.toISOString(),
      amountCents: balance,
    };
  } catch (error) {
    return { ok: false, error: operatorMessage(error) };
  }
}

export async function voidInvoiceAction(invoiceId: string): Promise<Result<object>> {
  try {
    const row = await getInvoice(invoiceId);
    if (!row) return { ok: false, error: "That invoice no longer exists." };
    if (row.paid_cents > 0) {
      return {
        ok: false,
        error: "Money has been received against this invoice — refund it in your bank or Stripe first.",
      };
    }

    await voidInvoice(invoiceId);
    refresh(invoiceId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: operatorMessage(error) };
  }
}

export interface RaiseInvoiceInput {
  /** The invoice being viewed — its quote and job are what the new one attaches to. */
  fromInvoiceId: string;
  kind: Exclude<InvoiceKind, "deposit">;
  totalCents: number;
  dueAt?: string | null;
}

/**
 * Raise a progress claim or the final invoice against the same job.
 *
 * Deposits are excluded on purpose: `raise_deposit_invoice` owns that path, it
 * is idempotent, and a unique index means a second deposit against one quote
 * cannot exist. Offering it here would be a button the database refuses.
 */
export async function raiseFollowOnInvoiceAction(
  input: RaiseInvoiceInput,
): Promise<Result<{ invoiceId: string }>> {
  if (input.kind !== "progress" && input.kind !== "final") {
    return { ok: false, error: "Choose a progress claim or a final invoice." };
  }
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  try {
    const row = await getInvoice(input.fromInvoiceId);
    if (!row) return { ok: false, error: "That invoice no longer exists." };

    const quoteId = row.quote?.id ?? null;
    // Attach to the job when there is one, so completion and billing reconcile
    // against the same object even if the invoice was raised off the quote.
    const jobId =
      row.invoice.job_id ?? (quoteId ? (await getJobForQuote(quoteId))?.id ?? null : null);

    const invoice = await raiseInvoice(input.kind, input.totalCents, {
      quoteId,
      jobId,
      dueAt: input.dueAt?.trim() || null,
    });

    refresh(input.fromInvoiceId);
    return { ok: true, invoiceId: invoice.id };
  } catch (error) {
    return { ok: false, error: operatorMessage(error) };
  }
}

// ── Xero export ────────────────────────────────────────────────────────────

export interface CsvExport {
  filename: string;
  csv: string;
}

function stamped(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export async function exportInvoicesCsvAction(
  invoiceIds: string[],
): Promise<Result<CsvExport>> {
  if (invoiceIds.length === 0) {
    return { ok: false, error: "Select at least one invoice to export." };
  }
  try {
    const rows = await invoiceCsvRows(invoiceIds);
    if (rows.length === 0) {
      return { ok: false, error: "Those invoices produced no lines to export." };
    }
    return { ok: true, filename: stamped("xero-invoices"), csv: toXeroCsv(rows) };
  } catch (error) {
    return { ok: false, error: operatorMessage(error) };
  }
}

export async function exportAcceptedQuotesCsvAction(): Promise<Result<CsvExport>> {
  try {
    const rows = await acceptedQuoteCsvRows();
    if (rows.length === 0) {
      return { ok: false, error: "No accepted quotes to export yet." };
    }
    return { ok: true, filename: stamped("xero-accepted-quotes"), csv: toXeroCsv(rows) };
  } catch (error) {
    return { ok: false, error: operatorMessage(error) };
  }
}

/** The API-shaped body, for pasting into Xero's demo console or a one-off script. */
export async function xeroPayloadAction(invoiceId: string): Promise<Result<{ json: string }>> {
  try {
    const payload = await invoiceXeroPayload(invoiceId);
    if (!payload) return { ok: false, error: "That invoice no longer exists." };
    return { ok: true, json: JSON.stringify({ Invoices: [payload] }, null, 2) };
  } catch (error) {
    return { ok: false, error: operatorMessage(error) };
  }
}
