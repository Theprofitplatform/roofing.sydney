"use server";

import { revalidateCrm } from "@/lib/revalidate";
import { isRuleViolation } from "@/lib/db/client";
import {
  completeJob,
  createJobFromQuote,
  raiseVariation,
  setJobStatus,
  updateJob,
} from "@/lib/db/jobs";
import { raiseDepositInvoice } from "@/lib/db/invoices";
import { getCurrentUser } from "@/lib/supabase-server";
import type { JobStatus } from "@/lib/db/types";

/**
 * Job lifecycle actions.
 *
 * Every guard the database enforces is restated here as a message, not as logic:
 * the trigger stays the single source of truth, and the operator gets the
 * sentence it wrote rather than a Postgres string with a constraint name in it.
 */

export type Failure = { ok: false; error: string };

/**
 * `DbError` prefixes the calling function so a log line is traceable back to
 * its query. The operator only needs the sentence after it.
 */
function plainRuleMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^\w+:\s*/, "");
}

function message(error: unknown): string {
  // A rule violation is the database refusing on purpose — "cannot open a job
  // against a quote with status draft" tells the operator exactly what to do.
  if (isRuleViolation(error)) return plainRuleMessage(error);
  console.error(error);
  return "Something went wrong — nothing was saved. Try again, or reload the page.";
}

function refreshJob(jobId: string): void {
  revalidateCrm("/jobs");
  revalidateCrm(`/jobs/${jobId}`);
}

/** Empty form fields arrive as "", which is not the same thing as "no date". */
function toDate(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// ── Opening a job ──────────────────────────────────────────────────────────

/**
 * Idempotent by way of `create_job_from_quote`, which returns the existing job
 * rather than raising a second one against the same signature.
 */
export async function openJob(
  quoteId: string,
): Promise<{ ok: true; jobId: string } | Failure> {
  try {
    const job = await createJobFromQuote(quoteId);
    revalidateCrm("/jobs");
    revalidateCrm(`/quotes/${quoteId}`);
    return { ok: true, jobId: job.id };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Schedule ───────────────────────────────────────────────────────────────

export async function saveSchedule(
  jobId: string,
  scheduledStart: string | null,
  scheduledEnd: string | null,
): Promise<{ ok: true } | Failure> {
  const start = toDate(scheduledStart);
  const end = toDate(scheduledEnd);

  // `jobs_dates_ordered` would reject this anyway; checking first means the
  // operator reads a sentence instead of a constraint name.
  if (start && end && end < start) {
    return { ok: false, error: "The finish date cannot fall before the start date." };
  }

  try {
    await updateJob(jobId, { scheduled_start: start, scheduled_end: end });
    refreshJob(jobId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function changeStatus(
  jobId: string,
  status: JobStatus,
): Promise<{ ok: true } | Failure> {
  try {
    await setJobStatus(jobId, status);
    refreshJob(jobId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Completion sign-off ────────────────────────────────────────────────────

/**
 * Sign-off stamps `completed_at` once and never moves it, so re-running this to
 * append crew notes does not rewrite when the work finished.
 */
export async function signOffJob(
  jobId: string,
  crewNotes: string,
): Promise<{ ok: true } | Failure> {
  try {
    await completeJob(jobId, crewNotes.trim() || null);
    refreshJob(jobId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Variations ─────────────────────────────────────────────────────────────

/**
 * The seeded exclusions promise the homeowner that latent conditions "will be
 * quoted as a variation", so this is the workflow the document already commits
 * to. It raises a linked DRAFT quote; the caller sends the operator to its
 * builder to price the work.
 */
export async function addVariation(
  jobId: string,
  reason: string,
): Promise<{ ok: true; quoteId: string } | Failure> {
  if (!reason.trim()) {
    return { ok: false, error: "Say what the variation is for — it goes on the client's quote." };
  }

  try {
    const user = await getCurrentUser();
    const quote = await raiseVariation(jobId, reason.trim(), user?.id ?? null);
    refreshJob(jobId);
    revalidateCrm("/quotes");
    return { ok: true, quoteId: quote.id };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

// ── Money ──────────────────────────────────────────────────────────────────

/**
 * Raise the deposit the quote PDF already promises. Idempotent in the database,
 * and a null result means deposits are switched off in settings — a
 * configuration answer, not a failure.
 */
export async function raiseDeposit(
  jobId: string,
  quoteId: string,
): Promise<{ ok: true; invoiceId: string | null } | Failure> {
  try {
    const invoice = await raiseDepositInvoice(quoteId);
    refreshJob(jobId);
    revalidateCrm("/invoices");
    return { ok: true, invoiceId: invoice?.id ?? null };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
