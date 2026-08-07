/**
 * Structural shape of the parts of `NextRequest` this needs. Declared here
 * rather than imported so the helper — and its tests — stay free of
 * `next/server`, which node's loader cannot resolve outside the bundler.
 */
export type OriginSource = {
  headers: { get(name: string): string | null };
  nextUrl: { origin: string; protocol: string };
};

/** Bind addresses and the self-proxy's own Host, none of which are a real origin. */
const NOT_AN_ORIGIN = /^(0\.0\.0\.0|127\.0\.0\.1|\[::\]|\[::1\]|localhost)(:|$)/;

/**
 * The hostname the operator actually typed.
 *
 * `request.nextUrl.origin` is not it. In the standalone server the container
 * runs, Next's own origin is the address it binds — `https://0.0.0.0:3000` —
 * so any redirect built from it lands the operator on a dead URL. It fails
 * *late*, which is what makes it expensive: a code exchange succeeds and the
 * session cookie is set, so the only visible symptom is a browser error page
 * at the very end of an otherwise working sign-in.
 *
 * The host split compounds it. Middleware rewrites CRM paths internally, and
 * because Next treats that rewrite as external it proxies back to itself — the
 * second pass arrives with `Host: localhost`. So `Host` alone is not reliable
 * either. nginx sets `X-Forwarded-Host` from `$host` on the way in and Next
 * preserves it across the internal hop, which makes it the one header that
 * survives both.
 *
 * Falls back through `Host` to `nextUrl.origin` for `next dev`, where there is
 * no proxy and no forwarded headers.
 */
export function publicOrigin(request: OriginSource): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host || NOT_AN_ORIGIN.test(host)) return request.nextUrl.origin;

  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");

  return `${proto}://${host}`;
}
