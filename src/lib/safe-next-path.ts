/**
 * Sanitise a `?next=` destination down to a path on this origin.
 *
 * The value arrives from the query string, so it is attacker-controlled: a
 * bare `https://evil.example` or a protocol-relative `//evil.example` would
 * otherwise turn the sign-in flow into an open redirect, and one that carries
 * the credibility of the operator's own login page.
 *
 * Anything that is not a plain absolute path falls back to the dashboard.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  // "//host" and "/\host" are both protocol-relative to a browser.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
