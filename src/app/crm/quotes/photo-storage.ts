import "server-only";

import { db, admin, unwrap, unwrapList, DbError } from "@/lib/db/client";
import { QUOTE_BUCKET } from "@/lib/db/portal";
import type { QuotePhoto } from "@/lib/db/types";
import type { PhotoView } from "./helpers";

export type { PhotoView };

/**
 * Site photos: the bytes in Storage, the record in `quote_photos`.
 *
 * Split the way the rest of the data layer splits it — object writes run as the
 * service role because the bucket is private and has no per-operator policy,
 * while every row write goes through the operator's RLS-bound client so a
 * policy mistake surfaces as a denied query rather than a silent write.
 *
 * The prototype base64'd photos straight into its quote object. That is
 * tolerable in localStorage and indefensible in Postgres: a dozen site photos
 * would put several megabytes into every row read, including the quotes list.
 */

/** A signed link lives long enough to render the page and no longer. */
const SIGNED_URL_TTL_SECONDS = 3600;

export async function listPhotoViews(photos: readonly QuotePhoto[]): Promise<PhotoView[]> {
  if (photos.length === 0) return [];

  const supabase = admin();
  const { data, error } = await supabase.storage
    .from(QUOTE_BUCKET)
    .createSignedUrls(
      photos.map((p) => p.storage_path),
      SIGNED_URL_TTL_SECONDS,
    );

  if (error) {
    console.error("listPhotoViews: signing failed", error);
    return photos.map((p) => ({ ...p, url: null }));
  }

  const byPath = new Map((data ?? []).map((row) => [row.path, row.signedUrl]));
  return photos.map((p) => ({ ...p, url: byPath.get(p.storage_path) ?? null }));
}

/**
 * Photos as data URLs, for the PDF renderer.
 *
 * React-PDF fetches nothing, by design — the issued PDF is an artefact that has
 * to render identically forever, so every byte it needs must be handed to it.
 */
export async function photoDataUrls(
  photos: readonly QuotePhoto[],
  limit = 8,
): Promise<{ dataUrl: string; caption: string | null }[]> {
  const supabase = admin();
  const wanted = photos.slice(0, limit);

  const loaded = await Promise.all(
    wanted.map(async (photo) => {
      const { data, error } = await supabase.storage
        .from(QUOTE_BUCKET)
        .download(photo.storage_path);
      if (error || !data) return null;

      const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
      const mime = data.type || "image/jpeg";
      return { dataUrl: `data:${mime};base64,${base64}`, caption: photo.caption };
    }),
  );

  // A photo that failed to load is dropped rather than printed as a hole.
  return loaded.filter((p): p is { dataUrl: string; caption: string | null } => p !== null);
}

export async function addPhoto(
  quoteId: string,
  bytes: Buffer,
  contentType: string,
): Promise<QuotePhoto> {
  const supabase = await db();

  const existing = unwrapList<Pick<QuotePhoto, "sort">>(
    "addPhoto/sort",
    await supabase.from("quote_photos").select("sort").eq("quote_id", quoteId),
  );
  const nextSort = existing.reduce((max, row) => Math.max(max, row.sort + 1), 0);

  const extension = contentType === "image/png" ? "png" : "jpg";
  const path = `${quoteId}/photos/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await admin()
    .storage.from(QUOTE_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (uploadError) throw new Error(`addPhoto: ${uploadError.message}`);

  return unwrap<QuotePhoto>(
    "addPhoto",
    await supabase
      .from("quote_photos")
      .insert({ quote_id: quoteId, storage_path: path, sort: nextSort })
      .select("*")
      .single(),
  );
}

export async function setPhotoCaption(photoId: string, caption: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("quote_photos")
    .update({ caption: caption.trim() || null })
    .eq("id", photoId);
  if (error) throw new DbError("setPhotoCaption", error);
}

/**
 * Row first, then the object. If the object delete fails the row is already
 * gone, which leaves an orphaned file rather than a tile pointing at nothing —
 * the cheaper of the two failures to live with.
 *
 * The object is only removed once nothing else points at it. `revise_quote`
 * clones a quote's photo rows verbatim, storage path and all, so a revision and
 * the issued parent it superseded share the same bytes. Deleting a photo from
 * the v2 draft would otherwise blank it on the v1 the client already has — a
 * document the database will not let anyone edit, quietly losing its evidence.
 */
export async function removePhoto(photoId: string): Promise<void> {
  const supabase = await db();

  const { data, error } = await supabase
    .from("quote_photos")
    .delete()
    .eq("id", photoId)
    .select("storage_path")
    .single();
  if (error) throw new DbError("removePhoto", error);

  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return;

  const stillReferenced = unwrapList<{ id: string }>(
    "removePhoto/references",
    await supabase.from("quote_photos").select("id").eq("storage_path", path).limit(1),
  );
  if (stillReferenced.length > 0) return;

  const { error: storageError } = await admin().storage.from(QUOTE_BUCKET).remove([path]);
  if (storageError) console.error("removePhoto: object left behind", storageError);
}
