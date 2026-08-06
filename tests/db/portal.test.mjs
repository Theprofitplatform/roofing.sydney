import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, makeDraftQuote, asRole, rejects } from "./harness.mjs";

/**
 * The portal is the one surface a homeowner touches, and it has no session. All
 * three guarantees it makes — first-open tracking, server-side expiry, and an
 * acceptance that cannot be half-written — live in the database, so this is
 * where they are proved.
 */

/** An issued quote carrying one base line and two client-selectable extras. */
async function issueWithExtras(db, userId, { validDays = 30 } = {}) {
  const { quoteId, clientId } = await makeDraftQuote(db, userId, { valid_days: validDays });

  // Extras must be added before issue — after it the child immutability
  // trigger freezes them, which is the whole point of the frozen document.
  await db.query(
    `insert into public.quote_items (quote_id, kind, description, qty, unit, unit_cost_cents, is_optional, sort)
     values ($1,'material','Gutter guard — aluminium mesh',40,'m',2200,true,2),
            ($1,'material','Whirlybird vents',2,'ea',18500,true,3)`,
    [quoteId],
  );

  const { rows } = await db.query(
    "select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 85100, 102120]);

  const { rows: extras } = await db.query(
    "select id from public.quote_items where quote_id=$1 and is_optional order by sort", [quoteId]);

  return { quoteId, clientId, token: rows[0].portal_token, extraIds: extras.map((r) => r.id) };
}

describe("portal — first open", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("the first view stamps viewed_at and promotes sent → viewed", async () => {
    const { token } = await issueWithExtras(db, userId);
    const { rows } = await db.query(
      "select viewed_at, status from public.record_quote_view($1)", [token]);
    assert.ok(rows[0].viewed_at, "viewed_at must be stamped");
    assert.equal(rows[0].status, "viewed");
  });

  test("re-opening does NOT move viewed_at — the nudge clears once", async () => {
    const { token } = await issueWithExtras(db, userId);
    const first = await db.query("select viewed_at from public.record_quote_view($1)", [token]);
    const again = await db.query("select viewed_at from public.record_quote_view($1)", [token]);
    assert.deepEqual(again.rows[0].viewed_at, first.rows[0].viewed_at);
  });

  test("viewing an accepted quote leaves its status alone", async () => {
    const { token } = await issueWithExtras(db, userId);
    await db.query("select public.accept_quote($1,$2)", [token, "Margaret Chen"]);
    const { rows } = await db.query("select status from public.record_quote_view($1)", [token]);
    assert.equal(rows[0].status, "accepted");
  });

  test("an unknown token finds nothing", async () => {
    await rejects(() => db.query("select public.record_quote_view($1)", ["deadbeef"]), /not found/);
  });
});

describe("portal — decline", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("declining records the reason and the timestamp", async () => {
    const { quoteId, token } = await issueWithExtras(db, userId);
    await db.query("select public.decline_quote($1,$2)", [token, "Went with a cheaper mob"]);
    const { rows } = await db.query(
      "select status, declined_at, declined_reason from public.quotes where id=$1", [quoteId]);
    assert.equal(rows[0].status, "declined");
    assert.ok(rows[0].declined_at);
    assert.equal(rows[0].declined_reason, "Went with a cheaper mob");
  });

  test("a blank reason is stored as null, not as whitespace", async () => {
    const { quoteId, token } = await issueWithExtras(db, userId);
    await db.query("select public.decline_quote($1,$2)", [token, "   "]);
    const { rows } = await db.query("select declined_reason from public.quotes where id=$1", [quoteId]);
    assert.equal(rows[0].declined_reason, null);
  });

  test("an accepted quote cannot then be declined", async () => {
    const { token } = await issueWithExtras(db, userId);
    await db.query("select public.accept_quote($1,$2)", [token, "Margaret Chen"]);
    await rejects(() => db.query("select public.decline_quote($1)", [token]), /already accepted/);
  });

  test("a quote that was never issued cannot be declined", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("update public.quotes set portal_token='leaked-draft-token' where id=$1", [quoteId]);
    await rejects(
      () => db.query("select public.decline_quote($1)", ["leaked-draft-token"]),
      /has not been issued/);
  });
});

describe("portal — acceptance, tiers and extras", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("accept writes signature, status, tier and selections in one statement", async () => {
    const { quoteId, token, extraIds } = await issueWithExtras(db, userId);

    await db.query(
      `select public.accept_quote(
         p_portal_token => $1, p_signed_name => $2, p_signed_ip => $3,
         p_selected_item_ids => $4, p_selected_tier => $5, p_accepted_total_cents => $6)`,
      [token, "Margaret Chen", "203.0.113.9", extraIds, "better", 210800],
    );

    const { rows } = await db.query(
      `select status, accepted_at, signed_name, signed_at, signed_ip,
              selected_tier, total_cents::int t, accepted_total_cents::int a
       from public.quotes where id=$1`, [quoteId]);

    assert.equal(rows[0].status, "accepted");
    assert.equal(rows[0].signed_name, "Margaret Chen");
    assert.equal(rows[0].signed_ip, "203.0.113.9");
    assert.ok(rows[0].accepted_at && rows[0].signed_at, "both timestamps must be set");
    assert.equal(rows[0].selected_tier, "better");
    assert.equal(rows[0].t, 102120, "the issued total stays frozen at the base scope");
    assert.equal(rows[0].a, 210800, "the accepted total records what was actually agreed");

    const { rows: sel } = await db.query(
      "select quote_item_id from public.quote_selections where quote_id=$1 order by selected_at", [quoteId]);
    assert.deepEqual(sel.map((r) => r.quote_item_id).sort(), [...extraIds].sort());
  });

  test("accepting with no extras falls back to the issued total", async () => {
    const { quoteId, token } = await issueWithExtras(db, userId);
    await db.query("select public.accept_quote($1,$2)", [token, "Margaret Chen"]);
    const { rows } = await db.query(
      "select accepted_total_cents::int a, selected_tier from public.quotes where id=$1", [quoteId]);
    assert.equal(rows[0].a, 102120);
    assert.equal(rows[0].selected_tier, null);
    const { rows: n } = await db.query(
      "select count(*)::int n from public.quote_selections where quote_id=$1", [quoteId]);
    assert.equal(n[0].n, 0);
  });

  test("an expired quote cannot be accepted, and nothing is written", async () => {
    const { quoteId, token, extraIds } = await issueWithExtras(db, userId, { validDays: 14 });
    await db.query("update public.quotes set sent_at = now() - interval '20 days' where id=$1", [quoteId]);

    await rejects(
      () => db.query(
        "select public.accept_quote(p_portal_token=>$1, p_signed_name=>$2, p_selected_item_ids=>$3)",
        [token, "Too Late", extraIds]),
      /expired/);

    const { rows } = await db.query(
      "select status, signed_name from public.quotes where id=$1", [quoteId]);
    assert.notEqual(rows[0].status, "accepted");
    assert.equal(rows[0].signed_name, null, "a refused accept must leave no signature behind");

    const { rows: n } = await db.query(
      "select count(*)::int n from public.quote_selections where quote_id=$1", [quoteId]);
    assert.equal(n[0].n, 0, "a refused accept must leave no selections behind");
  });

  test("selecting a line that is not an optional extra is refused", async () => {
    const { quoteId, token } = await issueWithExtras(db, userId);
    const { rows: base } = await db.query(
      "select id from public.quote_items where quote_id=$1 and not is_optional", [quoteId]);

    await rejects(
      () => db.query(
        "select public.accept_quote(p_portal_token=>$1, p_signed_name=>$2, p_selected_item_ids=>$3)",
        [token, "Margaret Chen", [base[0].id]]),
      /not client-selectable extras/);
  });

  test("selecting another quote's extra is refused", async () => {
    const mine = await issueWithExtras(db, userId);
    const theirs = await issueWithExtras(db, userId);

    await rejects(
      () => db.query(
        "select public.accept_quote(p_portal_token=>$1, p_signed_name=>$2, p_selected_item_ids=>$3)",
        [mine.token, "Margaret Chen", [theirs.extraIds[0]]]),
      /not client-selectable extras/);
  });

  test("an unknown tier is refused", async () => {
    const { token } = await issueWithExtras(db, userId);
    await rejects(
      () => db.query(
        "select public.accept_quote(p_portal_token=>$1, p_signed_name=>$2, p_selected_tier=>$3)",
        [token, "Margaret Chen", "platinum"]),
      /unknown tier/);
  });

  test("a negative accepted total is refused — that figure bills the deposit", async () => {
    const { quoteId, token } = await issueWithExtras(db, userId);
    await rejects(
      () => db.query(
        "select public.accept_quote(p_portal_token=>$1, p_signed_name=>$2, p_accepted_total_cents=>$3)",
        [token, "Cheeky", -500000]),
      /accepted total cannot be negative/);

    const { rows } = await db.query("select status from public.quotes where id=$1", [quoteId]);
    assert.notEqual(rows[0].status, "accepted");

    // The column holds the line even if a future writer skips accept_quote.
    await rejects(
      () => db.query("update public.quotes set accepted_total_cents=-1 where id=$1", [quoteId]),
      /quotes_accepted_total_nonneg|check constraint/i);
  });

  test("a superseded quote cannot be signed from the stale first email", async () => {
    const { quoteId, token } = await issueWithExtras(db, userId);
    await db.query("select public.revise_quote($1)", [quoteId]);

    await rejects(
      () => db.query("select public.accept_quote($1,$2)", [token, "Margaret Chen"]),
      /no longer open for signature/);
    await rejects(
      () => db.query("select public.decline_quote($1)", [token]),
      /no longer open for signature/);

    // The point of the guard: no job may be opened against the withdrawn v1.
    const { rows } = await db.query("select status from public.quotes where id=$1", [quoteId]);
    assert.equal(rows[0].status, "superseded");
    await rejects(
      () => db.query("select public.create_job_from_quote($1)", [quoteId]),
      /cannot open a job/);
  });

  test("a quote retired as expired cannot be signed either", async () => {
    const { quoteId, token } = await issueWithExtras(db, userId);
    await db.query("update public.quotes set status='expired' where id=$1", [quoteId]);
    await rejects(
      () => db.query("select public.accept_quote($1,$2)", [token, "Too Late"]),
      /no longer open for signature/);
  });

  test("the pre-portal guards from 0003 survive the new signature", async () => {
    const { token } = await issueWithExtras(db, userId);
    await rejects(() => db.query("select public.accept_quote($1,$2)", [token, "  "]),
      /signature name is required/);
    await db.query("select public.accept_quote($1,$2)", [token, "Margaret Chen"]);
    await rejects(() => db.query("select public.accept_quote($1,$2)", [token, "Again"]), /already/);
  });
});

describe("portal — selections are staff-readable only", () => {
  let db, userId, quoteId, extraId;

  before(async () => {
    db = await freshDb();
    userId = await makeUser(db, { email: "owner@roofing.sydney", role: "owner" });
    const issued = await issueWithExtras(db, userId);
    quoteId = issued.quoteId;
    extraId = issued.extraIds[0];
    await db.query(
      "select public.accept_quote(p_portal_token=>$1, p_signed_name=>$2, p_selected_item_ids=>$3)",
      [issued.token, "Margaret Chen", issued.extraIds]);
  });
  after(async () => { await db?.close(); });

  test("staff read the client's choice", async () => {
    await asRole(db, "authenticated", userId, async () => {
      const { rows } = await db.query("select count(*)::int n from public.quote_selections");
      assert.equal(rows[0].n, 2);
    });
  });

  test("anon reads nothing", async () => {
    await asRole(db, "anon", null, async () => {
      const { rows } = await db.query("select count(*)::int n from public.quote_selections");
      assert.equal(rows[0].n, 0);
    });
  });

  // Real ids on purpose. With a bogus quote_item_id the insert fails on the
  // foreign key whether or not RLS is on, so the assertion would pass against a
  // table with no policies at all and prove nothing.
  test("anon cannot write a selection, even naming a real optional line", async () => {
    await asRole(db, "anon", null, async () => {
      await rejects(
        () => db.query(
          "insert into public.quote_selections (quote_id, quote_item_id) values ($1,$2)",
          [quoteId, extraId]),
        /row-level security|policy/i);
    });
  });

  test("not even an owner writes a selection through PostgREST", async () => {
    // accept_quote is the only writer, by design: a selection is the homeowner's
    // answer to the offer, so staff authoring one would forge the client's choice.
    await asRole(db, "authenticated", userId, async () => {
      await rejects(
        () => db.query(
          "insert into public.quote_selections (quote_id, quote_item_id) values ($1,$2)",
          [quoteId, extraId]),
        /row-level security|policy/i);
    });
  });
});
