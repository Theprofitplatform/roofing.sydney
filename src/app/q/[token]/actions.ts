"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isRuleViolation } from "@/lib/db/client";
import { getQuoteByPortalToken } from "@/lib/db/quotes";
import { acceptQuote, declineQuote, isPlausibleToken } from "@/lib/db/portal";
import { defaultSelection, priceSelection, validateSelection } from "@/lib/quote-pricing";
import { isAcceptable } from "@/lib/quote-state";
import { notifyQuoteOutcome } from "@/lib/email-quote";
import { getPortalSettings } from "../portal-settings";
import { clientIp, decisionLimiter } from "../rate-limit";
import type { Client, Quote, Tier } from "@/lib/db/types";

/**
 * The two writes a homeowner can make.
 *
 * Both are unauthenticated by design — the token in the URL is the credential —
 * so everything they are allowed to assert is re-derived here: the quote is
 * re-read, the selection is re-validated against that quote's own line items,
 * and the accepted total is recomputed from cost on the server. Nothing the
 * browser posts is trusted except the token, the name and which boxes were
 * ticked.
 */

export type PortalResult = { ok: true } | { ok: false; error: string };

/** Said to anyone whose token does not resolve, whatever the reason. */
const NOT_FOUND =
  "This quote link is no longer valid. Please check the link in your email, or give us a call.";

const GENERIC = "We couldn't record that just now. Please try again, or give us a call.";

const MAX_NAME = 120;
const MAX_REASON = 500;

export interface AcceptInput {
  token: string;
  signedName: string;
  tier?: Tier | null;
  optionalIds?: string[];
}

export interface DeclineInput {
  token: string;
  reason?: string;
}

export async function acceptQuoteAction(input: AcceptInput): Promise<PortalResult> {
  const gate = await gateway();
  if ("error" in gate) return { ok: false, error: gate.error };

  if (!isPlausibleToken(input.token)) return { ok: false, error: NOT_FOUND };

  const signedName = (input.signedName ?? "").trim().replace(/\s+/g, " ");
  if (signedName.length < 2) {
    return { ok: false, error: "Please type your full name to accept this quote." };
  }
  if (signedName.length > MAX_NAME) {
    return { ok: false, error: "That name is longer than we can record." };
  }

  try {
    const detail = await getQuoteByPortalToken(input.token);
    if (!detail || !detail.quote.sent_at) return { ok: false, error: NOT_FOUND };

    const { quote, client, items } = detail;

    // The database refuses an expired or settled quote too. Checking here first
    // buys a sentence the client can act on instead of a raised exception.
    if (!isAcceptable(quote)) return { ok: false, error: refusal(quote) };

    const selection = {
      tier: input.tier ?? null,
      optionalIds: input.optionalIds ?? [],
    };
    const valid = validateSelection(items, selection);
    if (!valid.ok) return { ok: false, error: valid.reason };

    // Recomputed from the quote's own line items. A total posted by the browser
    // is a number the person signing chose, which is not what a signature means.
    const priced = priceSelection(quote, items, selection);

    const accepted = await acceptQuote({
      token: input.token,
      signedName,
      signedIp: gate.ip,
      selectedItemIds: selection.optionalIds.length > 0 ? selection.optionalIds : undefined,
      selectedTier: selection.tier,
      acceptedTotalCents: priced.display.total,
    });

    await notify(accepted, client, "accepted", priced.display.total);

    revalidatePath(`/q/${input.token}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: readable(error) };
  }
}

export async function declineQuoteAction(input: DeclineInput): Promise<PortalResult> {
  const gate = await gateway();
  if ("error" in gate) return { ok: false, error: gate.error };

  if (!isPlausibleToken(input.token)) return { ok: false, error: NOT_FOUND };

  const reason = (input.reason ?? "").trim().slice(0, MAX_REASON);

  try {
    const detail = await getQuoteByPortalToken(input.token);
    if (!detail || !detail.quote.sent_at) return { ok: false, error: NOT_FOUND };

    const { quote, client, items } = detail;
    if (quote.status === "accepted" || quote.status === "declined") {
      return { ok: false, error: refusal(quote) };
    }

    const declined = await declineQuote(input.token, reason || null);

    // The value of a declined quote is what was issued, not what was picked —
    // the client never got as far as picking anything.
    const value =
      quote.total_cents ?? priceSelection(quote, items, defaultSelection(items)).display.total;
    await notify(declined, client, "declined", value);

    revalidatePath(`/q/${input.token}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: readable(error) };
  }
}

// ── Guards and plumbing ────────────────────────────────────────────────────

/** Rate limit and client address, resolved together because both come from the request. */
async function gateway(): Promise<{ ip: string | null } | { error: string }> {
  const head = await headers();
  const ip = clientIp(head.get("x-forwarded-for"), head.get("x-real-ip"));
  const verdict = decisionLimiter.check(ip ?? "unknown");
  if (!verdict.ok) {
    const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
    return {
      error: `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again, or give us a call.`,
    };
  }
  return { ip };
}

/** Why this quote cannot be settled, in words a homeowner can act on. */
function refusal(quote: Quote): string {
  if (quote.status === "accepted") {
    return `This quote was already accepted${quote.signed_name ? ` by ${quote.signed_name}` : ""}.`;
  }
  if (quote.status === "declined") return "This quote has already been declined.";
  if (quote.status === "superseded") {
    return "This quote has been replaced by a newer version. Please use the most recent link we sent you, or give us a call.";
  }
  return "This quote has passed its expiry date, so it can no longer be accepted online. Give us a call and we'll re-quote at current prices.";
}

/**
 * Tell the operator. Best-effort by design: a notification that fails must never
 * undo an acceptance the client has already signed.
 */
async function notify(
  quote: Quote,
  client: Client,
  outcome: "accepted" | "declined",
  totalCents: number,
): Promise<void> {
  try {
    const settings = await getPortalSettings();
    if (!settings) return;
    const result = await notifyQuoteOutcome(quote, client, settings, outcome, totalCents);
    if (!result.sent) console.error(`portal notify (${outcome}) failed: ${result.error}`);
  } catch (error) {
    console.error(`portal notify (${outcome}) threw`, error);
  }
}

/**
 * A rule the database enforced on purpose carries a message written to be read;
 * anything else is a fault the client should not see the internals of. The db
 * layer prefixes its errors with the call site, which is useful in a log and
 * noise in a browser.
 */
function readable(error: unknown): string {
  if (!isRuleViolation(error)) {
    console.error("portal action failed", error);
    return GENERIC;
  }
  const raw = (error instanceof Error ? error.message : String(error)).replace(
    /^[A-Za-z_]+:\s*/,
    "",
  );
  const sentence = raw.charAt(0).toUpperCase() + raw.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
