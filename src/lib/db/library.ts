import "server-only";
import { db, unwrap, unwrapList, DbError } from "./client";
import type {
  ClauseKind,
  ItemKind,
  JobTemplate,
  PriceBookItem,
  Settings,
  Snippet,
} from "./types";

/**
 * The reusable libraries behind the builder: price book, clause snippets, job
 * templates, and the single settings row.
 */

// ── Price book ─────────────────────────────────────────────────────────────

export async function listPriceBook(includeArchived = false): Promise<PriceBookItem[]> {
  const supabase = await db();
  let query = supabase.from("price_book").select("*");
  if (!includeArchived) query = query.is("archived_at", null);
  return unwrapList<PriceBookItem>(
    "listPriceBook",
    await query.order("category", { ascending: true }).order("description", { ascending: true }),
  );
}

export interface PriceBookInput {
  kind: ItemKind;
  category: string;
  description: string;
  unit: string;
  unit_cost_cents: number;
  supplier?: string | null;
  supplier_sku?: string | null;
}

export async function createPriceBookItem(input: PriceBookInput): Promise<PriceBookItem> {
  const supabase = await db();
  return unwrap<PriceBookItem>(
    "createPriceBookItem",
    await supabase.from("price_book").insert(input).select("*").single(),
  );
}

export async function updatePriceBookItem(
  id: string,
  patch: Partial<PriceBookInput>,
): Promise<PriceBookItem> {
  const supabase = await db();
  return unwrap<PriceBookItem>(
    "updatePriceBookItem",
    await supabase.from("price_book").update(patch).eq("id", id).select("*").single(),
  );
}

/**
 * Archive rather than delete. A quote sent last year priced from this row, and
 * removing it would strand the audit trail behind that figure.
 */
export async function archivePriceBookItem(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("price_book")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new DbError("archivePriceBookItem", error);
}

/** Bulk percentage uplift. Null category means every category. Returns rows changed. */
export async function upliftPriceBook(category: string | null, pct: number): Promise<number> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("uplift_price_book", {
    p_category: category,
    p_pct: pct,
  });
  if (error) throw new DbError("upliftPriceBook", error);
  return typeof data === "number" ? data : 0;
}

/**
 * Days since a cost was last confirmed. `margin_floor_pct` guards the margin, not
 * whether the underlying cost is real — a 20% margin on a cost that rose 12% is
 * not a 20% margin. This is what the picker flags on.
 */
export function costAgeDays(item: Pick<PriceBookItem, "cost_updated_at">, now = new Date()): number {
  const then = new Date(item.cost_updated_at).getTime();
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** Costs older than this are flagged at point of use. One quarter. */
export const STALE_COST_DAYS = 90;

export function isCostStale(
  item: Pick<PriceBookItem, "cost_updated_at">,
  now = new Date(),
): boolean {
  return costAgeDays(item, now) >= STALE_COST_DAYS;
}

// ── Clause snippets ────────────────────────────────────────────────────────

export async function listSnippets(): Promise<Snippet[]> {
  const supabase = await db();
  return unwrapList<Snippet>(
    "listSnippets",
    await supabase
      .from("snippets")
      .select("*")
      .order("kind", { ascending: true })
      .order("sort", { ascending: true }),
  );
}

export async function createSnippet(
  kind: ClauseKind,
  text: string,
  isDefault = false,
): Promise<Snippet> {
  const supabase = await db();
  return unwrap<Snippet>(
    "createSnippet",
    await supabase
      .from("snippets")
      .insert({ kind, text, is_default: isDefault })
      .select("*")
      .single(),
  );
}

export async function updateSnippet(
  id: string,
  patch: Partial<Pick<Snippet, "text" | "is_default" | "sort">>,
): Promise<Snippet> {
  const supabase = await db();
  return unwrap<Snippet>(
    "updateSnippet",
    await supabase.from("snippets").update(patch).eq("id", id).select("*").single(),
  );
}

export async function deleteSnippet(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("snippets").delete().eq("id", id);
  if (error) throw new DbError("deleteSnippet", error);
}

// ── Job templates ──────────────────────────────────────────────────────────

export async function listTemplates(): Promise<JobTemplate[]> {
  const supabase = await db();
  return unwrapList<JobTemplate>(
    "listTemplates",
    await supabase
      .from("job_templates")
      .select("*")
      .is("archived_at", null)
      .order("sort", { ascending: true }),
  );
}

export type TemplateInput = Omit<JobTemplate, "id" | "created_at" | "archived_at">;

export async function createTemplate(input: Partial<TemplateInput>): Promise<JobTemplate> {
  const supabase = await db();
  return unwrap<JobTemplate>(
    "createTemplate",
    await supabase.from("job_templates").insert(input).select("*").single(),
  );
}

export async function updateTemplate(
  id: string,
  patch: Partial<TemplateInput>,
): Promise<JobTemplate> {
  const supabase = await db();
  return unwrap<JobTemplate>(
    "updateTemplate",
    await supabase.from("job_templates").update(patch).eq("id", id).select("*").single(),
  );
}

export async function archiveTemplate(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("job_templates")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new DbError("archiveTemplate", error);
}

/** "Save this quote as a template" — builds line_items from the quote's rows. */
export async function saveQuoteAsTemplate(
  quoteId: string,
  label: string,
  sub?: string | null,
  icon?: string | null,
): Promise<JobTemplate> {
  const supabase = await db();
  return unwrap<JobTemplate>(
    "saveQuoteAsTemplate",
    await supabase
      .rpc("save_quote_as_template", {
        p_quote_id: quoteId,
        p_label: label,
        p_sub: sub ?? null,
        p_icon: icon ?? null,
      })
      .single(),
  );
}

// ── Settings (single row, id = 1) ──────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const supabase = await db();
  return unwrap<Settings>(
    "getSettings",
    await supabase.from("settings").select("*").eq("id", 1).single(),
  );
}

export type SettingsPatch = Partial<Omit<Settings, "id" | "updated_at">>;

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const supabase = await db();
  return unwrap<Settings>(
    "updateSettings",
    await supabase.from("settings").update(patch).eq("id", 1).select("*").single(),
  );
}
