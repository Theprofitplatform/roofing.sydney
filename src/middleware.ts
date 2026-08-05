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

  // Build URLs from request.url so the origin always matches what Next is
  // serving. A cloned nextUrl can carry a different host, which makes Next
  // treat the rewrite as external and return 404.
  if (!user && !isExempt(logical)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", logical);
    return withSession(NextResponse.redirect(url));
  }

  // Signed in and sitting on /login — send them to the dashboard.
  if (user && logical === "/login") {
    return withSession(NextResponse.redirect(new URL("/", request.url)));
  }

  // The portal renders from the public tree — no rewrite.
  if (isPortal(logical)) return withSession(sessionResponse);

  // Already pointing at the CRM tree — let it render rather than rewriting
  // to itself, which would loop.
  if (alreadyRewritten) return withSession(sessionResponse);

  const url = new URL(`/crm${logical === "/" ? "" : logical}`, request.url);
  url.search = request.nextUrl.search;
  return withSession(NextResponse.rewrite(url));
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
