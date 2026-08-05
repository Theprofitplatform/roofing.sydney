import type { JobRow } from "@/lib/db/jobs";
import type {
  AttachmentKind,
  InvoiceKind,
  InvoiceStatus,
  JobStatus,
  Quote,
} from "@/lib/db/types";

/**
 * Presentation vocabulary shared by the jobs list and the job page.
 *
 * Pure, and deliberately free of `server-only` — the screens that use it are
 * client components, and duplicating a status label is how two screens end up
 * disagreeing about what "on hold" is called.
 */

export const JOB_STATUSES: readonly JobStatus[] = [
  "scheduled",
  "in_progress",
  "on_hold",
  "complete",
  "cancelled",
];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  on_hold: "On hold",
  complete: "Complete",
  cancelled: "Cancelled",
};

/**
 * Job status borrows the quote pill palette rather than introducing a second
 * colour language. Cancelled drops the status dot: a job nobody will ever work
 * should not wear the same live marker as one merely waiting to start.
 */
export const JOB_PILL_CLASS: Record<JobStatus, string> = {
  scheduled: "pill--draft",
  in_progress: "pill--viewed",
  on_hold: "pill--warning",
  complete: "pill--sent",
  cancelled: "pill--draft pill--no-dot",
};

export const INVOICE_PILL_CLASS: Record<InvoiceStatus, string> = {
  draft: "pill--draft",
  sent: "pill--viewed",
  part_paid: "pill--warning",
  paid: "pill--sent",
  void: "pill--draft pill--no-dot",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  part_paid: "Part paid",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  deposit: "Deposit",
  progress: "Progress claim",
  final: "Final",
};

/** A finished or abandoned job takes no further scheduling decisions. */
export function isSettled(status: JobStatus): boolean {
  return status === "complete" || status === "cancelled";
}

/** What the client actually signed for, falling back to the issued total. */
export function jobValueCents(
  quote: Pick<Quote, "total_cents" | "accepted_total_cents">,
): number {
  return quote.accepted_total_cents ?? quote.total_cents ?? 0;
}

/**
 * An accepted quote with no job against it. Shaped on the server so the list
 * does not have to carry every quote in the book to find the handful that are
 * waiting on a decision.
 */
export interface OpenableQuote {
  quoteId: string;
  quoteNumber: string | null;
  clientName: string;
  propertyAddress: string | null;
  roofType: string | null;
  valueCents: number;
  acceptedAt: string | null;
}

// ── Dates ──────────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A schedule date is a calendar date, not an instant.
 *
 * Putting "2026-08-06" through `Date` resolves it to UTC midnight, which renders
 * as the 5th anywhere west of Greenwich and — worse — can differ between the
 * server render and the browser's hydration of it. Formatting the string
 * directly gives back exactly the day the operator typed, everywhere.
 */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const month = MONTHS[Number(m) - 1];
  if (!month || !d) return iso;
  return `${Number(d)} ${month} ${y}`;
}

/**
 * The business runs on Sydney time, and a timestamp is only meaningful in one
 * zone. Naming it here also keeps the server render and the client hydration
 * agreeing about which day a late-evening sign-off happened on.
 */
const BUSINESS_TZ = "Australia/Sydney";

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

export function fmtSchedule(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "Not scheduled";
  if (start && !end) return `From ${fmtDay(start)}`;
  if (!start && end) return `Until ${fmtDay(end)}`;
  if (start === end) return fmtDay(start);
  return `${fmtDay(start)} → ${fmtDay(end)}`;
}

// ── List shaping ───────────────────────────────────────────────────────────

/**
 * Unscheduled jobs first, then earliest start.
 *
 * A job with no dates is the one holding a decision — it has been signed, the
 * client is waiting, and nobody has committed a week to it. Burying those below
 * a year of booked work is how they get forgotten.
 */
export function sortJobs(rows: JobRow[]): JobRow[] {
  return [...rows].sort((a, b) => {
    const sa = a.job.scheduled_start;
    const sb = b.job.scheduled_start;
    if (!sa && !sb) return a.job.created_at.localeCompare(b.job.created_at);
    if (!sa) return -1;
    if (!sb) return 1;
    return sa.localeCompare(sb);
  });
}

/** ISO dates sort lexicographically, so the search is a plain substring test. */
export function matchesJob(row: JobRow, term: string): boolean {
  if (!term) return true;
  const haystack = [
    row.quote.quote_number,
    row.client.name,
    row.client.property_address,
    row.quote.roof_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

// ── Attachments ────────────────────────────────────────────────────────────

export const ATTACHMENT_KINDS: readonly AttachmentKind[] = [
  "engineer_report",
  "colour_sheet",
  "warranty",
  "photo",
  "other",
];

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  engineer_report: "Engineer's report",
  colour_sheet: "Colour sheet",
  warranty: "Warranty",
  photo: "Photo",
  other: "Other",
};

export const ATTACHMENT_KIND_ICON: Record<AttachmentKind, string> = {
  engineer_report: "file-search",
  colour_sheet: "droplets",
  warranty: "clipboard",
  photo: "image",
  other: "paperclip",
};

/**
 * An engineer's report is a PDF and a colour sheet is a scan; 20 MB covers both
 * with room to spare while keeping someone's site walkthrough video out of a
 * bucket that exists to hold paperwork. Checked in the browser so the operator
 * finds out before the upload, and again on the server because the browser is
 * not a guard.
 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Bytes as the operator's file manager shows them. */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
