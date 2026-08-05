import "server-only";
import { db, unwrap, unwrapMaybe, unwrapList, DbError } from "./client";
import type { Client } from "./types";

export interface ClientInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  property_address?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
}

export async function listClients(): Promise<Client[]> {
  const supabase = await db();
  return unwrapList<Client>(
    "listClients",
    await supabase.from("clients").select("*").order("name", { ascending: true }),
  );
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await db();
  return unwrapMaybe<Client>(
    "getClient",
    await supabase.from("clients").select("*").eq("id", id).single(),
  );
}

export async function createClient(
  input: ClientInput,
  createdBy?: string | null,
): Promise<Client> {
  const supabase = await db();
  return unwrap<Client>(
    "createClient",
    await supabase
      .from("clients")
      .insert({ ...input, created_by: createdBy ?? null })
      .select("*")
      .single(),
  );
}

export async function updateClient(id: string, patch: Partial<ClientInput>): Promise<Client> {
  const supabase = await db();
  return unwrap<Client>(
    "updateClient",
    await supabase.from("clients").update(patch).eq("id", id).select("*").single(),
  );
}

/**
 * Deleting a client cascades to their opportunities and activities, but quotes
 * hold `on delete restrict` — a quote is a document that was sent to someone, and
 * losing its recipient would leave an unattributable record. Callers surface the
 * rejection rather than offering a force.
 */
export async function deleteClient(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw new DbError("deleteClient", error);
}
