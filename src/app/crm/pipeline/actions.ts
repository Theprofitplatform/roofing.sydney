"use server";

import { revalidateCrm } from "@/lib/revalidate";
import { isRuleViolation } from "@/lib/db/client";
import { intakeLead, setStage } from "@/lib/db/pipeline";
import { getCurrentUser } from "@/lib/supabase-server";
import type { LostReason, StageId } from "@/lib/db/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Pull a public-site enquiry onto the board.
 *
 * The lead route already does this on submission, so this is the recovery path
 * for when that best-effort call failed. `intakeLead` runs as the service role
 * and therefore bypasses RLS, which is the one place in this screen where the
 * signed-in operator has to be checked explicitly rather than by policy.
 */
export async function addLeadToPipeline(leadId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has expired. Sign in again." };

  try {
    await intakeLead(leadId);
    revalidateCrm("/pipeline", "/", "/clients");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/**
 * A trigger that rejected on purpose carries a message written to be read by the
 * operator. Anything else is a fault, and a raw Postgres string is no use to
 * anyone standing on a roof.
 */
function message(error: unknown): string {
  if (isRuleViolation(error) && error instanceof Error) {
    // Strip the "context: " prefix the data layer adds for the log.
    return error.message.replace(/^[^:]+:\s*/, "");
  }
  return "Something went wrong. Try again, or reload the page.";
}

/**
 * Move a card between stages.
 *
 * `lost` requires a reason and the database enforces it, so the board collects
 * one before calling rather than letting the trigger reject the write. This
 * re-guard catches the case where a tab has been open long enough for the
 * requirement to be bypassed by a stale render.
 */
export async function moveOpportunity(
  id: string,
  stageId: StageId,
  lostReason: LostReason | null = null,
): Promise<ActionResult> {
  if (stageId === "lost" && !lostReason) {
    return { ok: false, error: "Choose why this one was lost before marking it." };
  }

  try {
    await setStage(id, stageId, lostReason);
    revalidateCrm("/pipeline", "/", "/clients");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
