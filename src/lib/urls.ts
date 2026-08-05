/**
 * Absolute URLs for links that leave the application — quote emails, portal
 * links, Stripe return URLs.
 *
 * These cannot be relative: they are read in a mail client. And they cannot be
 * derived from the incoming request, because a quote can be issued from a
 * background path with no request in scope.
 *
 * The split matters. The portal link goes to the PUBLIC host, not the operator
 * one: a homeowner clicking through to `app.roofing.sydney` is being shown the
 * back office's address for no reason, and the middleware serves `/q/*` on both
 * hosts precisely so this choice is free.
 */

const DEFAULT_SITE = "https://roofing.sydney";

function normalise(value: string | undefined, fallback: string): string {
  const raw = (value ?? "").trim() || fallback;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Public marketing site — where homeowners land. */
export function siteUrl(): string {
  return normalise(process.env.NEXT_PUBLIC_SITE_URL, DEFAULT_SITE);
}

/** Operator CRM host. */
export function appUrl(): string {
  return normalise(process.env.NEXT_PUBLIC_APP_HOST, "app.roofing.sydney");
}

/** The homeowner-facing link for an issued quote. Null until it has a token. */
export function portalUrl(portalToken: string | null | undefined): string | null {
  if (!portalToken) return null;
  return `${siteUrl()}/q/${portalToken}`;
}

/** Operator-facing deep link, for notification emails back to John. */
export function quoteUrl(quoteId: string): string {
  return `${appUrl()}/quotes/${quoteId}`;
}

export function invoiceUrl(invoiceId: string): string {
  return `${appUrl()}/invoices/${invoiceId}`;
}
