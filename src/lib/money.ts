/**
 * Money and quote arithmetic — ported from the prototype's primitives.jsx.
 *
 * Two rules that must not drift:
 *
 * 1. Money is INTEGER CENTS. Never floats. `0.1 + 0.2 !== 0.3`, and a quote
 *    whose lines do not sum to its printed total is a commercial problem.
 *
 * 2. COST IN, MARGIN OUT. Line items store the supplier's cost. The
 *    client-facing document marks every line up by `margin_pct`, so the printed
 *    lines reconcile to the printed total and the customer never sees cost.
 *    This is the model a generic invoicing tool gets wrong.
 */

import type { ItemKind } from "./db/types";

export interface CalcItem {
  kind: ItemKind;
  qty: number | string;
  unit_cost_cents: number;
  is_optional?: boolean;
}

export interface CalcQuote {
  margin_pct: number | string;
  gst_enabled?: boolean;
  gst_rate?: number | string;
  show_breakdown?: boolean;
}

export interface Totals {
  /** Materials at cost. */
  matCents: number;
  /** Labour at cost. */
  labCents: number;
  /** Cost subtotal (materials + labour). Internal only. */
  subtotal: number;
  /** Margin added on top of cost. Internal only — never printed. */
  margin: number;
  /** Client-facing price before tax. */
  preGst: number;
  gst: number;
  total: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The prototype built these as `"$" + value.toLocaleString(...)`, which renders
 * a negative as "$-123.45". No amount in a quote can be negative today, but it
 * would be a visible defect the moment discounts or credits arrive, so the sign
 * is placed correctly here. Non-negative output is byte-identical.
 */
const withSign = (cents: number, opts: Intl.NumberFormatOptions): string => {
  const v = cents / 100;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-AU", opts);
};

/** AUD, always two decimals. */
export function money(cents: number, decimals = 2): string {
  return withSign(cents, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** AUD, dropping ".00" on whole dollars. For headline figures. */
export function moneyShort(cents: number): string {
  return withSign(cents, {
    minimumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Cost of one line. Rounded once, here. */
export function lineTotalCents(item: CalcItem): number {
  return Math.round(num(item.qty) * (item.unit_cost_cents || 0));
}

/**
 * Internal totals — what the operator sees in the builder. `margin` is visible
 * here and nowhere else.
 *
 * Optional (client-selectable) lines are excluded until the client selects
 * them; pass them through `selectedOptionalIds` at the call site by filtering
 * before you get here.
 */
export function computeTotals(quote: CalcQuote, items: CalcItem[]): Totals {
  const matCents = items
    .filter((i) => i.kind === "material")
    .reduce((s, i) => s + lineTotalCents(i), 0);

  const labCents = items
    .filter((i) => i.kind === "labour")
    .reduce((s, i) => s + lineTotalCents(i), 0);

  const subtotal = matCents + labCents;
  const margin = Math.round((subtotal * num(quote.margin_pct)) / 100);
  const preGst = subtotal + margin;

  const rate = quote.gst_rate === undefined ? 10 : num(quote.gst_rate);
  const gst = quote.gst_enabled ? Math.round((preGst * rate) / 100) : 0;

  return { matCents, labCents, subtotal, margin, preGst, gst, total: preGst + gst };
}

/** Marked-up unit price shown to the client. */
export function displayUnitCents(item: CalcItem, marginPct: number | string): number {
  return Math.round((item.unit_cost_cents || 0) * (1 + num(marginPct) / 100));
}

/** Marked-up line amount shown to the client. */
export function displayAmountCents(item: CalcItem, marginPct: number | string): number {
  return Math.round(displayUnitCents(item, marginPct) * num(item.qty));
}

export interface DisplayTotals {
  subtotal: number;
  gst: number;
  total: number;
}

/**
 * Client-facing totals for the PDF.
 *
 * When the breakdown is shown, the subtotal is the sum of the DISPLAYED line
 * amounts, not `preGst`. Those two can differ by a cent or so, because each
 * displayed line is rounded before summing while `preGst` rounds the margin
 * once over the whole subtotal. Summing the displayed lines is the correct
 * choice: a client who adds up the column must arrive at the total printed
 * underneath it. Without this the document contradicts itself.
 */
export function computeDisplayTotals(
  quote: CalcQuote,
  items: CalcItem[],
  totals = computeTotals(quote, items),
): DisplayTotals {
  const subtotal = quote.show_breakdown
    ? items.reduce((s, i) => s + displayAmountCents(i, quote.margin_pct), 0)
    : totals.preGst;

  const rate = quote.gst_rate === undefined ? 10 : num(quote.gst_rate);
  const gst = quote.gst_enabled ? Math.round((subtotal * rate) / 100) : 0;

  return { subtotal, gst, total: subtotal + gst };
}

/** Deposit due on acceptance, from the client-facing total. */
export function depositCents(total: number, depositPct: number | string): number {
  return Math.round((total * num(depositPct)) / 100);
}

/** True when the quote's margin dips below the configured floor. */
export function isBelowMarginFloor(
  marginPct: number | string,
  floorPct: number | string,
): boolean {
  return num(marginPct) < num(floorPct);
}
