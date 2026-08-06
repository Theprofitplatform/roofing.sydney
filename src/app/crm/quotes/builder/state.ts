/**
 * The builder's working copy of a quote.
 *
 * Numeric fields the operator types into (`qty`, `margin_pct`) are held as
 * TEXT, not numbers. A half-typed "12." or "0." has to survive a keystroke, and
 * coercing on every change would fight the cursor. Everything is parsed once, at
 * the boundary — `toScopeItems` for pricing, `toSavePayload` for the database —
 * so no float ever reaches storage and money stays integer cents throughout.
 */

import type { ScopeItem } from "@/lib/quote-pricing";
import type {
  ItemKind,
  JobTemplate,
  PdfLayout,
  QuoteClause,
  QuoteItem,
  Settings,
  Snippet,
  Tier,
} from "@/lib/db/types";
import type { QuoteDetail } from "@/lib/db/quotes";

export const UNITS = ["ea", "m", "m2", "hr", "day", "L", "item"] as const;

export const TIER_OPTIONS: { value: "" | Tier; label: string }[] = [
  { value: "", label: "—" },
  { value: "good", label: "Good" },
  { value: "better", label: "Better" },
  { value: "best", label: "Best" },
];

/**
 * A price book row as the picker sees it.
 *
 * Staleness is resolved on the server and carried here as data, because
 * `isCostStale` lives in the server-only db layer — and because "is this cost
 * still real" is a question about the moment the page was built, not about the
 * browser's clock.
 */
export interface PriceBookRow {
  id: string;
  kind: ItemKind;
  category: string;
  description: string;
  unit: string;
  unit_cost_cents: number;
  supplier: string | null;
  costAgeDays: number;
  isStale: boolean;
}

export interface DraftItem {
  /** Client-side identity. Rows are reordered and removed before they have one. */
  key: string;
  kind: ItemKind;
  description: string;
  qty: string;
  unit: string;
  unit_cost_cents: number;
  is_optional: boolean;
  tier: Tier | null;
}

export interface DraftQuote {
  client_id: string;
  roof_type: string;
  notes: string;
  valid_days: number;
  show_breakdown: boolean;
  pdf_layout: PdfLayout;
  margin_pct: string;
  gst_enabled: boolean;
  gst_rate: number;
  include_photos: boolean;
  items: DraftItem[];
  /** Resolved clause text, copied onto the quote — never snippet references. */
  inclusions: string[];
  exclusions: string[];
}

let seq = 0;
export const nextKey = (): string => `li_${(seq += 1)}`;

export function blankRow(kind: ItemKind): DraftItem {
  return {
    key: nextKey(),
    kind,
    description: "",
    qty: "1",
    unit: kind === "labour" ? "hr" : "ea",
    unit_cost_cents: 0,
    is_optional: false,
    tier: null,
  };
}

/** Lines with nothing written in them are scaffolding, not scope. */
export function describedItems(items: readonly DraftItem[]): DraftItem[] {
  return items.filter((i) => i.description.trim().length > 0);
}

const num = (value: string | number): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Priced through `@/lib/quote-pricing` — the tier and extras rules live there. */
export function toScopeItems(items: readonly DraftItem[]): ScopeItem[] {
  return describedItems(items).map((item) => ({
    id: item.key,
    kind: item.kind,
    description: item.description,
    qty: num(item.qty),
    unit: item.unit,
    unit_cost_cents: item.unit_cost_cents,
    is_optional: item.is_optional,
    tier: item.tier,
  }));
}

/** `CalcQuote`-shaped view of the draft, for `computeTotals` and friends. */
export function toCalcQuote(draft: DraftQuote) {
  return {
    margin_pct: num(draft.margin_pct),
    gst_enabled: draft.gst_enabled,
    gst_rate: draft.gst_rate,
    show_breakdown: draft.show_breakdown,
  };
}

export interface SaveDraftInput {
  id: string | null;
  quote: {
    client_id: string;
    roof_type: string | null;
    notes: string | null;
    valid_days: number;
    show_breakdown: boolean;
    pdf_layout: PdfLayout;
    margin_pct: number;
    gst_enabled: boolean;
    gst_rate: number;
    include_photos: boolean;
  };
  items: {
    kind: ItemKind;
    description: string;
    qty: number;
    unit: string;
    unit_cost_cents: number;
    is_optional: boolean;
    tier: Tier | null;
  }[];
  clauses: { kind: "inclusion" | "exclusion"; text: string }[];
}

export function toSavePayload(id: string | null, draft: DraftQuote): SaveDraftInput {
  return {
    id,
    quote: {
      client_id: draft.client_id,
      roof_type: draft.roof_type.trim() || null,
      notes: draft.notes.trim() || null,
      valid_days: draft.valid_days || 30,
      show_breakdown: draft.show_breakdown,
      pdf_layout: draft.pdf_layout,
      margin_pct: num(draft.margin_pct),
      gst_enabled: draft.gst_enabled,
      gst_rate: draft.gst_rate,
      include_photos: draft.include_photos,
    },
    items: describedItems(draft.items).map((item) => ({
      kind: item.kind,
      description: item.description.trim(),
      qty: num(item.qty),
      unit: item.unit,
      unit_cost_cents: item.unit_cost_cents,
      is_optional: item.is_optional,
      tier: item.tier,
    })),
    clauses: [
      ...draft.inclusions.map((text) => ({ kind: "inclusion" as const, text })),
      ...draft.exclusions.map((text) => ({ kind: "exclusion" as const, text })),
    ],
  };
}

// ── Seeding a draft ─────────────────────────────────────────────────────────

/**
 * A brand-new quote. Defaults come from Settings rather than from constants so
 * changing the house margin is a settings edit, not a deploy.
 */
export function newDraft(settings: Settings, snippets: readonly Snippet[]): DraftQuote {
  const defaults = (kind: "inclusion" | "exclusion") =>
    snippets.filter((s) => s.kind === kind && s.is_default).map((s) => s.text);

  return {
    client_id: "",
    roof_type: "",
    notes: "",
    valid_days: settings.default_valid_days || 30,
    show_breakdown: true,
    pdf_layout: "classic",
    margin_pct: String(settings.default_margin_pct ?? 20),
    // The per-quote toggle is meaningless until the business is registered.
    gst_enabled: settings.gst_registered,
    gst_rate: settings.gst_rate ?? 10,
    include_photos: false,
    items: [],
    inclusions: defaults("inclusion"),
    exclusions: defaults("exclusion"),
  };
}

/** A template's structure and quantities, ready to be edited against the site. */
export function draftFromTemplate(
  template: JobTemplate,
  settings: Settings,
  snippets: readonly Snippet[],
): DraftQuote {
  const base = newDraft(settings, snippets);
  return {
    ...base,
    roof_type: template.roof_type ?? "",
    notes: template.notes ?? "",
    valid_days: template.valid_days ?? base.valid_days,
    margin_pct: template.margin_pct != null ? String(template.margin_pct) : base.margin_pct,
    show_breakdown: template.show_breakdown,
    items: (template.line_items ?? []).map((line) => ({
      key: nextKey(),
      kind: line.kind,
      description: line.description,
      qty: String(line.qty),
      unit: line.unit,
      unit_cost_cents: line.unit_cost_cents,
      is_optional: false,
      tier: null,
    })),
  };
}

/** An existing draft, reopened. */
export function draftFromQuote(detail: QuoteDetail): DraftQuote {
  const clauseText = (kind: "inclusion" | "exclusion") =>
    detail.clauses.filter((c: QuoteClause) => c.kind === kind).map((c) => c.text);

  return {
    client_id: detail.quote.client_id,
    roof_type: detail.quote.roof_type ?? "",
    notes: detail.quote.notes ?? "",
    valid_days: detail.quote.valid_days,
    show_breakdown: detail.quote.show_breakdown,
    pdf_layout: detail.quote.pdf_layout,
    margin_pct: String(detail.quote.margin_pct),
    gst_enabled: detail.quote.gst_enabled,
    gst_rate: detail.quote.gst_rate,
    include_photos: detail.quote.include_photos,
    items: detail.items.map((item: QuoteItem) => ({
      key: nextKey(),
      kind: item.kind,
      description: item.description,
      qty: String(item.qty),
      unit: item.unit,
      unit_cost_cents: item.unit_cost_cents,
      is_optional: item.is_optional,
      tier: item.tier,
    })),
    inclusions: clauseText("inclusion"),
    exclusions: clauseText("exclusion"),
  };
}
