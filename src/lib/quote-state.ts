/**
 * Quote lifecycle state: what a quote is doing right now, and whether it needs
 * you. Pure functions over plain data, so both the server list and the client
 * table derive the same answer and neither needs a database round trip.
 *
 * The prototype had this logic inline in the quotes screen with `viewed_at`
 * supplied by sample data. Nothing ever wrote that field, so the "needs
 * follow-up" flag was permanently stuck on for every sent quote. The flag is
 * only worth having once the portal writes the field — see lib/db/portal.ts.
 */

import type { Quote, QuoteStatus } from "./db/types";

const DAY_MS = 86_400_000;

/** What a quote is displayed as. `viewed` is a status the client caused. */
export type DisplayStatus = QuoteStatus;

export function displayStatus(quote: Pick<Quote, "status" | "viewed_at">): DisplayStatus {
  // A quote can be `sent` in the database and viewed in reality if the portal
  // recorded the open without promoting the row; prefer the stronger signal.
  if (quote.status === "sent" && quote.viewed_at) return "viewed";
  return quote.status;
}

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  superseded: "Superseded",
};

/** Date the price stops holding. Measured from issue, falling back to creation. */
export function issuedAt(quote: Pick<Quote, "sent_at" | "created_at">): Date {
  return new Date(quote.sent_at ?? quote.created_at);
}

export function validUntil(quote: Pick<Quote, "sent_at" | "created_at" | "valid_days">): Date {
  return new Date(issuedAt(quote).getTime() + (quote.valid_days || 30) * DAY_MS);
}

/** Whole days from `a` to `b`; negative when `b` is in the past. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export interface QuoteFlags {
  /** Days until expiry. Negative once expired. */
  daysLeft: number;
  /** Days since issue, or null for a draft. */
  sentDays: number | null;
  needsFollowUp: boolean;
  expiring: boolean;
  expired: boolean;
  /** Any of the above — drives the "Attention" filter and its count. */
  attention: boolean;
}

/** A quote in a terminal state is finished; it cannot need chasing. */
const TERMINAL: ReadonlySet<QuoteStatus> = new Set([
  "accepted",
  "declined",
  "superseded",
] as const);

export function quoteFlags(
  quote: Pick<Quote, "status" | "sent_at" | "created_at" | "valid_days" | "viewed_at">,
  settings: { follow_up_days?: number | null } = {},
  now: Date = new Date(),
): QuoteFlags {
  const daysLeft = daysBetween(now, validUntil(quote));
  const sentDays = quote.sent_at ? daysBetween(new Date(quote.sent_at), now) : null;
  const followDays = settings.follow_up_days ?? 7;

  const settled = TERMINAL.has(quote.status);

  // Sent, never opened, and old enough that silence means something.
  const needsFollowUp =
    !settled && quote.status === "sent" && !quote.viewed_at && sentDays !== null && sentDays >= followDays;

  const live = !settled && quote.status !== "draft";
  const expired = live && daysLeft < 0;
  const expiring = live && !expired && daysLeft <= 7;

  return {
    daysLeft,
    sentDays,
    needsFollowUp,
    expiring,
    expired,
    attention: needsFollowUp || expiring || expired,
  };
}

/** One-line reason a quote is flagged, or null when it is not. */
export function nudgeText(flags: QuoteFlags): string | null {
  if (flags.expired) return `expired ${Math.abs(flags.daysLeft)}d ago`;
  if (flags.needsFollowUp) return `sent ${flags.sentDays}d ago — no view`;
  if (flags.expiring) {
    return flags.daysLeft === 0 ? "expires today" : `expires in ${flags.daysLeft}d`;
  }
  return null;
}

/** Severity for styling the nudge. */
export function nudgeLevel(flags: QuoteFlags): "critical" | "warning" | null {
  if (flags.expired) return "critical";
  if (flags.needsFollowUp) return "warning";
  if (flags.expiring) return flags.daysLeft <= 3 ? "critical" : "warning";
  return null;
}

/** An issued, unexpired, undecided quote is the only thing a client may accept. */
export function isAcceptable(
  quote: Pick<Quote, "status" | "sent_at" | "created_at" | "valid_days">,
  now: Date = new Date(),
): boolean {
  if (!quote.sent_at) return false;
  if (TERMINAL.has(quote.status) || quote.status === "expired") return false;
  return validUntil(quote).getTime() >= now.getTime();
}
