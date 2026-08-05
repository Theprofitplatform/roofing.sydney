"use server";

import { revalidateCrm } from "@/lib/revalidate";
import { isRuleViolation } from "@/lib/db/client";
import {
  completeActivity,
  deleteActivity,
  logActivity,
  snoozeActivity,
} from "@/lib/db/pipeline";
import { getCurrentUser } from "@/lib/supabase-server";
import type { ActivityKind } from "@/lib/db/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const DAY_MS = 86_400_000;

/**
 * Turn a dashboard nudge into work. A flag that only tells you a quote has gone
 * quiet is a shrug; this makes it something with a due date on it, tied back to
 * the quote so the history reads properly on the client's file.
 */
export async function logFollowUp(
  quoteId: string,
  clientId: string | null,
  body: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    await logActivity(
      {
        kind: "call",
        body,
        client_id: clientId,
        quote_id: quoteId,
        due_at: new Date().toISOString(),
      },
      user?.id ?? null,
    );
    revalidateCrm("/", "/tasks", "/quotes");
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
    return error.message.replace(/^[^:]+:\s*/, "");
  }
  return "Something went wrong. Try again, or reload the page.";
}

export interface NewTaskInput {
  kind: ActivityKind;
  body: string;
  /** Local date string from the form, e.g. "2026-08-06". */
  dueAt: string;
  clientId: string | null;
}

export async function createTask(input: NewTaskInput): Promise<ActionResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write what the task is before saving it." };

  try {
    const user = await getCurrentUser();
    await logActivity(
      {
        kind: input.kind,
        body,
        client_id: input.clientId,
        // The form yields a date; anchor it to the end of that day so a task due
        // "today" does not read as overdue from the moment it is created.
        due_at: input.dueAt ? new Date(`${input.dueAt}T23:59:59`).toISOString() : null,
      },
      user?.id ?? null,
    );
    revalidateCrm("/tasks", "/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function completeTask(id: string): Promise<ActionResult> {
  try {
    await completeActivity(id);
    revalidateCrm("/tasks", "/", "/clients");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/**
 * Push a task out by whole days.
 *
 * Measured from the current due date, not from now: snoozing a task that was
 * already three days overdue by "one day" should make it due tomorrow relative
 * to when it was meant to happen, not silently forgive the three days.
 */
export async function snoozeTask(
  id: string,
  currentDueAt: string | null,
  days: number,
): Promise<ActionResult> {
  try {
    const base = currentDueAt ? new Date(currentDueAt) : new Date();
    const from = base.getTime() < Date.now() ? new Date() : base;
    await snoozeActivity(id, new Date(from.getTime() + days * DAY_MS).toISOString());
    revalidateCrm("/tasks", "/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function removeTask(id: string): Promise<ActionResult> {
  try {
    await deleteActivity(id);
    revalidateCrm("/tasks", "/", "/clients");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
