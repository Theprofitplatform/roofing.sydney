"use server";

import { revalidateCrm } from "@/lib/revalidate";
import { DbError, isRuleViolation } from "@/lib/db/client";
import {
  createClient,
  deleteClient,
  updateClient,
  type ClientInput,
} from "@/lib/db/clients";
import {
  completeActivity,
  deleteActivity,
  logActivity,
  type ActivityInput,
} from "@/lib/db/pipeline";
import { listQuotesForClient } from "@/lib/db/quotes";
import { getCurrentUser } from "@/lib/supabase-server";
import type { Client } from "@/lib/db/types";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Paths carry the `/crm` prefix that links do not: middleware rewrites
 * app.roofing.sydney/clients onto /crm/clients, and the cache is keyed by the
 * route that actually rendered.
 */
const LIST_PATH = "/clients";
const detailPath = (id: string) => `${LIST_PATH}/${id}`;

/** Postgres foreign_key_violation — here, a quote still pointing at this client. */
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * What the operator is allowed to read. A trigger rejection is a sentence
 * written for them, so it passes through with only the internal call-site
 * prefix removed. Anything else is a fault, and a raw Postgres string in the UI
 * teaches nobody anything.
 */
function message(error: unknown): string {
  if (isRuleViolation(error)) {
    return (error as Error).message.replace(/^\w+[/\w]*:\s*/, "");
  }
  console.error(error);
  return "Something went wrong. Try again, or reload the page.";
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Normalises the form's blank strings to nulls before they reach the database. */
function toInput(form: ClientInput): ClientInput {
  return {
    name: form.name.trim(),
    phone: clean(form.phone),
    email: clean(form.email),
    property_address: clean(form.property_address),
    source: clean(form.source),
  };
}

export async function createClientAction(
  form: ClientInput,
): Promise<ActionResult<{ client: Client }>> {
  if (!form.name?.trim()) return { ok: false, error: "A client needs a name." };
  try {
    const user = await getCurrentUser();
    const client = await createClient(toInput(form), user?.id ?? null);
    revalidateCrm(LIST_PATH);
    return { ok: true, client };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function updateClientAction(
  id: string,
  form: ClientInput,
): Promise<ActionResult<{ client: Client }>> {
  if (!form.name?.trim()) return { ok: false, error: "A client needs a name." };
  try {
    const client = await updateClient(id, toInput(form));
    revalidateCrm(LIST_PATH);
    revalidateCrm(detailPath(id));
    return { ok: true, client };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Deleting a client whose quotes exist is refused by the database
 * (`on delete restrict`). A quote is a document that was sent to someone;
 * losing its recipient would leave an unattributable record. The count is read
 * first so the refusal names the reason instead of surfacing a constraint, and
 * the violation is still caught in case a quote is raised between the two.
 */
export async function deleteClientAction(id: string): Promise<ActionResult> {
  try {
    const quotes = await listQuotesForClient(id);
    if (quotes.length > 0) {
      const plural = quotes.length === 1 ? "quote" : "quotes";
      return {
        ok: false,
        error:
          `This client has ${quotes.length} ${plural} against their name, so they cannot ` +
          `be deleted — a quote has to keep the person it was sent to. Archive the work ` +
          `by marking the quotes declined or superseded instead.`,
      };
    }

    await deleteClient(id);
    revalidateCrm(LIST_PATH);
    return { ok: true };
  } catch (e) {
    if (e instanceof DbError && e.code === FOREIGN_KEY_VIOLATION) {
      return {
        ok: false,
        error: "A quote was raised for this client just now, so they can no longer be deleted.",
      };
    }
    return { ok: false, error: message(e) };
  }
}

// ── Activity log ───────────────────────────────────────────────────────────

export async function logActivityAction(input: ActivityInput): Promise<ActionResult> {
  if (!clean(input.body)) return { ok: false, error: "Write something to log." };
  try {
    const user = await getCurrentUser();
    await logActivity(
      {
        kind: input.kind,
        body: clean(input.body),
        client_id: input.client_id ?? null,
        opportunity_id: input.opportunity_id ?? null,
        quote_id: input.quote_id ?? null,
        due_at: input.due_at || null,
      },
      user?.id ?? null,
    );
    if (input.client_id) revalidateCrm(detailPath(input.client_id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function completeActivityAction(
  id: string,
  clientId: string,
): Promise<ActionResult> {
  try {
    await completeActivity(id);
    revalidateCrm(detailPath(clientId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deleteActivityAction(
  id: string,
  clientId: string,
): Promise<ActionResult> {
  try {
    await deleteActivity(id);
    revalidateCrm(detailPath(clientId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
