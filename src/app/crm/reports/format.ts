import type { LostReason } from "@/lib/db/types";

/**
 * Editorial rules for the reporting page: what may be printed as a number, and
 * how a number is worded.
 *
 * None of this belongs in `lib/reports.ts`. That module answers "what is the
 * figure"; this one answers "is the figure worth showing yet", which is a
 * judgement about the reader rather than about the arithmetic.
 */

/**
 * Below five decided quotes a win rate is a coin toss with a decimal point on
 * it — a single outcome swings it twenty points or more. The page prints the raw
 * counts instead. A confident-looking number derived from three quotes is worse
 * than no number, because the operator will act on it.
 */
export const THIN_SAMPLE = 5;

export function isThinSample(decided: number): boolean {
  return decided < THIN_SAMPLE;
}

/** Whole percent. Reporting on a few dozen quotes has no use for decimals. */
export function pct(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Money short enough for a chart axis. `moneyShort` prints every digit, which is
 * correct in a quote and far too wide in a 50px gutter.
 */
export function compactMoney(cents: number): string {
  const dollars = Math.round(cents / 100);
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(dollars >= 10_000_000 ? 0 : 1)}M`;
  }
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}k`;
  return `$${dollars}`;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthLabel {
  /** Three letters, for a chart axis. */
  short: string;
  /** Month and year spelled out, for tooltips and table rows. */
  full: string;
}

/** "2026-03" as an operator reads it. */
export function monthLabel(key: string): MonthLabel {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  const short = MONTH_SHORT[index];
  const full = MONTH_FULL[index];
  return {
    short: short ?? key,
    full: full ? `${full} ${year}` : key,
  };
}

const LOSS_REASON_LABEL: Record<LostReason | "unrecorded", string> = {
  price: "Price",
  timing: "Timing",
  went_elsewhere: "Went elsewhere",
  no_response: "No response",
  cancelled: "Cancelled",
  unrecorded: "Not recorded",
};

/** `lossReasons` hands back raw column values; anything unmapped shows as itself. */
export function lossReasonLabel(reason: string): string {
  return LOSS_REASON_LABEL[reason as LostReason | "unrecorded"] ?? reason;
}
