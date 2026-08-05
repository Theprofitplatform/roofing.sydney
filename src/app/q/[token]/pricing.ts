import type { ItemKind, Tier } from "@/lib/db/types";

/**
 * Client-facing pricing, computed without ever touching cost.
 *
 * `lib/quote-pricing` is the authority on what a selection is worth, but every
 * one of its functions needs `unit_cost_cents` to do the arithmetic — which is
 * exactly the number that must not reach a homeowner's browser. So the server
 * runs the real engine over every tier × extras combination and ships the
 * resulting client-facing totals; this module only looks them up.
 *
 * Nothing here re-derives margin. The commercial arithmetic still happens once,
 * in the shared library, on the server.
 */

export interface PortalLine {
  id: string;
  kind: ItemKind;
  description: string;
  qty: number;
  unit: string;
  /** Marked up. Cost never leaves the server. */
  unitCents: number;
  amountCents: number;
  isOptional: boolean;
  tier: Tier | null;
}

export interface PortalTotals {
  subtotal: number;
  gst: number;
  total: number;
}

export interface PortalPricing {
  showBreakdown: boolean;
  gstEnabled: boolean;
  gstRate: number;
  /** Percentage due on acceptance; 0 when the business does not take deposits. */
  depositPct: number;
  lines: PortalLine[];
  tiers: Tier[];
  /** Extras in presentation order — also the bit order of the table's mask. */
  extraIds: string[];
  /**
   * Exact client-facing totals for every tier × extras combination, so a
   * selection re-prices instantly and without a round trip. Null when the
   * combination space was too large to precompute — see `priceFor`.
   */
  table: Record<string, PortalTotals> | null;
}

export interface PortalSelection {
  tier: Tier | null;
  optionalIds: readonly string[];
}

/** Key a selection by tier and a bitmask over `extraIds`. */
export function tableKey(tier: Tier | null, mask: number): string {
  return `${tier ?? "-"}:${mask}`;
}

function maskOf(pricing: PortalPricing, optionalIds: readonly string[]): number {
  const chosen = new Set(optionalIds);
  return pricing.extraIds.reduce((mask, id, i) => (chosen.has(id) ? mask | (1 << i) : mask), 0);
}

/**
 * Which lines a selection buys.
 *
 * The same rule as `resolveScope` in the shared library, restated over the
 * cost-free line model — an optional line that also carries a tier belongs to
 * that tier, and ticking it under a different tier must not smuggle it in.
 */
export function resolveLines(
  pricing: PortalPricing,
  selection: PortalSelection,
): PortalLine[] {
  const chosen = new Set(selection.optionalIds);
  return pricing.lines.filter((line) => {
    if (line.tier !== null && line.tier !== selection.tier) return false;
    if (line.isOptional) return chosen.has(line.id);
    return true;
  });
}

/**
 * Price a selection.
 *
 * The lookup is exact — it is the server's own figure. The fallback only runs
 * when the table was too large to precompute, and reproduces
 * `computeDisplayTotals` exactly for an itemised quote (the displayed subtotal
 * IS the sum of the displayed lines). For a single-line quote it can land a cent
 * off, because that model rounds margin once over the whole cost subtotal. The
 * figure that gets recorded is recomputed server-side from the database's own
 * items either way, so the worst case is a display, not a record.
 */
export function priceFor(pricing: PortalPricing, selection: PortalSelection): PortalTotals {
  const hit = pricing.table?.[tableKey(selection.tier, maskOf(pricing, selection.optionalIds))];
  if (hit) return hit;

  const subtotal = resolveLines(pricing, selection).reduce((sum, l) => sum + l.amountCents, 0);
  const gst = pricing.gstEnabled ? Math.round((subtotal * pricing.gstRate) / 100) : 0;
  return { subtotal, gst, total: subtotal + gst };
}

/** Each offered tier priced against the extras the client currently has ticked. */
export function tierTotals(
  pricing: PortalPricing,
  optionalIds: readonly string[],
): { tier: Tier; total: number }[] {
  return pricing.tiers.map((tier) => ({
    tier,
    total: priceFor(pricing, { tier, optionalIds }).total,
  }));
}

/**
 * What ticking one extra adds to the total the client will actually pay —
 * the difference between two full prices, not the line's own amount, because
 * GST is levied on the subtotal rather than line by line.
 */
export function extraDelta(
  pricing: PortalPricing,
  selection: PortalSelection,
  extraId: string,
): number {
  const without = selection.optionalIds.filter((id) => id !== extraId);
  const with_ = without.concat(extraId);
  return (
    priceFor(pricing, { ...selection, optionalIds: with_ }).total -
    priceFor(pricing, { ...selection, optionalIds: without }).total
  );
}
