/**
 * Scope resolution: which line items are actually in a quote once the client's
 * tier and optional extras are taken into account.
 *
 * A quote can carry three kinds of line:
 *   - base scope        tier === null, is_optional === false — always included
 *   - a tier variant    tier === 'good'|'better'|'best'      — one tier included
 *   - an optional extra is_optional === true                  — client opts in
 *
 * For a re-roofing business this is the highest-revenue feature in the plan: it
 * moves the conversation from "is this too expensive" to "which one". It is also
 * the easiest thing to get subtly wrong, which is why the arithmetic lives here
 * as pure functions rather than inside a component.
 */

import { computeTotals, computeDisplayTotals, type CalcQuote, type Totals } from "./money";
import type { Tier } from "./db/types";

/**
 * The minimum needed to decide whether a line is in scope.
 *
 * Kept separate from `ScopeItem` because two very different callers need scope
 * resolution: the portal and the PDF, which also render the line, and reporting,
 * which only has to cost it. Requiring `description`/`unit` of the second would
 * force it to fetch text it never displays on every quote in the book.
 */
export interface ScopeShape {
  id: string;
  is_optional: boolean;
  tier: Tier | null;
}

export interface ScopeItem extends ScopeShape {
  kind: "material" | "labour";
  description: string;
  qty: number;
  unit: string;
  unit_cost_cents: number;
}

export interface Selection {
  /** Which tier the client picked. Ignored when the quote has no tiers. */
  tier?: Tier | null;
  /** Ids of the optional extras the client ticked. */
  optionalIds?: readonly string[];
}

export const TIER_ORDER: readonly Tier[] = ["good", "better", "best"] as const;

/** The tiers this quote actually offers, in presentation order. */
export function offeredTiers(items: readonly ScopeShape[]): Tier[] {
  const present = new Set(items.map((i) => i.tier).filter((t): t is Tier => t !== null));
  return TIER_ORDER.filter((t) => present.has(t));
}

export function hasTiers(items: readonly ScopeShape[]): boolean {
  return offeredTiers(items).length > 0;
}

/** Optional extras, in the order they were authored. */
export function optionalExtras<T extends ScopeShape>(items: readonly T[]): T[] {
  return items.filter((i) => i.is_optional);
}

/** Lines that are in every version of this quote. */
export function baseScope<T extends ScopeShape>(items: readonly T[]): T[] {
  return items.filter((i) => !i.is_optional && i.tier === null);
}

/**
 * The default a portal opens on: the cheapest offered tier, no extras. Starting
 * on the dearest option reads as a sales trick; starting on the cheapest lets the
 * client talk themselves up.
 */
export function defaultSelection(items: readonly ScopeShape[]): Selection {
  return { tier: offeredTiers(items)[0] ?? null, optionalIds: [] };
}

/**
 * Resolve a selection to the concrete set of lines it buys.
 *
 * An optional line that also carries a tier belongs to that tier — ticking it
 * while a different tier is selected must not smuggle it in.
 */
export function resolveScope<T extends ScopeShape>(
  items: readonly T[],
  selection: Selection = {},
): T[] {
  const tier = selection.tier ?? null;
  const chosen = new Set(selection.optionalIds ?? []);

  return items.filter((item) => {
    if (item.tier !== null && item.tier !== tier) return false;
    if (item.is_optional) return chosen.has(item.id);
    return true;
  });
}

export interface ScopedTotals extends Totals {
  /** Client-facing figures — what the portal and the PDF print. */
  display: { subtotal: number; gst: number; total: number };
  /** The lines the selection resolved to. */
  items: ScopeItem[];
}

/** Price a selection. Internal and client-facing figures in one pass. */
export function priceSelection(
  quote: CalcQuote,
  items: readonly ScopeItem[],
  selection: Selection = {},
): ScopedTotals {
  const scoped = resolveScope(items, selection);
  const totals = computeTotals(quote, scoped);
  const display = computeDisplayTotals(quote, scoped, totals);
  return { ...totals, display, items: scoped };
}

/**
 * What ticking one extra adds to the client-facing total.
 *
 * Deliberately computed as the difference between two full prices rather than as
 * the line's own marked-up amount: with the breakdown shown the displayed
 * subtotal is a sum of individually-rounded lines, so the honest answer to "what
 * does this add" is the change in the total the client will actually pay.
 */
export function extraDelta(
  quote: CalcQuote,
  items: readonly ScopeItem[],
  selection: Selection,
  extraId: string,
): number {
  const current = new Set(selection.optionalIds ?? []);
  const without = new Set(current);
  without.delete(extraId);
  const with_ = new Set(current);
  with_.add(extraId);

  const base = priceSelection(quote, items, { ...selection, optionalIds: [...without] });
  const plus = priceSelection(quote, items, { ...selection, optionalIds: [...with_] });
  return plus.display.total - base.display.total;
}

/** Client-facing total for each offered tier, for the portal's comparison row. */
export function tierPrices(
  quote: CalcQuote,
  items: readonly ScopeItem[],
  optionalIds: readonly string[] = [],
): { tier: Tier; total: number }[] {
  return offeredTiers(items).map((tier) => ({
    tier,
    total: priceSelection(quote, items, { tier, optionalIds }).display.total,
  }));
}

/**
 * Guard for the accept path: every id the client submitted must be an optional
 * extra on this quote. The database enforces the same rule; this catches it
 * earlier with a message a homeowner could act on.
 */
export function validateSelection(
  items: readonly ScopeShape[],
  selection: Selection,
): { ok: true } | { ok: false; reason: string } {
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const id of selection.optionalIds ?? []) {
    const item = byId.get(id);
    if (!item) return { ok: false, reason: "An optional extra on this quote no longer exists." };
    if (!item.is_optional) {
      return { ok: false, reason: "That line is part of the base scope, not an extra." };
    }
  }

  const tiers = offeredTiers(items);
  if (tiers.length > 0 && (selection.tier == null || !tiers.includes(selection.tier))) {
    return { ok: false, reason: "Choose one of the options before accepting." };
  }
  if (tiers.length === 0 && selection.tier != null) {
    return { ok: false, reason: "This quote does not offer options." };
  }

  return { ok: true };
}
