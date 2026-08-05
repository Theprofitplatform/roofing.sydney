"use server";

import { revalidateCrm } from "@/lib/revalidate";
import { isRuleViolation } from "@/lib/db/client";
import {
  archivePriceBookItem,
  archiveTemplate,
  createPriceBookItem,
  createSnippet,
  createTemplate,
  deleteSnippet,
  updatePriceBookItem,
  updateSettings,
  updateSnippet,
  updateTemplate,
  upliftPriceBook,
  type PriceBookInput,
  type SettingsPatch,
  type TemplateInput,
} from "@/lib/db/library";
import { signedPdfUrl } from "@/lib/db/portal";
import type { ClauseKind, Snippet } from "@/lib/db/types";
import { storeLogo } from "./logo-storage";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * The `/crm` prefix is on the revalidation path but not on links: middleware
 * rewrites app.roofing.sydney/settings onto /crm/settings, and the cache is
 * keyed by the route that actually rendered.
 */
const PATH = "/settings";

/**
 * What the operator is allowed to read. A trigger rejection is a sentence
 * written for them, so it passes through with only the internal call-site
 * prefix removed. Anything else is a fault, and a raw Postgres string in the UI
 * teaches nobody anything.
 */
function message(error: unknown): string {
  if (isRuleViolation(error)) {
    return (error as Error).message.replace(/^\w+[/\w]*:\s*/, "");
  }
  console.error(error);
  return "Something went wrong. Try again, or reload the page.";
}

// ── Business identity and quote defaults ───────────────────────────────────

export async function saveSettingsAction(patch: SettingsPatch): Promise<ActionResult> {
  try {
    await updateSettings(patch);
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Logo upload. Takes FormData because a File cannot cross the server-action
 * boundary any other way.
 */
export async function uploadLogoAction(
  form: FormData,
): Promise<ActionResult<{ path: string; url: string | null }>> {
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file to upload." };
  }
  try {
    const stored = await storeLogo(file);
    if (!stored.ok) return stored;

    await updateSettings({ logo_path: stored.path });
    const url = await signedPdfUrl(stored.path);
    revalidateCrm(PATH);
    return { ok: true, path: stored.path, url };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Clears the reference only. The object stays in the bucket — a PDF issued last
 * month may still be pointing at it, and orphan cleanup is a storage-lifecycle
 * job, not something to do behind a click labelled "Remove".
 */
export async function removeLogoAction(): Promise<ActionResult> {
  try {
    await updateSettings({ logo_path: null });
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── Price book ─────────────────────────────────────────────────────────────

export async function createPriceBookAction(input: PriceBookInput): Promise<ActionResult> {
  if (!input.description.trim()) return { ok: false, error: "Give the item a description." };
  if (!input.category.trim()) return { ok: false, error: "Give the item a category." };
  try {
    await createPriceBookItem({
      ...input,
      description: input.description.trim(),
      category: input.category.trim(),
      supplier: input.supplier?.trim() || null,
      supplier_sku: input.supplier_sku?.trim() || null,
    });
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updatePriceBookAction(
  id: string,
  patch: Partial<PriceBookInput>,
): Promise<ActionResult> {
  try {
    await updatePriceBookItem(id, patch);
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function archivePriceBookAction(id: string): Promise<ActionResult> {
  try {
    await archivePriceBookItem(id);
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Returns the row count the database actually changed rather than the one the
 * screen predicted. Archived rows are excluded by the function itself — they are
 * history, and repricing them would rewrite what a past quote was costed
 * against — so the two numbers can legitimately differ.
 */
export async function upliftPriceBookAction(
  category: string | null,
  pct: number,
): Promise<ActionResult<{ changed: number }>> {
  if (!Number.isFinite(pct) || pct === 0) {
    return { ok: false, error: "Enter a percentage to apply." };
  }
  try {
    const changed = await upliftPriceBook(category, pct);
    revalidateCrm(PATH);
    return { ok: true, changed };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── Clause library ─────────────────────────────────────────────────────────

export async function createSnippetAction(
  kind: ClauseKind,
  text: string,
  isDefault = false,
): Promise<ActionResult> {
  if (!text.trim()) return { ok: false, error: "Write the clause first." };
  try {
    await createSnippet(kind, text.trim(), isDefault);
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateSnippetAction(
  id: string,
  patch: Partial<Pick<Snippet, "text" | "is_default" | "sort">>,
): Promise<ActionResult> {
  if (patch.text !== undefined && !patch.text.trim()) {
    return { ok: false, error: "A clause cannot be empty." };
  }
  try {
    await updateSnippet(id, patch.text === undefined ? patch : { ...patch, text: patch.text.trim() });
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteSnippetAction(id: string): Promise<ActionResult> {
  try {
    await deleteSnippet(id);
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

// ── Job templates ──────────────────────────────────────────────────────────

export async function createTemplateAction(
  input: Partial<TemplateInput>,
): Promise<ActionResult> {
  if (!input.label?.trim()) return { ok: false, error: "Give the template a name." };
  try {
    await createTemplate({ ...input, label: input.label.trim() });
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateTemplateAction(
  id: string,
  patch: Partial<TemplateInput>,
): Promise<ActionResult> {
  if (patch.label !== undefined && !patch.label.trim()) {
    return { ok: false, error: "Give the template a name." };
  }
  try {
    await updateTemplate(id, patch);
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function archiveTemplateAction(id: string): Promise<ActionResult> {
  try {
    await archiveTemplate(id);
    revalidateCrm(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
