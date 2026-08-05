/**
 * Reporting (build plan phase 9).
 *
 * Deliberately pure TypeScript over rows already fetched, rather than SQL views.
 * The cost model — cost in, margin out, integer cents, displayed lines summing to
 * the printed total — lives in one place in `money.ts`. Reimplementing it in SQL
 * would create a second definition of what a quote is worth, and the two would
 * drift the first time a rounding rule changed. A single roofer's book of work is
 * a few thousand rows; correctness is worth more here than a saved round trip.
 *
 * Nearly all of this unlocks the moment phase 5's outcomes exist. Until a quote
 * reaches a terminal state you are quoting blind — no feedback on whether 22% on
 * re-roofs is winning work or losing it.
 */

import { computeTotals, type CalcItem } from "./money";
import { defaultSelection, resolveScope, type ScopeShape } from "./quote-pricing";
import type { LostReason, Quote, QuoteStatus, Tier } from "./db/types";

/** Enough to cost a line and to decide whether it is in scope. */
export type ReportItem = CalcItem & ScopeShape;

export interface ReportQuote {
  quote: Pick<
    Quote,
    | "id"
    | "status"
    | "roof_type"
    | "margin_pct"
    | "gst_enabled"
    | "gst_rate"
    | "show_breakdown"
    | "created_at"
    | "sent_at"
    | "accepted_at"
    | "total_cents"
    | "accepted_total_cents"
  > & {
    /** Absent on older fixtures and on quotes that never offered tiers. */
    selected_tier?: Tier | null;
  };
  items: ReportItem[];
  /** Line ids the client ticked on the portal. Empty until they accept. */
  selectedItemIds?: readonly string[];
  /** Where the client originally came from, when known. */
  source?: string | null;
}

/**
 * The lines this quote actually represents.
 *
 * A quote's `quote_items` rows can hold three good/better/best variants and any
 * number of client-selectable extras alongside the base scope. Costing the raw
 * list sums all of them, which is not a quote anyone was ever offered — on a
 * tiered job it inflates cost so badly that a healthy 25% margin reports as
 * about 1.5%. `money.ts` says plainly that the caller must filter first; this is
 * where reporting does it.
 *
 * An accepted quote resolves to what the client chose. Anything else resolves to
 * the default the portal opens on — cheapest tier, no extras — which is exactly
 * the scope whose total was frozen at issue.
 */
function scopeOf(row: ReportQuote): ReportItem[] {
  if (row.quote.status === "accepted") {
    return resolveScope(row.items, {
      tier: row.quote.selected_tier ?? null,
      optionalIds: row.selectedItemIds ?? [],
    });
  }
  return resolveScope(row.items, defaultSelection(row.items));
}

/** Internal totals over the resolved scope. The only costing path in this file. */
function internals(row: ReportQuote) {
  return computeTotals(row.quote, scopeOf(row));
}

/** Won and lost are the only outcomes that teach you anything. */
const WON: ReadonlySet<QuoteStatus> = new Set(["accepted"] as const);
const LOST: ReadonlySet<QuoteStatus> = new Set(["declined", "expired"] as const);

/**
 * A quote's value. Prefers what the client actually accepted, then the figure
 * frozen at issue, and only falls back to recomputing for drafts that have
 * neither. Recomputing an issued quote would silently reprice history if the
 * price book moved.
 */
export function quoteValueCents(row: ReportQuote): number {
  const { accepted_total_cents, total_cents } = row.quote;
  if (accepted_total_cents != null) return accepted_total_cents;
  if (total_cents != null) return total_cents;
  return internals(row).total;
}

/** Margin actually banked on a quote, in cents and as a percentage of cost. */
export function achievedMargin(row: ReportQuote): { cents: number; pct: number } {
  const internal = internals(row);
  const value = quoteValueCents(row);

  // Cost is the one figure that never moves after the fact. Achieved margin is
  // whatever the client paid, less that cost — which is not the same as the
  // quoted margin once extras or a tier change the scope.
  const cents = value - internal.subtotal - internal.gst;
  const pct = internal.subtotal > 0 ? (cents / internal.subtotal) * 100 : 0;
  return { cents, pct };
}

export interface WinRate {
  won: number;
  lost: number;
  decided: number;
  /** Percentage of decided quotes that were won. Zero when nothing has settled. */
  pct: number;
  /** Still live — sent, viewed, or in draft. */
  open: number;
}

export function winRate(rows: readonly ReportQuote[]): WinRate {
  let won = 0;
  let lost = 0;
  let open = 0;

  for (const row of rows) {
    if (WON.has(row.quote.status)) won += 1;
    else if (LOST.has(row.quote.status)) lost += 1;
    else if (row.quote.status !== "superseded") open += 1;
  }

  const decided = won + lost;
  return { won, lost, decided, open, pct: decided === 0 ? 0 : (won / decided) * 100 };
}

export interface ValueSummary {
  count: number;
  totalCents: number;
  averageCents: number;
}

function summarise(rows: readonly ReportQuote[]): ValueSummary {
  const totalCents = rows.reduce((sum, row) => sum + quoteValueCents(row), 0);
  return {
    count: rows.length,
    totalCents,
    averageCents: rows.length === 0 ? 0 : Math.round(totalCents / rows.length),
  };
}

export interface PipelineValue {
  /** Everything issued and not yet decided — the realistic forward book. */
  open: ValueSummary;
  won: ValueSummary;
  lost: ValueSummary;
  drafts: ValueSummary;
}

export function pipelineValue(rows: readonly ReportQuote[]): PipelineValue {
  return {
    open: summarise(rows.filter((r) => r.quote.status === "sent" || r.quote.status === "viewed")),
    won: summarise(rows.filter((r) => WON.has(r.quote.status))),
    lost: summarise(rows.filter((r) => LOST.has(r.quote.status))),
    drafts: summarise(rows.filter((r) => r.quote.status === "draft")),
  };
}

export interface MonthBucket {
  /** ISO year-month, e.g. "2026-08". Sortable as a string by construction. */
  month: string;
  quoted: ValueSummary;
  won: ValueSummary;
}

/** YYYY-MM in local time — the operator reads these as their own months. */
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Quoted and won value by month. Quoted is bucketed by issue date and won by
 * acceptance date, so a quote sent in March and accepted in May appears in both
 * — which is the honest picture of a pipeline with a lag in it.
 */
export function byMonth(rows: readonly ReportQuote[], months = 12): MonthBucket[] {
  const quoted = new Map<string, ReportQuote[]>();
  const won = new Map<string, ReportQuote[]>();

  const push = (map: Map<string, ReportQuote[]>, key: string, row: ReportQuote) => {
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  };

  for (const row of rows) {
    const issued = row.quote.sent_at;
    if (issued) push(quoted, monthKey(issued), row);
    if (row.quote.accepted_at) push(won, monthKey(row.quote.accepted_at), row);
  }

  const keys = [...new Set([...quoted.keys(), ...won.keys()])].sort();
  return keys.slice(-months).map((month) => ({
    month,
    quoted: summarise(quoted.get(month) ?? []),
    won: summarise(won.get(month) ?? []),
  }));
}

export interface Breakdown {
  key: string;
  quoted: number;
  won: number;
  lost: number;
  /** Win rate within this slice. */
  pct: number;
  wonValueCents: number;
}

function breakdownBy(
  rows: readonly ReportQuote[],
  keyOf: (row: ReportQuote) => string | null | undefined,
  fallback: string,
): Breakdown[] {
  const groups = new Map<string, ReportQuote[]>();
  for (const row of rows) {
    const key = (keyOf(row) ?? "").trim() || fallback;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const rate = winRate(group);
      return {
        key,
        quoted: group.length,
        won: rate.won,
        lost: rate.lost,
        pct: rate.pct,
        wonValueCents: group
          .filter((r) => WON.has(r.quote.status))
          .reduce((sum, r) => sum + quoteValueCents(r), 0),
      };
    })
    .sort((a, b) => b.wonValueCents - a.wonValueCents || b.quoted - a.quoted);
}

/** Conversion by job type — tells you which work you are actually good at winning. */
export function byJobType(rows: readonly ReportQuote[]): Breakdown[] {
  return breakdownBy(rows, (r) => r.quote.roof_type, "Unspecified");
}

/** Conversion by lead source — tells you which marketing to keep paying for. */
export function bySource(rows: readonly ReportQuote[]): Breakdown[] {
  return breakdownBy(rows, (r) => r.source, "Unknown");
}

export interface MarginSummary {
  /** Straight average of the margin quoted on each quote. */
  quotedPct: number;
  /** Cost-weighted margin actually achieved on won work. */
  achievedPct: number;
  achievedCents: number;
}

/**
 * Quoted versus achieved margin on won work.
 *
 * Achieved is weighted by cost rather than averaged per quote: a 30% margin on a
 * $900 leak repair and a 15% margin on a $90,000 re-roof do not average to 22.5%
 * in any sense that pays wages.
 */
export function marginSummary(rows: readonly ReportQuote[]): MarginSummary {
  const wonRows = rows.filter((r) => WON.has(r.quote.status));
  if (wonRows.length === 0) return { quotedPct: 0, achievedPct: 0, achievedCents: 0 };

  const quotedPct =
    wonRows.reduce((sum, r) => sum + Number(r.quote.margin_pct || 0), 0) / wonRows.length;

  let costCents = 0;
  let achievedCents = 0;
  for (const row of wonRows) {
    costCents += internals(row).subtotal;
    achievedCents += achievedMargin(row).cents;
  }

  return {
    quotedPct,
    achievedPct: costCents > 0 ? (achievedCents / costCents) * 100 : 0,
    achievedCents,
  };
}

/** Why work is being lost. Ordered worst-first so the top row is the problem. */
export function lossReasons(
  opportunities: readonly { stage_id: string; lost_reason: LostReason | null }[],
): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const opp of opportunities) {
    if (opp.stage_id !== "lost") continue;
    const key = opp.lost_reason ?? "unrecorded";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
