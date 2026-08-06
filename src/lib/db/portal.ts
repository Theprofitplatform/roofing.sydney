import "server-only";
import { admin, unwrap, DbError } from "./client";
import type { Quote, Tier } from "./types";

/**
 * The client portal's data access.
 *
 * Homeowners never get an account — an account is friction at exactly the moment
 * you want a signature. So every function here runs as the service role and is
 * scoped by a high-entropy `portal_token` that identifies one quote and discloses
 * nothing about any other. There is deliberately no anon RLS policy on `quotes`:
 * a token-matching policy exposed to the anon role would make the whole table
 * probeable one guess at a time.
 */

/**
 * Tokens are 24 random bytes hex-encoded — 48 characters. Reject anything that
 * cannot be one before it reaches the database, so a scanner probing the route
 * costs us a regex rather than a query.
 */
const TOKEN_PATTERN = /^[a-f0-9]{48,}$/i;

export function isPlausibleToken(token: string | undefined | null): boolean {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/**
 * First open sets `viewed_at`; later opens do not move it.
 *
 * This matters more than it looks. `viewed_at` is what clears the follow-up
 * nudge — in the prototype it was sample data that nothing ever wrote, so every
 * sent quote flagged as needing a chase forever. Restamping it on each reload
 * would break it the other way, making a quote look freshly read every time the
 * homeowner glanced at it.
 */
export async function recordView(token: string): Promise<Quote> {
  const supabase = admin();
  return unwrap<Quote>(
    "recordView",
    await supabase.rpc("record_quote_view", { p_portal_token: token }).single(),
  );
}

export interface AcceptInput {
  token: string;
  signedName: string;
  signedIp?: string | null;
  selectedItemIds?: string[];
  selectedTier?: Tier | null;
  acceptedTotalCents: number;
}

/**
 * Accept. Signature, status and the client's chosen extras land in a single
 * statement — that atomicity is the legal artefact, and splitting the writes
 * would allow an accepted quote with no signature or a signature against a quote
 * that never accepted. Expiry is refused here, server-side; hiding the button is
 * not a guard.
 */
export async function acceptQuote(input: AcceptInput): Promise<Quote> {
  const supabase = admin();
  return unwrap<Quote>(
    "acceptQuote",
    await supabase
      .rpc("accept_quote", {
        p_portal_token: input.token,
        p_signed_name: input.signedName,
        p_signed_ip: input.signedIp ?? null,
        p_selected_item_ids: input.selectedItemIds ?? null,
        p_selected_tier: input.selectedTier ?? null,
        p_accepted_total_cents: input.acceptedTotalCents,
      })
      .single(),
  );
}

export async function declineQuote(token: string, reason?: string | null): Promise<Quote> {
  const supabase = admin();
  return unwrap<Quote>(
    "declineQuote",
    await supabase
      .rpc("decline_quote", { p_portal_token: token, p_reason: reason ?? null })
      .single(),
  );
}

/**
 * A signed, time-limited URL for the stored PDF. The bucket stays private; a
 * link that never expires is a link that leaks.
 */
export async function signedPdfUrl(pdfPath: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = admin();
  const { data, error } = await supabase.storage
    .from(QUOTE_BUCKET)
    .createSignedUrl(pdfPath, expiresInSeconds);
  if (error) {
    // A missing artefact must not take the portal page down with it.
    console.error("signedPdfUrl failed", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Private bucket holding issued PDFs and site photos. */
export const QUOTE_BUCKET = "quotes";

/** Upload the issued PDF and return its storage path. */
export async function storeQuotePdf(
  quoteId: string,
  quoteNumber: string,
  pdf: Buffer,
): Promise<string> {
  const supabase = admin();
  // Path carries the quote id so an artefact is always traceable to its record,
  // and the number so a downloaded file is recognisable on disk.
  const path = `${quoteId}/${quoteNumber}.pdf`;
  const { error } = await supabase.storage.from(QUOTE_BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    // An issued quote is written once. Overwriting would silently replace the
    // artefact the client already received.
    upsert: false,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`storeQuotePdf: ${error.message}`);
  }
  return path;
}

/** Fetch a stored PDF back — used to attach it to the outgoing email. */
export async function readQuotePdf(path: string): Promise<Buffer | null> {
  const supabase = admin();
  const { data, error } = await supabase.storage.from(QUOTE_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export { DbError };
