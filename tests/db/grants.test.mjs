import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, asRole, makeUser, as, makeDraftQuote, rejects } from "./harness.mjs";

/**
 * Function privileges (migration 0013).
 *
 * RLS decides which ROWS a caller sees. It says nothing about which FUNCTIONS a
 * caller may invoke, and PostgreSQL grants EXECUTE to PUBLIC by default. Supabase
 * publishes everything in `public` as `/rest/v1/rpc/<name>`, so without an
 * explicit revoke every SECURITY DEFINER function in this schema is a hole
 * punched straight through RLS, reachable by anyone holding the anon key.
 *
 * These tests are only meaningful because the harness does NOT re-grant EXECUTE
 * after running the migrations — see the note on SUPABASE_ROLES. If someone adds
 * a blanket `grant execute on all functions` back, every assertion below passes
 * vacuously while the exposure returns.
 */

const DENIED = /permission denied/i;

describe("function privileges", () => {
  let db;
  let ownerId;
  let quoteId;

  before(async () => {
    db = await freshDb();
    ownerId = await makeUser(db, { email: "john@roofing.sydney", role: "owner" });
    ({ quoteId } = await as(db, ownerId, () => makeDraftQuote(db, ownerId)));
  });

  after(async () => {
    await db?.close?.();
  });

  describe("the client portal is service-role only", () => {
    // The homeowner reaches these through our server, never directly. Each one
    // returns a whole `public.quotes` row — margin_pct and subtotal_cents
    // included — so an anon-callable version would hand the internal margin and
    // the cost basis to anyone with a portal link.
    for (const [name, call] of [
      ["record_quote_view", "select public.record_quote_view('deadbeef')"],
      ["decline_quote", "select public.decline_quote('deadbeef', 'too dear')"],
      [
        "accept_quote",
        "select public.accept_quote('deadbeef', 'M Chen', null, null, null, 1)",
      ],
      ["intake_lead", "select public.intake_lead('00000000-0000-0000-0000-000000000001')"],
    ]) {
      it(`anon cannot execute ${name}`, async () => {
        await asRole(db, "anon", null, () => rejects(() => db.query(call), DENIED));
      });

      it(`a signed-in operator cannot execute ${name} either`, async () => {
        // Not a downgrade of the operator — the app calls these through the
        // service role, so exposing them to the session role would only widen
        // the surface without enabling anything.
        await asRole(db, "authenticated", ownerId, () =>
          rejects(() => db.query(call), DENIED),
        );
      });
    }
  });

  describe("operator actions are closed to anon", () => {
    it("anon cannot issue a quote", async () => {
      // issue_quote is SECURITY DEFINER. Left open, anyone with the anon key and
      // a draft's uuid could draw a real quote number and freeze a total of zero.
      await asRole(db, "anon", null, () =>
        rejects(
          () => db.query("select public.issue_quote($1, 0, 0)", [quoteId]),
          DENIED,
        ),
      );
    });

    it("anon cannot supersede a live quote by revising it", async () => {
      await asRole(db, "anon", null, () =>
        rejects(() => db.query("select public.revise_quote($1)", [quoteId]), DENIED),
      );
    });

    it("anon cannot raise an invoice or book a payment", async () => {
      await asRole(db, "anon", null, async () => {
        await rejects(
          () => db.query("select public.raise_invoice('final', 100, null, null)"),
          DENIED,
        );
        await rejects(
          () =>
            db.query(
              "select public.record_payment('00000000-0000-0000-0000-000000000001', 100, 'cash')",
            ),
          DENIED,
        );
      });
    });

    it("anon cannot move the price book", async () => {
      await asRole(db, "anon", null, () =>
        rejects(() => db.query("select public.uplift_price_book(null, 500)"), DENIED),
      );
    });

    it("a signed-in operator CAN issue — the revoke closed anon, not the app", async () => {
      const issued = await asRole(db, "authenticated", ownerId, async () => {
        // `select (f(x)).*` would re-evaluate f once per output column — thirty
        // calls, and the second one raises "already issued". Call it in the FROM
        // clause so it runs exactly once. PostgREST does the same for `.rpc()`.
        const { rows } = await db.query(
          "select * from public.issue_quote($1, 85100, 85100)",
          [quoteId],
        );
        return rows[0];
      });
      assert.match(issued.quote_number, /^Q-\d{4}-\d{4}$/);
      assert.equal(issued.status, "sent");
    });
  });

  describe("policy helpers stay reachable", () => {
    // RLS policies call these, and a policy is evaluated as the querying role.
    // Revoking them would turn every denial into a permission error and take the
    // public lead form down with it.
    it("anon can still evaluate is_staff() and can_write()", async () => {
      await asRole(db, "anon", null, async () => {
        const { rows } = await db.query(
          "select public.is_staff() as staff, public.can_write() as write",
        );
        assert.equal(rows[0].staff, false);
        assert.equal(rows[0].write, false);
      });
    });

    it("anon reading a staff table is refused by RLS, not by a missing grant", async () => {
      // The distinction matters: a grant failure would mean the policies were
      // never actually exercised by any of the other RLS tests.
      await asRole(db, "anon", null, async () => {
        const { rows } = await db.query("select * from public.clients");
        assert.equal(rows.length, 0);
      });
    });
  });
});
