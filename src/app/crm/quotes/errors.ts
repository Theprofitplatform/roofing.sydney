import "server-only";

import { DbError, isRuleViolation } from "@/lib/db/client";

/**
 * Turning a thrown error into something an operator can act on.
 *
 * The database enforces the rules that matter — immutability after issue, the
 * numbering guarantee, expiry on accept — by raising exceptions whose messages
 * were written to be read ("quote Q-2026-0008 is issued and immutable; raise a
 * revision instead"). Those go through verbatim. Anything else is a fault, not a
 * rule: it is logged and the operator gets a plain sentence instead of a
 * Postgres string that tells them nothing and leaks schema detail.
 */

/** `DbError` prefixes the calling context for the log; the operator only needs the sentence. */
const stripContext = (message: string): string =>
  message.replace(/^[A-Za-z][A-Za-z]*(?:\/[A-Za-z]+)?:\s*/, "");

export function message(error: unknown, fallback: string): string {
  if (error instanceof DbError) {
    if (isRuleViolation(error)) return stripContext(error.message);
    console.error(error);
    return fallback;
  }
  if (error instanceof Error) {
    console.error(error);
    return error.message;
  }
  console.error(error);
  return fallback;
}

/**
 * Every server action answers the same shape, so a caller can branch on `ok`
 * without ever having to catch. `T` carries whatever the success case returns.
 */
export type ActionResult<T = unknown> =
  | ({ ok: true } & (T extends object ? T : object))
  | { ok: false; error: string };
