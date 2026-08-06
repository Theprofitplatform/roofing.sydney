/**
 * Date handling for the pipeline, tasks and dashboard screens.
 *
 * Everything here works in the business's timezone rather than the server's. The
 * app ships in a container running on UTC, so a task due tomorrow morning in
 * Sydney is already "tomorrow" by the server's clock and would bucket wrongly —
 * and, worse, the server's answer and the browser's would disagree, which
 * surfaces as a hydration mismatch. So all bucketing and formatting happens once,
 * on the server, and the client components receive finished strings.
 *
 * The timezone is configuration rather than a constant because the CRM is sold
 * as an operator tool, not as a Sydney-only one.
 */

const TZ = process.env.BUSINESS_TIMEZONE || "Australia/Sydney";

// Formatters are expensive to construct and these run over every row on a page.
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const WEEKDAY = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const SHORT_DAY = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
});

export type DateInput = string | number | Date;

/** YYYY-MM-DD in business time. Compares and sorts correctly as a plain string. */
export function dayKey(value: DateInput = Date.now()): string {
  return DAY_KEY.format(new Date(value));
}

const DAY_MS = 86_400_000;

/**
 * Whole calendar days between two day keys. Working from keys rather than
 * timestamps means a daylight-saving change cannot produce a 23-hour "day".
 */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Calendar days elapsed since a timestamp, never negative. */
export function daysSince(value: DateInput, today = dayKey()): number {
  return Math.max(0, dayDiff(dayKey(value), today));
}

export type DueBucket = "overdue" | "today" | "upcoming";

export function bucketFor(dueAt: DateInput, today = dayKey()): DueBucket {
  const key = dayKey(dueAt);
  if (key < today) return "overdue";
  if (key === today) return "today";
  return "upcoming";
}

/** "Thu 6 Aug" — enough to place a date without the noise of a year. */
export function formatDay(value: DateInput): string {
  return WEEKDAY.format(new Date(value));
}

/** "6 Aug" — for dense meta rows where the weekday earns nothing. */
export function formatShortDay(value: DateInput): string {
  return SHORT_DAY.format(new Date(value));
}

/** "today", "yesterday", "3d ago" — relative phrasing for a movement log. */
export function relativeDay(value: DateInput, today = dayKey()): string {
  const days = daysSince(value, today);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}
