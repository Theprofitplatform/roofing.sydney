import "server-only";
import { admin, unwrapMaybe } from "@/lib/db/client";
import type { Settings } from "@/lib/db/types";

/**
 * The business identity, read the way everything else on the portal is read.
 *
 * `library.getSettings()` runs through `db()` and is therefore subject to RLS as
 * the signed-in operator. The homeowner has no session, so that call would be
 * denied here. Same table, same row, service role — for the same reason the
 * quote itself comes through `admin()`.
 *
 * A missing settings row must not take a client's quote offline, so this returns
 * null and the page falls back to a neutral identity rather than throwing.
 */
export async function getPortalSettings(): Promise<Settings | null> {
  try {
    // Inside the try on purpose: `admin()` throws synchronously when the service
    // key is absent, and a misconfigured environment must degrade the letterhead
    // rather than take a signed quote offline.
    const supabase = admin();
    return unwrapMaybe<Settings>(
      "getPortalSettings",
      await supabase.from("settings").select("*").eq("id", 1).single(),
    );
  } catch (error) {
    console.error("getPortalSettings failed", error);
    return null;
  }
}
