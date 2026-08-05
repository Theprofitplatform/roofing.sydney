import "server-only";
import { db, admin, unwrap, unwrapMaybe, unwrapList, DbError } from "./client";
import type {
  Activity,
  ActivityKind,
  Client,
  Lead,
  LostReason,
  Opportunity,
  PipelineStage,
  StageId,
} from "./types";

/**
 * The CRM half of the app: enquiries becoming opportunities, opportunities
 * moving through stages to an outcome, and the contact log that hangs off both.
 *
 * The prototype rendered an "Accepted" badge that nothing ever set, so the tool
 * could not tell you whether you had won. Everything here exists to close that.
 */

export async function listStages(): Promise<PipelineStage[]> {
  const supabase = await db();
  return unwrapList<PipelineStage>(
    "listStages",
    await supabase.from("pipeline_stages").select("*").order("sort", { ascending: true }),
  );
}

export interface OpportunityCard {
  opportunity: Opportunity;
  client: Pick<Client, "id" | "name" | "phone" | "email" | "property_address">;
  quote_count: number;
}

type CardShape = Opportunity & {
  client: OpportunityCard["client"];
  quotes: { count: number }[];
};

const CARD_SELECT = `
  *,
  client:clients!inner (id, name, phone, email, property_address),
  quotes (count)
`;

/** The board. One query, ordered so each column reads oldest-stalest first. */
export async function listOpportunities(): Promise<OpportunityCard[]> {
  const supabase = await db();
  const rows = unwrapList<CardShape>(
    "listOpportunities",
    await supabase.from("opportunities").select(CARD_SELECT).order("updated_at", { ascending: true }),
  );
  return rows.map(({ client, quotes, ...opportunity }) => ({
    opportunity: opportunity as Opportunity,
    client,
    quote_count: quotes?.[0]?.count ?? 0,
  }));
}

export async function listOpportunitiesForClient(clientId: string): Promise<Opportunity[]> {
  const supabase = await db();
  return unwrapList<Opportunity>(
    "listOpportunitiesForClient",
    await supabase
      .from("opportunities")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  );
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const supabase = await db();
  return unwrapMaybe<Opportunity>(
    "getOpportunity",
    await supabase.from("opportunities").select("*").eq("id", id).single(),
  );
}

export interface OpportunityInput {
  client_id: string;
  title?: string | null;
  roof_type?: string | null;
  stage_id?: StageId;
  visit_at?: string | null;
}

export async function createOpportunity(
  input: OpportunityInput,
  createdBy?: string | null,
): Promise<Opportunity> {
  const supabase = await db();
  return unwrap<Opportunity>(
    "createOpportunity",
    await supabase
      .from("opportunities")
      .insert({ ...input, created_by: createdBy ?? null })
      .select("*")
      .single(),
  );
}

/**
 * Move a card. A `lost` stage without a reason is rejected by a trigger, not by
 * the UI — an outcome with no reason teaches you nothing about why you are losing
 * work, and the rule has to hold whichever client wrote it.
 */
export async function setStage(
  id: string,
  stageId: StageId,
  lostReason?: LostReason | null,
): Promise<Opportunity> {
  const supabase = await db();
  return unwrap<Opportunity>(
    "setStage",
    await supabase
      .from("opportunities")
      .update({
        stage_id: stageId,
        // Clear a stale reason when a card moves back out of `lost`.
        lost_reason: stageId === "lost" ? (lostReason ?? null) : null,
      })
      .eq("id", id)
      .select("*")
      .single(),
  );
}

export async function updateOpportunity(
  id: string,
  patch: Partial<Pick<Opportunity, "title" | "roof_type" | "visit_at">>,
): Promise<Opportunity> {
  const supabase = await db();
  return unwrap<Opportunity>(
    "updateOpportunity",
    await supabase.from("opportunities").update(patch).eq("id", id).select("*").single(),
  );
}

export async function deleteOpportunity(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  if (error) throw new DbError("deleteOpportunity", error);
}

// ── Activities: contact log and task list in one table ─────────────────────

export interface ActivityInput {
  kind: ActivityKind;
  body?: string | null;
  client_id?: string | null;
  opportunity_id?: string | null;
  quote_id?: string | null;
  due_at?: string | null;
}

export async function listActivitiesForClient(clientId: string): Promise<Activity[]> {
  const supabase = await db();
  return unwrapList<Activity>(
    "listActivitiesForClient",
    await supabase
      .from("activities")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  );
}

export interface OpenTask {
  activity: Activity;
  client: Pick<Client, "id" | "name" | "phone"> | null;
}

type TaskShape = Activity & { client: OpenTask["client"] };

/**
 * The day's work: everything with a due date and no completion, soonest first.
 * Overdue sorts to the top naturally because its date is in the past.
 */
export async function listOpenTasks(): Promise<OpenTask[]> {
  const supabase = await db();
  const rows = unwrapList<TaskShape>(
    "listOpenTasks",
    await supabase
      .from("activities")
      .select("*, client:clients (id, name, phone)")
      .is("done_at", null)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true }),
  );
  return rows.map(({ client, ...activity }) => ({ activity: activity as Activity, client }));
}

export async function logActivity(
  input: ActivityInput,
  createdBy?: string | null,
): Promise<Activity> {
  const supabase = await db();
  return unwrap<Activity>(
    "logActivity",
    await supabase
      .from("activities")
      .insert({ ...input, created_by: createdBy ?? null })
      .select("*")
      .single(),
  );
}

export async function completeActivity(id: string): Promise<Activity> {
  const supabase = await db();
  return unwrap<Activity>(
    "completeActivity",
    await supabase
      .from("activities")
      .update({ done_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single(),
  );
}

/** Push a task out. Snoozing is the honest alternative to ignoring a nudge. */
export async function snoozeActivity(id: string, dueAt: string): Promise<Activity> {
  const supabase = await db();
  return unwrap<Activity>(
    "snoozeActivity",
    await supabase.from("activities").update({ due_at: dueAt }).eq("id", id).select("*").single(),
  );
}

export async function deleteActivity(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) throw new DbError("deleteActivity", error);
}

// ── Lead intake ────────────────────────────────────────────────────────────

/**
 * Turn a public-site enquiry into a client and a pipeline card.
 *
 * Runs as the service role: this is called from the public lead route, which has
 * no operator session. Idempotent on `lead_id`, so a retried submission cannot
 * produce two clients for one enquiry.
 */
export async function intakeLead(leadId: string): Promise<Opportunity> {
  const supabase = admin();
  return unwrap<Opportunity>(
    "intakeLead",
    await supabase.rpc("intake_lead", { p_lead_id: leadId }).single(),
  );
}

/** Enquiries that have not yet been pulled into the pipeline. */
export async function listUnconvertedLeads(): Promise<Lead[]> {
  const supabase = await db();
  const converted = unwrapList<{ lead_id: string }>(
    "listUnconvertedLeads/clients",
    await supabase.from("clients").select("lead_id").not("lead_id", "is", null),
  );
  const seen = new Set(converted.map((row) => row.lead_id));

  const leads = unwrapList<Lead>(
    "listUnconvertedLeads/leads",
    await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(100),
  );
  return leads.filter((lead) => !seen.has(lead.id));
}
