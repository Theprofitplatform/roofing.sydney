"use server";

import { revalidateCrm } from "@/lib/revalidate";

import { getCurrentUser } from "@/lib/supabase-server";
import {
  createQuote,
  deleteQuote,
  getQuote,
  replaceClauses,
  replaceItems,
  updateQuote,
} from "@/lib/db/quotes";
import { createClient } from "@/lib/db/clients";
import type { Client } from "@/lib/db/types";
import { addPhoto, listPhotoViews, removePhoto, setPhotoCaption, type PhotoView } from "./photo-storage";
import { message, type ActionResult } from "./errors";
import type { SaveDraftInput } from "./builder/state";

/**
 * Everything the quotes list and the builder can do to a DRAFT.
 *
 * Nothing here can touch an issued quote: `updateQuote`, `replaceItems` and
 * `replaceClauses` all trip the immutability triggers, and the rejection is
 * surfaced with the trigger's own wording rather than being hidden. The builder
 * refuses to open an issued quote at all, so in practice this is the second line
 * of defence — which is exactly where it belongs.
 */

const refresh = (id?: string) => {
  revalidateCrm("/quotes");
  if (id) {
    revalidateCrm(`/quotes/${id}`);
    revalidateCrm(`/quotes/${id}/edit`);
  }
};

// ── Drafts ─────────────────────────────────────────────────────────────────

/**
 * Create-or-update in one call, because the builder does not know which it is
 * doing: a new quote becomes a row on its first autosave, and every save after
 * that is an update of the id this returned.
 */
export async function saveDraft(input: SaveDraftInput): Promise<ActionResult<{ id: string }>> {
  if (!input.quote.client_id) {
    return { ok: false, error: "Choose a client before saving." };
  }

  try {
    let id = input.id;

    if (id) {
      await updateQuote(id, input.quote);
    } else {
      const user = await getCurrentUser();
      const created = await createQuote({ ...input.quote, created_by: user?.id ?? null });
      id = created.id;
    }

    await replaceItems(id, input.items);
    await replaceClauses(id, input.clauses);

    refresh(id);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't save the draft. Try again.") };
  }
}

/**
 * Copy a quote's commercial content into a fresh draft.
 *
 * Site photos are deliberately not copied: they are evidence from one visit to
 * one roof, and sharing the storage objects between two quotes would mean
 * deleting a photo from the copy also removed it from the original.
 */
export async function duplicateQuote(quoteId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const source = await getQuote(quoteId);
    if (!source) return { ok: false, error: "That quote no longer exists." };

    const user = await getCurrentUser();
    const copy = await createQuote({
      client_id: source.quote.client_id,
      opportunity_id: source.quote.opportunity_id,
      roof_type: source.quote.roof_type,
      notes: source.quote.notes,
      valid_days: source.quote.valid_days,
      margin_pct: source.quote.margin_pct,
      show_breakdown: source.quote.show_breakdown,
      pdf_layout: source.quote.pdf_layout,
      gst_enabled: source.quote.gst_enabled,
      gst_rate: source.quote.gst_rate,
      include_photos: false,
      created_by: user?.id ?? null,
    });

    await replaceItems(
      copy.id,
      source.items.map((item) => ({
        kind: item.kind,
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        unit_cost_cents: item.unit_cost_cents,
        is_optional: item.is_optional,
        tier: item.tier,
      })),
    );
    await replaceClauses(
      copy.id,
      source.clauses.map((clause) => ({ kind: clause.kind, text: clause.text })),
    );

    refresh(copy.id);
    return { ok: true, id: copy.id };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't duplicate that quote.") };
  }
}

export async function removeQuote(quoteId: string): Promise<ActionResult> {
  try {
    await deleteQuote(quoteId);
    refresh(quoteId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't delete that quote.") };
  }
}

// ── Client, created without leaving the builder ────────────────────────────

export interface InlineClientInput {
  name: string;
  phone?: string;
  email?: string;
  property_address?: string;
}

export async function createClientForQuote(
  input: InlineClientInput,
): Promise<ActionResult<{ client: Client }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A client needs a name." };

  try {
    const user = await getCurrentUser();
    const client = await createClient(
      {
        name,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        property_address: input.property_address?.trim() || null,
        source: "crm",
      },
      user?.id ?? null,
    );
    revalidateCrm("/clients");
    return { ok: true, client };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't save that client.") };
  }
}

// ── Site photos ────────────────────────────────────────────────────────────

/** The browser already resizes to ~1600px JPEG; this is a guard, not a budget. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadPhoto(
  quoteId: string,
  form: FormData,
): Promise<ActionResult<{ photo: PhotoView }>> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No image was received." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That image is too large." };
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
    return { ok: false, error: "Photos must be JPEG, PNG or WebP." };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const photo = await addPhoto(quoteId, bytes, file.type);
    const [view] = await listPhotoViews([photo]);
    refresh(quoteId);
    return { ok: true, photo: view };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't upload that photo.") };
  }
}

export async function updatePhotoCaption(
  quoteId: string,
  photoId: string,
  caption: string,
): Promise<ActionResult> {
  try {
    await setPhotoCaption(photoId, caption);
    refresh(quoteId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't save that caption.") };
  }
}

export async function deletePhoto(quoteId: string, photoId: string): Promise<ActionResult> {
  try {
    await removePhoto(photoId);
    refresh(quoteId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error, "Couldn't remove that photo.") };
  }
}
