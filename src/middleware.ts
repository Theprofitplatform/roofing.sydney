import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Host split + auth gate.
 *
 * One Next.js app serves two sites:
 *   roofing.sydney       → the public marketing site (src/app/**, unchanged)
 *   app.roofing.sydney   → the operator CRM (src/app/crm/**)
 *
 * The CRM lives in a real `crm` directory rather than a `(crm)` route group
 * because route groups are not URL segments and therefore cannot be the
 * target of a rewrite. The rewrite is internal, so CRM URLs stay clean:
 * app.roofing.sydney/quotes renders src/app/crm/quotes.
 */

const APP_HOST = process.env.NEXT_PUBLIC_APP_HOST ?? "app.roofing.sydney";

/** Paths on the CRM host that do not require a session. */
const PUBLIC_CRM_PATHS = ["/login", "/auth"];

/** Client quote portal — token in the URL is the credential, never a session. */
const PORTAL_PREFIX = "/q";

/**
 * Marks the second pass of our own host rewrite.
 *
 * Next resolves `NextResponse.rewrite()` by comparing the target's origin with
 * the request's `Host`. They never match here: behind nginx (and in the
 * standalone server the container runs) Next's own origin is the loopback
 * address it listens on, while `Host` is the hostname the operator typed. So
 * Next treats every CRM rewrite as EXTERNAL and proxies it back to itself over
 * HTTP — and that second request arrives with `Host: localhost`, which this
 * middleware then fails to recognise as the CRM. The symptom was that /login
 * served a bare "Not found" and nobody could sign in at all.
 *
 * Neither origin fixes it: the loopback origin produces exactly that 404, and
 * building the URL from `Host` instead makes Next try to reach the public
 * hostname over the network and 500. So rather than fight the proxy, we mark the
 * forwarded request and let the second pass straight through.
 *
 * On trust: this header is a routing hint, not an authorisation. Forging it on
 * the public host reaches the CRM's HTML shell without the login redirect, and
 * nothing more — every row those pages read is gated by RLS in Postgres against
 * the caller's session, which a forged header does not create. The nginx vhost
 * clears it on the way in regardless.
 */
const REWRITE_MARKER = "x-crm-rewrite";

function isCrmHost(host: string) {
  const bare = host.split(":")[0].toLowerCase();
  return bare === APP_HOST || bare === "app.localhost";
}

/** Segment-aware prefix test — "/q" must not swallow "/quotes". */
function matchesPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPortal(pathname: string) {
  return matchesPath(pathname, PORTAL_PREFIX);
}

function isExempt(pathname: string) {
  return isPortal(pathname) || PUBLIC_CRM_PATHS.some((p) => matchesPath(pathname, p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // Shared API surface (incl. /api/health) is host-agnostic and never rewritten.
  if (pathname.startsWith("/api")) return NextResponse.next();

  // Our own rewrite coming back around. Every decision below was already made on
  // the first pass; re-deciding here would only get it wrong, because the host
  // this request carries is Next's, not the operator's.
  if (request.headers.get(REWRITE_MARKER)) return NextResponse.next();

  // ── Public host ────────────────────────────────────────────────────────
  if (!isCrmHost(host)) {
    // The CRM tree must not be reachable from the public hostname.
    if (pathname === "/crm" || pathname.startsWith("/crm/")) {
      return new NextResponse("Not found", { status: 404 });
    }
    return NextResponse.next();
  }

  // ── CRM host ───────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Middleware runs in the edge runtime, where NEXT_PUBLIC_* are inlined at
  // BUILD time — a .env file present only at runtime will not reach here.
  // Fail loudly and specifically rather than surfacing an opaque Supabase throw.
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse(
      "CRM unavailable: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY were not present " +
        "at build time. Pass them as Docker build args, not runtime env.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  // Refresh the session and collect any rotated auth cookies.
  let sessionResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          sessionResponse = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            sessionResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // An internal rewrite re-enters middleware with the /crm prefix already
  // applied. Normalise to the logical path so every decision below is made
  // against the URL the operator actually asked for.
  const alreadyRewritten = pathname === "/crm" || pathname.startsWith("/crm/");
  const logical = alreadyRewritten ? pathname.slice(4) || "/" : pathname;

  // Carries refreshed auth cookies onto whatever response we ultimately send.
  const withSession = (res: NextResponse) => {
    sessionResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // Redirect and rewrite targets are cloned from nextUrl so the origin is
  // whatever Next considers its own. See REWRITE_MARKER for why the origin
  // cannot be made to match the operator's hostname.
  const at = (pathTo: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathTo;
    url.search = "";
    return url;
  };

  if (!user && !isExempt(logical)) {
    const url = at("/login");
    url.searchParams.set("next", logical);
    return withSession(NextResponse.redirect(url));
  }

  // Signed in and sitting on /login — send them to the dashboard.
  if (user && logical === "/login") {
    return withSession(NextResponse.redirect(at("/")));
  }

  // The portal renders from the public tree — no rewrite.
  if (isPortal(logical)) return withSession(sessionResponse);

  // Already pointing at the CRM tree — let it render rather than rewriting
  // to itself, which would loop.
  if (alreadyRewritten) return withSession(sessionResponse);

  const url = at(`/crm${logical === "/" ? "" : logical}`);
  url.search = request.nextUrl.search;

  const forwarded = new Headers(request.headers);
  forwarded.set(REWRITE_MARKER, "1");
  return withSession(NextResponse.rewrite(url, { request: { headers: forwarded } }));
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Note _next/image is
     * excluded too — rewriting it would break the optimiser.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
