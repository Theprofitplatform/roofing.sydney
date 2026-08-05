"use server";

import { revalidateCrm } from "@/lib/revalidate";

import { getCurrentUser } from "@/lib/supabase-server";
import { getQuote, issueQuote, reviseQuote, setPdfPath } from "@/lib/db/quotes";
import { getSettings, saveQuoteAsTemplate } from "@/lib/db/library";
import { readQuotePdf, storeQuotePdf } from "@/lib/db/portal";
import { logActivity } from "@/lib/db/pipeline";
import { renderQuotePdf } from "@/lib/pdf/render";
import { defaultQuoteSubject, sendQuoteEmail } from "@/lib/email-quote";
import { defaultSelection, priceSelection } from "@/lib/quote-pricing";
import { portalUrl } from "@/lib/urls";
import type { Quote } from "@/lib/db/types";

import { message, type ActionResult } from "../errors";
import { pdfFilename, scopeFromQuoteItems } from "../helpers";
import { photoDataUrls } from "../photo-storage";

/**
 * Issuing, revising and chasing a quote.
 *
 * The ordering in `issueAndSend` is the whole point of this file. The quote is
 * committed as issued FIRST — number drawn, totals frozen, portal token minted —
 * and only then is a PDF rendered and an email attempted, each inside its own
 * try/catch. A Resend outage must report "issued as Q-2026-0008 but the email
 * failed", never a 500 that implies the document was not issued. It was, the
 * number is spent, and a UI that pretends otherwise will have the operator
 * issuing it a second time.
 */

const refresh = (quoteId: string) => {
  revalidateCrm("/quotes");
  revalidateCrm(`/quotes/${quoteId}`);
};

/** Best-effort trail. A failed log must never undo a sent document. */
async function noteSent(quote: Quote, body: string, userId: string | null) {
  try {
    await logActivity(
      { kind: "email", body, client_id: quote.client_id, quote_id: quote.id },
      userId,
    );
  } catch (error) {
    console.error("noteSent: activity not recorded", error);
  }
}

export interface SendInput {
  subject: string;
  body: string;
  /**
   * True when the operator typed their own subject. A draft has no number, so
   * the default subject composed before issue reads "Your quote from us"; once
   * the number exists the untouched default is recomposed with it, and a subject
   * the operator wrote is left exactly as they wrote it.
   */
  subjectEdited?: boolean;
}

/**
 * The portal link cannot be shown in the compose window: the token is minted by
 * `issue_quote`, in the same statement that draws the number. It is appended
 * here in the same wording `defaultQuoteBody` uses, and skipped if the operator
 * has already pasted it in themselves.
 */
function withPortalLink(body: string, url: string | null): string {
  if (!url || body.includes(url)) return body;
  return [
    body,
    "",
    "You can view it and accept online here:",
    url,
    "",
    "Accepting online records your name and the date against the quote, so there " +
      "is nothing to print or scan.",
  ].join("\n");
}

type Issued = {
  issued: Quote;
  detail: NonNullable<Awaited<ReturnType<typeof getQuote>>>;
  settings: Awaited<ReturnType<typeof getSettings>>;
};

/**
 * Step 1 and 2, and nothing else. Everything that can legitimately refuse to
 * issue lives here, so the caller can treat its failure as a plain error and
 * everything after it as already-committed.
 */
async function commitIssue(quoteId: string): Promise<Issued | { error: string }> {
  try {
    const detail = await getQuote(quoteId);
    if (!detail) return { error: "That quote no longer exists." };
    if (detail.quote.sent_at) {
      return { error: `${detail.quote.quote_number} has already been issued.` };
    }
    if (detail.items.length === 0) {
      return { error: "A quote needs at least one line item before it can be sent." };
    }

    const settings = await getSettings();

    // What is frozen is what the client receives: the base scope at the
    // cheapest offered tier, with no extras ticked. Both figures come from the
    // client-facing side of the calculation so they reconcile with each other
    // and with the printed document; extras and tier changes land later in
    // accepted_total_cents.
    const scope = scopeFromQuoteItems(detail.items);
    const priced = priceSelection(detail.quote, scope, defaultSelection(scope));

    const issued = await issueQuote(quoteId, priced.display.subtotal, priced.display.total);

    return { issued, detail, settings };
  } catch (error) {
    return { error: message(error, "Couldn't issue that quote.") };
  }
}

export async function issueAndSend(
  quoteId: string,
  input: SendInput,
): Promise<ActionResult<{ quoteNumber: string; warning?: string }>> {
  const committed = await commitIssue(quoteId);
  if ("error" in committed) return { ok: false, error: committed.error };

  const { issued, detail, settings } = committed;

  // From here the number is drawn and the document exists. Nothing below may
  // turn into a failure — only into a warning attached to a success.
  const warnings: string[] = [];
  const number = issued.quote_number ?? "the quote";
  const user = await getCurrentUser();

  // Render and store are separate failures with separate consequences: a PDF
  // that rendered but did not store can still be attached to the email, and the
  // operator needs to know which of the two happened.
  let pdf: Buffer | null = null;
  try {
    pdf = await renderQuotePdf({
      // The WHOLE item set, not the resolved scope. `renderQuotePdf` owns
      // resolution — it prices the offered tier and prints the extras the client
      // can still add, which it can only do if it can see them. Handing it a
      // pre-filtered list silently drops the "Optional extras" table from every
      // quote the business sends.
      quote: issued,
      client: detail.client,
      settings,
      items: detail.items,
      clauses: detail.clauses,
      photos: issued.include_photos ? await photoDataUrls(detail.photos) : [],
    });
  } catch (error) {
    console.error("issueAndSend: render", error);
    warnings.push("the PDF could not be produced");
  }

  if (pdf) {
    try {
      const path = await storeQuotePdf(issued.id, issued.quote_number ?? issued.id, pdf);
      await setPdfPath(issued.id, path);
    } catch (error) {
      console.error("issueAndSend: store", error);
      warnings.push("the PDF could not be filed against the quote");
    }
  }

  const to = detail.client.email;
  if (!to) {
    warnings.push("the client has no email on file, so nothing was sent");
  } else {
    const result = await sendQuoteEmail({
      to,
      subject: input.subjectEdited ? input.subject : defaultQuoteSubject(issued, settings),
      body: withPortalLink(input.body, portalUrl(issued.portal_token)),
      settings,
      attachment: pdf ? { filename: pdfFilename(issued), content: pdf } : null,
    });
    if (result.sent) {
      await noteSent(issued, `Quote ${number} emailed to ${to}`, user?.id ?? null);
    } else {
      warnings.push(`the email failed (${result.error ?? "unknown error"})`);
    }
  }

  refresh(quoteId);
  return {
    ok: true,
    quoteNumber: number,
    warning: warnings.length > 0 ? `Issued as ${number}, but ${warnings.join(", and ")}.` : undefined,
  };
}

/** Chase an issued quote. Re-attaches the stored PDF so the link and the paper match. */
export async function sendFollowUp(
  quoteId: string,
  input: SendInput,
): Promise<ActionResult<{ warning?: string }>> {
  try {
    const detail = await getQuote(quoteId);
    if (!detail) return { ok: false, error: "That quote no longer exists." };
    if (!detail.quote.sent_at) {
      return { ok: false, error: "This quote has not been issued yet." };
    }
    if (!detail.client.email) {
      return { ok: false, error: "The client has no email on file." };
    }

    const settings = await getSettings();
    const pdf = detail.quote.pdf_path ? await readQuotePdf(detail.quote.pdf_path) : null;

    const result = await sendQuoteEmail({
      to: detail.client.email,
      subject: input.subject,
      body: input.body,
      settings,
      attachment: pdf ? { filename: pdfFilename(detail.quote), content: pdf } : null,
    });

    if (!result.sent) {
      return { ok: false, error: `The follow-up didn't send: ${result.error ?? "unknown error"}` };
    }

    const user = await getCurrentUser();
    await noteSent(
      detail.quote,
      `Follow-up on ${detail.quote.quote_number} sent to ${detail.client.email}`,
      user?.id ?? null,
    );

    refresh(quoteId);
    return { ok: true, warning: pdf ? undefined : "Sent without the PDF — none is stored for this quote." };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't send that follow-up.") };
  }
}

/** The companion to lock-on-issue: a linked v2 draft, with the parent superseded. */
export async function reviseQuoteAction(quoteId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    const revision = await reviseQuote(quoteId, user?.id ?? null);
    refresh(quoteId);
    revalidateCrm(`/quotes/${revision.id}/edit`);
    return { ok: true, id: revision.id };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't raise a revision.") };
  }
}

export async function saveAsTemplate(
  quoteId: string,
  input: { label: string; sub?: string; icon?: string },
): Promise<ActionResult<{ label: string }>> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "A template needs a name." };

  try {
    const template = await saveQuoteAsTemplate(
      quoteId,
      label,
      input.sub?.trim() || null,
      input.icon?.trim() || null,
    );
    revalidateCrm("/quotes");
    revalidateCrm("/settings");
    return { ok: true, label: template.label };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't save that as a template.") };
  }
}
