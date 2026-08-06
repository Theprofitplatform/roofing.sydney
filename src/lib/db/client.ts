import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Which client to use, and why it matters.
 *
 * `db()` runs as the signed-in operator and is therefore subject to RLS. That is
 * the default and should stay the default: every CRM read and write goes through
 * it, so a policy mistake surfaces as a denied query rather than as silent
 * cross-tenant access.
 *
 * `admin()` bypasses RLS entirely. It exists for exactly two paths, both of
 * which have no Supabase session by design:
 *   - the public lead form writing into `leads`
 *   - the client quote portal, where a high-entropy token in the URL is the
 *     credential and the homeowner never gets an account
 * Reach for it anywhere else and you have removed the safety net.
 */
export const db = getSupabaseServer;
export const admin = getSupabaseAdmin;

/**
 * A database failure carrying the Postgres error code, so callers can tell an
 * expected business rejection (a trigger raising `check_violation`) apart from a
 * genuine fault. The screens surface `message`; nothing else parses strings.
 */
export class DbError extends Error {
  readonly code: string | null;
  readonly details: string | null;

  constructor(context: string, error: PostgrestError) {
    super(error.message);
    this.name = "DbError";
    this.code = error.code ?? null;
    this.details = error.details ?? null;
    this.cause = error;
    // Keeps the log line useful without leaking the message into the UI twice.
    this.message = `${context}: ${error.message}`;
  }
}

/** Postgres raises this for every guard the migrations enforce via triggers. */
const CHECK_VIOLATION = "23514";

/** True when the database rejected this on purpose — a rule, not a fault. */
export function isRuleViolation(error: unknown): boolean {
  return error instanceof DbError && error.code === CHECK_VIOLATION;
}

export interface Result<T> {
  data: T | null;
  error: PostgrestError | null;
}

/** Unwrap a Supabase result or throw. Use when absence is a fault. */
export function unwrap<T>(context: string, result: Result<T>): T {
  if (result.error) throw new DbError(context, result.error);
  if (result.data === null) {
    throw new Error(`${context}: query returned no rows`);
  }
  return result.data;
}

/**
 * Codes that mean "nothing matched", not "something broke".
 *
 * PGRST116 is `.single()` finding no row. 22P02 is Postgres refusing to parse
 * the value as a uuid — which is what a hand-edited or stale URL produces. Both
 * are the same answer to the caller: this record does not exist. Letting 22P02
 * through instead turned every detail route into a 500 for a typo in the address
 * bar, and a 500 tells a crawler to come back and try again.
 */
const NOT_FOUND_CODES = new Set(["PGRST116", "22P02"]);

/** Unwrap where a missing row is a legitimate answer (a lookup that missed). */
export function unwrapMaybe<T>(context: string, result: Result<T>): T | null {
  if (result.error) {
    if (NOT_FOUND_CODES.has(result.error.code ?? "")) return null;
    throw new DbError(context, result.error);
  }
  return result.data;
}

/** Unwrap a list, treating "no rows" as an empty list rather than an error. */
export function unwrapList<T>(context: string, result: Result<T[]>): T[] {
  if (result.error) throw new DbError(context, result.error);
  return result.data ?? [];
}
