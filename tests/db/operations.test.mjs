import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, makeDraftQuote, asRole, rejects } from "./harness.mjs";

/**
 * Accepting a quote must create a job with no manual re-entry, and it must do
 * so exactly once no matter how many times the accept path fires. The rest is
 * the workflow the seeded exclusions already promise in writing: latent
 * conditions get quoted as a variation.
 */

/** An accepted quote against a real opportunity, ready to become a job. */
async function accepted(db, userId) {
  const { quoteId, clientId } = await makeDraftQuote(db, userId);

  const { rows: o } = await db.query(
    "insert into public.opportunities (client_id, title, created_by) values ($1,'Re-roof',$2) returning id",
    [clientId, userId]);
  await db.query("update public.quotes set opportunity_id=$1 where id=$2", [o[0].id, quoteId]);

  const { rows } = await db.query(
    "select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 85100, 102120]);
  await db.query("select public.accept_quote($1,$2)", [rows[0].portal_token, "Margaret Chen"]);

  return { quoteId, clientId, opportunityId: o[0].id };
}

describe("jobs from accepted quotes", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("an accepted quote becomes a scheduled job", async () => {
    const { quoteId } = await accepted(db, userId);
    const { rows } = await db.query(
      "select id, quote_id, status, scheduled_start, scheduled_end from public.create_job_from_quote($1,$2,$3)",
      [quoteId, "2026-09-14", "2026-09-18"]);
    assert.equal(rows[0].quote_id, quoteId);
    assert.equal(rows[0].status, "scheduled");
    assert.ok(rows[0].scheduled_start && rows[0].scheduled_end);
  });

  test("calling it twice returns the same job untouched", async () => {
    const { quoteId } = await accepted(db, userId);
    const first = await db.query(
      "select id, scheduled_start from public.create_job_from_quote($1,$2)", [quoteId, "2026-09-14"]);
    const again = await db.query(
      "select id, scheduled_start from public.create_job_from_quote($1,$2)", [quoteId, "2027-01-01"]);

    assert.equal(again.rows[0].id, first.rows[0].id);
    assert.deepEqual(again.rows[0].scheduled_start, first.rows[0].scheduled_start,
      "a retry must not silently reschedule the crew");

    const { rows } = await db.query("select count(*)::int n from public.jobs where quote_id=$1", [quoteId]);
    assert.equal(rows[0].n, 1);
  });

  test("a second job cannot be forced against the same quote", async () => {
    const { quoteId } = await accepted(db, userId);
    await db.query("select public.create_job_from_quote($1)", [quoteId]);
    await rejects(
      () => db.query("insert into public.jobs (quote_id) values ($1)", [quoteId]),
      /duplicate key|unique/i);
  });

  test("a quote that was never accepted cannot open a job", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await rejects(() => db.query("select public.create_job_from_quote($1)", [quoteId]), /cannot open a job/);
  });
});

describe("job completion", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  const openJob = async () => {
    const { quoteId } = await accepted(db, userId);
    const { rows } = await db.query("select id from public.create_job_from_quote($1)", [quoteId]);
    return rows[0].id;
  };

  test("completing signs the job off with crew notes", async () => {
    const jobId = await openJob();
    const { rows } = await db.query(
      "select status, completed_at, crew_notes from public.complete_job($1,$2)",
      [jobId, "Ridge re-bedded, downpipes reconnected."]);
    assert.equal(rows[0].status, "complete");
    assert.ok(rows[0].completed_at);
    assert.equal(rows[0].crew_notes, "Ridge re-bedded, downpipes reconnected.");
  });

  test("appending notes later does not move the sign-off date", async () => {
    const jobId = await openJob();
    const first = await db.query("select completed_at from public.complete_job($1,$2)", [jobId, "Done"]);
    const again = await db.query("select completed_at, crew_notes from public.complete_job($1,$2)", [jobId, "Gutter guard fitted too"]);
    assert.deepEqual(again.rows[0].completed_at, first.rows[0].completed_at);
    assert.equal(again.rows[0].crew_notes, "Gutter guard fitted too");
  });

  test("a cancelled job cannot be signed off", async () => {
    const jobId = await openJob();
    await db.query("update public.jobs set status='cancelled' where id=$1", [jobId]);
    await rejects(() => db.query("select public.complete_job($1)", [jobId]), /cancelled/);
  });

  test("an unknown job is refused", async () => {
    await rejects(
      () => db.query("select public.complete_job($1)", ["00000000-0000-4000-8000-000000000000"]),
      /not found/);
  });
});

describe("job attachments", () => {
  let db, userId, jobId;
  before(async () => {
    db = await freshDb();
    userId = await makeUser(db, { email: "owner@roofing.sydney", role: "owner" });
    const { quoteId } = await accepted(db, userId);
    const { rows } = await db.query("select id from public.create_job_from_quote($1)", [quoteId]);
    jobId = rows[0].id;
  });
  after(async () => { await db?.close(); });

  test("the non-photo record types are accepted", async () => {
    for (const kind of ["engineer_report", "colour_sheet", "warranty", "photo", "other"]) {
      await db.query(
        "insert into public.job_attachments (job_id, storage_path, filename, kind, created_by) values ($1,$2,$3,$4,$5)",
        [jobId, `jobs/${jobId}/${kind}.pdf`, `${kind}.pdf`, kind, userId]);
    }
    const { rows } = await db.query("select count(*)::int n from public.job_attachments where job_id=$1", [jobId]);
    assert.equal(rows[0].n, 5);
  });

  test("an unknown kind is refused", async () => {
    await rejects(
      () => db.query(
        "insert into public.job_attachments (job_id, storage_path, kind) values ($1,'x.pdf','invoice')",
        [jobId]),
      /check constraint|violates/i);
  });

  test("deleting the job takes its attachments with it", async () => {
    const { quoteId } = await accepted(db, userId);
    const { rows: j } = await db.query("select id from public.create_job_from_quote($1)", [quoteId]);
    await db.query(
      "insert into public.job_attachments (job_id, storage_path) values ($1,'jobs/tmp.pdf')", [j[0].id]);
    await db.query("delete from public.jobs where id=$1", [j[0].id]);
    const { rows } = await db.query("select count(*)::int n from public.job_attachments where job_id=$1", [j[0].id]);
    assert.equal(rows[0].n, 0);
  });

  test("anon reads no attachments", async () => {
    await asRole(db, "anon", null, async () => {
      const { rows } = await db.query("select count(*)::int n from public.job_attachments");
      assert.equal(rows[0].n, 0);
    });
  });
});

describe("variations", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("a variation is a draft quote on the same client and opportunity, linked to the job", async () => {
    const { quoteId, clientId, opportunityId } = await accepted(db, userId);
    const { rows: j } = await db.query("select id from public.create_job_from_quote($1)", [quoteId]);

    const { rows } = await db.query(
      "select id, status, client_id, opportunity_id, parent_quote_id, notes, margin_pct::float m from public.raise_variation($1,$2)",
      [j[0].id, "Rotten battens found under the old sheets"]);
    const v = rows[0];

    assert.equal(v.status, "draft");
    assert.equal(v.client_id, clientId);
    assert.equal(v.opportunity_id, opportunityId);
    assert.equal(v.parent_quote_id, null, "a variation adds to the job, it does not supersede the quote");
    assert.equal(v.notes, "Rotten battens found under the old sheets");
    assert.equal(v.m, 20, "the original's commercial settings carry over");

    const { rows: link } = await db.query(
      "select job_id, quote_id, reason from public.variations where job_id=$1", [j[0].id]);
    assert.equal(link.length, 1);
    assert.equal(link[0].quote_id, v.id);
    assert.equal(link[0].reason, "Rotten battens found under the old sheets");

    // The original quote is untouched — the variation is additive.
    const { rows: orig } = await db.query("select status from public.quotes where id=$1", [quoteId]);
    assert.equal(orig[0].status, "accepted");
  });

  test("a second variation on the same job is fine", async () => {
    const { quoteId } = await accepted(db, userId);
    const { rows: j } = await db.query("select id from public.create_job_from_quote($1)", [quoteId]);
    await db.query("select public.raise_variation($1,$2)", [j[0].id, "Asbestos identified"]);
    await db.query("select public.raise_variation($1,$2)", [j[0].id, "Extra downpipe"]);
    const { rows } = await db.query("select count(*)::int n from public.variations where job_id=$1", [j[0].id]);
    assert.equal(rows[0].n, 2);
  });

  test("a variation with no reason is refused — that is the whole audit trail", async () => {
    const { quoteId } = await accepted(db, userId);
    const { rows: j } = await db.query("select id from public.create_job_from_quote($1)", [quoteId]);
    await rejects(() => db.query("select public.raise_variation($1,$2)", [j[0].id, "   "]), /requires a reason/);
    const { rows } = await db.query("select count(*)::int n from public.variations where job_id=$1", [j[0].id]);
    assert.equal(rows[0].n, 0);
  });

  test("an unknown job is refused", async () => {
    await rejects(
      () => db.query("select public.raise_variation($1,$2)",
        ["00000000-0000-4000-8000-000000000000", "Anything"]),
      /not found/);
  });
});
