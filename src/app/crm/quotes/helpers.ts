/**
 * Small shared helpers for the quotes screens. Everything here is pure and safe
 * on both sides of the server/client boundary — the pricing and lifecycle rules
 * themselves live in `@/lib/money`, `@/lib/quote-pricing` and `@/lib/quote-state`
 * and are never re-implemented here.
 */

import { computeTotals } from "@/lib/money";
import { TIER_ORDER, type ScopeItem } from "@/lib/quote-pricing";
import type { Quote, QuoteItem, Tier } from "@/lib/db/types";

/** The narrowest shape any of these helpers needs from a line item. */
export interface ScopedLine {
  is_optional: boolean;
  tier: Tier | null;
}

/**
 * A site photo as the screens see it: the record, plus a short-lived signed URL.
 * Declared here rather than beside the storage code so a client component can
 * name the type without reaching into a server-only module.
 */
export interface PhotoView {
  id: string;
  storage_path: string;
  caption: string | null;
  sort: number;
  /** Null when the object is missing — a broken tile must not take the page down. */
  url: string | null;
}

/**
 * The lines a quote is offering by default: base scope plus the cheapest tier
 * on offer, and no optional extras.
 *
 * `resolveScope` in `@/lib/quote-pricing` does this properly, but it needs a
 * stable `id` on every line so a client's selection can name one. The quotes
 * list fetches items without ids — it only ever prices the default offer — so
 * this narrower version answers the same question from less data.
 */
export function defaultScope<T extends ScopedLine>(items: readonly T[]): T[] {
  const tier = TIER_ORDER.find((t) => items.some((i) => i.tier === t)) ?? null;
  return items.filter((i) => !i.is_optional && (i.tier === null || i.tier === tier));
}

/** Stored rows in the shape `@/lib/quote-pricing` prices. Ids are carried through. */
export function scopeFromQuoteItems(items: readonly QuoteItem[]): ScopeItem[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    description: item.description,
    qty: item.qty,
    unit: item.unit,
    unit_cost_cents: item.unit_cost_cents,
    is_optional: item.is_optional,
    tier: item.tier,
  }));
}

interface ValuableQuote {
  margin_pct: number;
  gst_enabled: boolean;
  gst_rate: number;
  show_breakdown: boolean;
  total_cents: number | null;
  accepted_total_cents: number | null;
}

interface ValuableItem extends ScopedLine {
  kind: "material" | "labour";
  qty: number;
  unit_cost_cents: number;
}

/**
 * What a quote is worth, in the same precedence `@/lib/reports` uses: what the
 * client accepted, then the figure frozen at issue, and only then a live
 * recompute. Recomputing an issued quote would silently reprice history.
 */
export function quoteTotalCents(quote: ValuableQuote, items: readonly ValuableItem[]): number {
  if (quote.accepted_total_cents != null) return quote.accepted_total_cents;
  if (quote.total_cents != null) return quote.total_cents;
  return computeTotals(quote, defaultScope(items)).total;
}

/** "6 Aug" — the list and timeline density. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** "6 August 2026" — never the ambiguous 6/8/2026. */
export function formatFull(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** A draft has no number yet, and the operator has to be able to tell. */
export function quoteLabel(quote: Pick<Quote, "quote_number">): string {
  return quote.quote_number ?? "DRAFT";
}

/** Safe for a Content-Disposition filename and for a human reading a folder. */
export function pdfFilename(quote: Pick<Quote, "quote_number">): string {
  return `${quoteLabel(quote).replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`;
}
