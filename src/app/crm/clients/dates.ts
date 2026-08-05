/**
 * Date rendering for the client screens.
 *
 * The business runs on Sydney time, and a timestamp only means something in one
 * zone. Naming the zone rather than letting each runtime pick its own is also
 * what stops the server render and the browser hydration disagreeing about which
 * day a late-evening call was logged on.
 */
const BUSINESS_TZ = "Australia/Sydney";
const DAY_MS = 86_400_000;

/**
 * The zone is a constant here rather than configuration, unlike its server-side
 * counterpart in `_workspace/dates.ts`. These helpers run inside client
 * components, where a `process.env` read is inlined as undefined at build time —
 * the server would format in the configured zone and the browser in Sydney, and
 * the two renders would disagree.
 */
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function fmtMoment(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: BUSINESS_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    timeZone: BUSINESS_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A due date is a day, not an instant. Anchoring it to midday keeps the stored
 * timestamp on the day the operator picked; a bare "YYYY-MM-DD" would be read as
 * UTC midnight and read back in Sydney as the day before.
 */
export function dueAtFromDay(day: string): string {
  return new Date(`${day}T12:00:00+10:00`).toISOString();
}

/**
 * Whole days from today until the day `iso` falls on; negative once past.
 *
 * Measured between calendar days in business time, not between instants. A task
 * due at 11pm last night is a day overdue to the person who has to do it, but a
 * millisecond subtraction rounds those ten hours to zero and calls it due today
 * — which is what /tasks, bucketing on calendar days, already disagrees with.
 * Both screens have to answer this the same way or the same task reads as
 * overdue in one place and current in the other.
 */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const from = Date.parse(`${DAY_KEY.format(now)}T00:00:00Z`);
  const to = Date.parse(`${DAY_KEY.format(new Date(iso))}T00:00:00Z`);
  return Math.round((to - from) / DAY_MS);
}

/** "Overdue by 3 days" / "Due today" / "Due in 5 days" — the phrasing a task needs. */
export function dueLabel(iso: string, now: Date = new Date()): string {
  const days = daysUntil(iso, now);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}
