import "server-only";
import { db, unwrap, unwrapMaybe, unwrapList, DbError } from "./client";
import type {
  AttachmentKind,
  Client,
  Job,
  JobAttachment,
  JobStatus,
  Quote,
  Variation,
} from "./types";

/**
 * Operations: an accepted quote becomes a job, the job runs to completion, and
 * anything found on the way is raised as a variation.
 *
 * The seeded exclusions promise the homeowner that latent conditions "will be
 * quoted as a variation". Before this the document committed to a workflow the
 * tool could not perform.
 */

export interface JobRow {
  job: Job;
  quote: Pick<Quote, "id" | "quote_number" | "roof_type" | "total_cents" | "accepted_total_cents">;
  client: Pick<Client, "id" | "name" | "phone" | "property_address">;
}

type JobShape = Job & {
  quote: JobRow["quote"] & { client: JobRow["client"] };
};

const JOB_SELECT = `
  *,
  quote:quotes!inner (
    id, quote_number, roof_type, total_cents, accepted_total_cents,
    client:clients!inner (id, name, phone, property_address)
  )
`;

function toRow(row: JobShape): JobRow {
  const { quote, ...job } = row;
  const { client, ...quoteFields } = quote;
  return { job: job as Job, quote: quoteFields, client };
}

export async function listJobs(): Promise<JobRow[]> {
  const supabase = await db();
  const rows = unwrapList<JobShape>(
    "listJobs",
    await supabase
      .from("jobs")
      .select(JOB_SELECT)
      .order("scheduled_start", { ascending: true, nullsFirst: false }),
  );
  return rows.map(toRow);
}

export async function getJob(id: string): Promise<JobRow | null> {
  const supabase = await db();
  const row = unwrapMaybe<JobShape>(
    "getJob",
    await supabase.from("jobs").select(JOB_SELECT).eq("id", id).single(),
  );
  return row ? toRow(row) : null;
}

export async function getJobForQuote(quoteId: string): Promise<Job | null> {
  const supabase = await db();
  return unwrapMaybe<Job>(
    "getJobForQuote",
    await supabase.from("jobs").select("*").eq("quote_id", quoteId).single(),
  );
}

/**
 * Open a job against an accepted quote. Idempotent — accepting twice, or a
 * double-clicked button, returns the existing job rather than raising a second.
 */
export async function createJobFromQuote(
  quoteId: string,
  scheduledStart?: string | null,
  scheduledEnd?: string | null,
): Promise<Job> {
  const supabase = await db();
  return unwrap<Job>(
    "createJobFromQuote",
    await supabase
      .rpc("create_job_from_quote", {
        p_quote_id: quoteId,
        p_scheduled_start: scheduledStart ?? null,
        p_scheduled_end: scheduledEnd ?? null,
      })
      .single(),
  );
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "scheduled_start" | "scheduled_end" | "crew_notes">>,
): Promise<Job> {
  const supabase = await db();
  return unwrap<Job>(
    "updateJob",
    await supabase.from("jobs").update(patch).eq("id", id).select("*").single(),
  );
}

export async function setJobStatus(id: string, status: JobStatus): Promise<Job> {
  return updateJob(id, { status });
}

/** Completion sign-off. Separate from `updateJob` because it stamps the clock. */
export async function completeJob(id: string, crewNotes?: string | null): Promise<Job> {
  const supabase = await db();
  return unwrap<Job>(
    "completeJob",
    await supabase
      .rpc("complete_job", { p_job_id: id, p_crew_notes: crewNotes ?? null })
      .single(),
  );
}

// ── Variations ─────────────────────────────────────────────────────────────

export interface VariationRow {
  variation: Variation;
  quote: Pick<Quote, "id" | "quote_number" | "status" | "roof_type"> | null;
}

export async function listVariations(jobId: string): Promise<VariationRow[]> {
  const supabase = await db();
  const rows = unwrapList<Variation & { quote: VariationRow["quote"] }>(
    "listVariations",
    await supabase
      .from("variations")
      .select("*, quote:quotes (id, quote_number, status, roof_type)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
  );
  return rows.map(({ quote, ...variation }) => ({ variation: variation as Variation, quote }));
}

/** Raise a variation as its own draft quote, linked back to the job. */
export async function raiseVariation(
  jobId: string,
  reason: string,
  createdBy?: string | null,
): Promise<Quote> {
  const supabase = await db();
  return unwrap<Quote>(
    "raiseVariation",
    await supabase
      .rpc("raise_variation", {
        p_job_id: jobId,
        p_reason: reason,
        p_created_by: createdBy ?? null,
      })
      .single(),
  );
}

// ── Attachments ────────────────────────────────────────────────────────────

export async function listAttachments(jobId: string): Promise<JobAttachment[]> {
  const supabase = await db();
  return unwrapList<JobAttachment>(
    "listAttachments",
    await supabase
      .from("job_attachments")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
  );
}

export async function addAttachment(
  jobId: string,
  storagePath: string,
  kind: AttachmentKind,
  filename?: string | null,
  caption?: string | null,
  createdBy?: string | null,
): Promise<JobAttachment> {
  const supabase = await db();
  return unwrap<JobAttachment>(
    "addAttachment",
    await supabase
      .from("job_attachments")
      .insert({
        job_id: jobId,
        storage_path: storagePath,
        kind,
        filename: filename ?? null,
        caption: caption ?? null,
        created_by: createdBy ?? null,
      })
      .select("*")
      .single(),
  );
}

export async function deleteAttachment(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("job_attachments").delete().eq("id", id);
  if (error) throw new DbError("deleteAttachment", error);
}
