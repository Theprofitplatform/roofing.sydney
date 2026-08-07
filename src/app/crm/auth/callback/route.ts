import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { publicOrigin } from "@/lib/public-origin";

/**
 * Magic-link landing. Supabase redirects here with a PKCE `code`, which we
 * exchange for a session cookie before sending the operator on their way.
 *
 * Redirects are built from `publicOrigin(request)`, never `nextUrl.origin` —
 * see that helper for why the container's own origin is the wrong answer.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = publicOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Only ever redirect to a path on this origin — never an attacker-supplied host.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
