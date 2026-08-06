import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, makeDraftQuote, rejects } from "./harness.mjs";

/**
 * Phase 8. Two failures here are silent and expensive: a deposit raised twice
 * against one signature, and a retried Stripe webhook booking one payment
 * twice. Both are held by an index rather than by application discipline,
 * because the webhook is not the only thing that can retry.
 */

/** An accepted quote and its job, with the accepted total set. */
async function acceptedJob(db, userId, { total = 102120, acceptedTotal = null } = {}) {
  const { quoteId } = await makeDraftQuote(db, userId);
  const { rows: t } = await db.query(
    "select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 85100, total]);
  await db.query(
    "select public.accept_quote(p_portal_token=>$1, p_signed_name=>$2, p_accepted_total_cents=>$3)",
    [t[0].portal_token, "Margaret Chen", acceptedTotal]);
  const { rows: j } = await db.query("select id from public.create_job_from_quote($1)", [quoteId]);
  return { quoteId, jobId: j[0].id };
}

describe("invoice numbering", () => {
  let db;
  before(async () => { db = await freshDb(); });
  after(async () => { await db?.close(); });

  test("numbers are INV-YYYY-NNNN and never reused", async () => {
    const { rows } = await db.query("select public.next_invoice_number() n");
    assert.match(rows[0].n, /^INV-\d{4}-0001$/);

    const drawn = [];
    for (let i = 0; i < 5; i++) {
      const { rows: r } = await db.query("select public.next_invoice_number() n");
      drawn.push(r[0].n);
    }
    assert.equal(new Set(drawn).size, drawn.length, `collision: ${drawn.join(", ")}`);
  });
});

describe("raising an invoice", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("an invoice opens at sent with a number and a timestamp", async () => {
    const { jobId } = await acceptedJob(db, userId);
    const { rows } = await db.query(
      "select invoice_number, kind, status, total_cents::int c, sent_at, due_at, job_id from public.raise_invoice($1,$2,null,$3,$4)",
      ["progress", 5000000, jobId, "2026-10-01"]);
    assert.match(rows[0].invoice_number, /^INV-\d{4}-\d{4}$/);
    assert.equal(rows[0].kind, "progress");
    assert.equal(rows[0].status, "sent");
    assert.equal(rows[0].c, 5000000);
    assert.equal(rows[0].job_id, jobId);
    assert.ok(rows[0].sent_at && rows[0].due_at);
  });

  test("an invoice attached to neither a quote nor a job is refused in plain words", async () => {
    await rejects(
      () => db.query("select public.raise_invoice($1,$2)", ["final", 1000]),
      /must be attached to a quote or a job/);
  });

  test("a negative total is refused", async () => {
    const { jobId } = await acceptedJob(db, userId);
    await rejects(
      () => db.query("select public.raise_invoice($1,$2,null,$3)", ["final", -1, jobId]),
      /zero or more cents/);
  });
});

describe("deposit invoices", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  const depositsOn = (pct) =>
    db.query("update public.settings set deposit_enabled=true, deposit_pct=$1 where id=1", [pct]);

  test("deposits off yields null, not an error — the accept path calls this blind", async () => {
    await db.query("update public.settings set deposit_enabled=false where id=1");
    const { quoteId } = await acceptedJob(db, userId);
    const { rows } = await db.query("select public.raise_deposit_invoice($1) inv", [quoteId]);
    assert.equal(rows[0].inv, null);
  });

  test("the deposit follows what the client actually accepted, not the issued total", async () => {
    await depositsOn(15);
    // Issued at the base scope; accepted higher once an extra was selected.
    const { quoteId } = await acceptedJob(db, userId, { total: 102120, acceptedTotal: 210800 });
    const { rows } = await db.query(
      "select kind, quote_id, total_cents::int c, status from public.raise_deposit_invoice($1)", [quoteId]);
    assert.equal(rows[0].kind, "deposit");
    assert.equal(rows[0].quote_id, quoteId);
    assert.equal(rows[0].c, 31620, "15% of the accepted 210800, rounded to whole cents");
    assert.equal(rows[0].status, "sent");
  });

  test("accepting twice cannot raise two deposit invoices", async () => {
    await depositsOn(10);
    const { quoteId } = await acceptedJob(db, userId, { total: 110000 });

    const first = await db.query("select id from public.raise_deposit_invoice($1)", [quoteId]);
    const again = await db.query("select id from public.raise_deposit_invoice($1)", [quoteId]);
    assert.equal(again.rows[0].id, first.rows[0].id, "the second call must be a no-op");

    const { rows } = await db.query(
      "select count(*)::int n from public.invoices where quote_id=$1 and kind='deposit'", [quoteId]);
    assert.equal(rows[0].n, 1);

    // The pre-check is a convenience; the index is the guarantee.
    await rejects(
      () => db.query(
        "insert into public.invoices (quote_id, kind, total_cents) values ($1,'deposit',1)", [quoteId]),
      /duplicate key|unique/i);
  });

  test("a quote that has not been accepted has no deposit due", async () => {
    await depositsOn(10);
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("select public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    await rejects(
      () => db.query("select public.raise_deposit_invoice($1)", [quoteId]),
      /only due on acceptance/);
  });

  test("deposits against a job with no quote are unaffected by the index", async () => {
    await depositsOn(10);
    const a = await acceptedJob(db, userId);
    const b = await acceptedJob(db, userId);
    await db.query("select public.raise_invoice($1,$2,null,$3)", ["deposit", 1000, a.jobId]);
    await db.query("select public.raise_invoice($1,$2,null,$3)", ["deposit", 1000, b.jobId]);
    const { rows } = await db.query(
      "select count(*)::int n from public.invoices where quote_id is null and kind='deposit'");
    assert.equal(rows[0].n, 2);
  });
});

describe("recording payments", () => {
  let db, userId, invoiceId;
  before(async () => {
    db = await freshDb();
    userId = await makeUser(db);
    const { jobId } = await acceptedJob(db, userId);
    const { rows } = await db.query(
      "select id from public.raise_invoice($1,$2,null,$3)", ["final", 110000, jobId]);
    invoiceId = rows[0].id;
  });
  after(async () => { await db?.close(); });

  test("a part payment moves the invoice to part_paid, the balance to paid", async () => {
    await db.query("select public.record_payment($1,$2,$3)", [invoiceId, 50000, "bank_transfer"]);
    let s = await db.query("select status, paid_at from public.invoices where id=$1", [invoiceId]);
    assert.equal(s.rows[0].status, "part_paid");
    assert.equal(s.rows[0].paid_at, null);

    await db.query("select public.record_payment($1,$2,$3,$4)", [invoiceId, 60000, "stripe", "pi_3Qx7abc"]);
    s = await db.query("select status, paid_at from public.invoices where id=$1", [invoiceId]);
    assert.equal(s.rows[0].status, "paid");
    assert.ok(s.rows[0].paid_at);
  });

  test("a retried Stripe delivery cannot book the same payment twice", async () => {
    await rejects(
      () => db.query("select public.record_payment($1,$2,$3,$4)", [invoiceId, 60000, "stripe", "pi_3Qx7abc"]),
      /duplicate key|unique/i);

    const { rows } = await db.query(
      "select sum(amount_cents)::int paid from public.payments where invoice_id=$1", [invoiceId]);
    assert.equal(rows[0].paid, 110000, "the invoice must not be overpaid by a retry");
  });

  test("a blank reference is stored as null, so manual receipts do not collide", async () => {
    const { jobId } = await acceptedJob(db, userId);
    const { rows: inv } = await db.query(
      "select id from public.raise_invoice($1,$2,null,$3)", ["final", 20000, jobId]);

    const a = await db.query("select reference from public.record_payment($1,$2,$3,$4)", [inv[0].id, 5000, "cash", "  "]);
    assert.equal(a.rows[0].reference, null);
    await db.query("select public.record_payment($1,$2,$3)", [inv[0].id, 5000, "cash"]);

    const { rows } = await db.query(
      "select count(*)::int n from public.payments where invoice_id=$1", [inv[0].id]);
    assert.equal(rows[0].n, 2);
  });

  test("a payment against an unknown invoice is refused", async () => {
    await rejects(
      () => db.query("select public.record_payment($1,$2,$3)",
        ["00000000-0000-4000-8000-000000000000", 100, "cash"]),
      /foreign key|violates/i);
  });
});
