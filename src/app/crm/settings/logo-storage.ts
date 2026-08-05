import "server-only";
import { db } from "@/lib/db/client";
import { QUOTE_BUCKET } from "@/lib/db/portal";

/**
 * The business logo, in Supabase Storage.
 *
 * The prototype held it as a base64 data URL in local state, which meant every
 * read of the settings row dragged a quarter-megabyte of image with it. It lives
 * in the private `quotes` bucket under a `settings/` prefix rather than a bucket
 * of its own, because that is the only bucket the deployment provisions today;
 * `settings.logo_path` stores the object path and the screen resolves a
 * short-lived signed URL when it needs to show it.
 */

/** Extension by content type — the stored object keeps a name a human can read. */
const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/** A logo is a header mark, not a photograph. Anything larger is a mistake. */
const MAX_BYTES = 512 * 1024;

export type StoreLogoResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Returns a result rather than throwing: every failure here is a sentence the
 * operator should read ("too big", "wrong format"), and a caller that has to
 * sniff exception types to work out which of those it caught will get it wrong.
 */
export async function storeLogo(file: File): Promise<StoreLogoResult> {
  const extension = EXTENSION[file.type];
  if (!extension) {
    return { ok: false, error: "The logo must be a PNG, JPEG, SVG or WebP image." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: "The logo must be under 512 KB. Export it at around 256px square.",
    };
  }

  const supabase = await db();

  // Timestamped rather than a fixed filename: signed URLs already handed out for
  // the previous logo would otherwise keep serving the old bytes until they
  // expired, and the operator would swear the upload had not worked.
  const path = `settings/logo-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(QUOTE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    // Storage failures here are infrastructure, not something the operator did:
    // a missing bucket, or an object policy that has not been granted. The raw
    // string ("new row violates row-level security policy for table objects")
    // reads as a bug report, so it goes to the log and they get a sentence.
    console.error("storeLogo", error);
    return { ok: false, error: "The logo could not be stored. Try again in a moment." };
  }
  return { ok: true, path };
}
