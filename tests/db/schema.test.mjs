import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, makeDraftQuote, rejects, as } from "./harness.mjs";

describe("migrations", () => {
  let db;
  before(async () => { db = await freshDb(); });
  after(async () => { await db?.close(); });

  test("every expected table exists", async () => {
    const { rows } = await db.query(
      "select table_name from information_schema.tables where table_schema='public' order by 1",
    );
    const names = rows.map((r) => r.table_name);
    for (const t of [
      "users", "leads", "clients", "pipeline_stages", "opportunities", "activities",
      "quotes", "quote_items", "quote_clauses", "quote_photos",
      "price_book", "snippets", "job_templates", "settings",
      "jobs", "variations", "invoices", "payments",
    ]) {
      assert.ok(names.includes(t), `missing table: ${t}`);
    }
  });

  test("RLS is enabled on every public table", async () => {
    const { rows } = await db.query(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
      "where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    );
    assert.deepEqual(rows.map((r) => r.relname), [], "tables without RLS");
  });

  test("migrations are idempotent — re-running changes nothing", async () => {
    const fresh = await freshDb();
    const before = await fresh.query("select count(*)::int n from public.price_book");
    // freshDb applies migrations once; apply the seed a second time.
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    await fresh.exec(await readFile(path.join(root, "supabase/seed.sql"), "utf8"));
    const after_ = await fresh.query("select count(*)::int n from public.price_book");
    assert.equal(after_.rows[0].n, before.rows[0].n);
    await fresh.close();
  });
});

describe("seed matches the prototype", () => {
  let db;
  before(async () => { db = await freshDb(); });
  after(async () => { await db?.close(); });

  test("price book has the 14 seeded items", async () => {
    const { rows } = await db.query("select count(*)::int n from public.price_book");
    assert.equal(rows[0].n, 14);
  });

  test("price book costs match data.js exactly", async () => {
    const { rows } = await db.query(
      "select description, unit, unit_cost_cents::int c from public.price_book order by description",
    );
    const byDesc = Object.fromEntries(rows.map((r) => [r.description, r]));
    assert.equal(byDesc["Colorbond Trimdek sheets"].c, 4200);
    assert.equal(byDesc["Colorbond Klip-Lok 700"].c, 5400);
    assert.equal(byDesc["Scaffold hire & erection"].c, 285000);
    assert.equal(byDesc["Cherry picker / EWP day hire"].c, 78000);
    assert.equal(byDesc["Cherry picker / EWP day hire"].unit, "day");
  });

  test("clause library has 11 snippets with the right defaults", async () => {
    const { rows } = await db.query(
      "select kind, is_default, count(*)::int n from public.snippets group by 1,2 order by 1,2",
    );
    const key = (k, d) => rows.find((r) => r.kind === k && r.is_default === d)?.n ?? 0;
    assert.equal(key("exclusion", true), 5);
    assert.equal(key("exclusion", false), 1);
    assert.equal(key("inclusion", true), 3);
    assert.equal(key("inclusion", false), 2);
  });

  test("job templates carry their line items", async () => {
    const { rows } = await db.query(
      "select label, jsonb_array_length(line_items)::int n from public.job_templates order by sort",
    );
    assert.deepEqual(rows, [
      { label: "Full re-roof", n: 8 },
      { label: "Gutter replacement", n: 4 },
      { label: "Leak repair", n: 4 },
    ]);
  });

  test("payment terms ship as an explicit placeholder", async () => {
    const { rows } = await db.query("select payment_terms from public.settings where id=1");
    assert.match(rows[0].payment_terms, /placeholder/i);
    assert.match(rows[0].payment_terms, /NSW Home Building Act/);
  });

  test("business is not GST registered by default", async () => {
    const { rows } = await db.query("select gst_registered from public.settings where id=1");
    assert.equal(rows[0].gst_registered, false);
  });
});

describe("quote numbering", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("a draft has no number", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    const { rows } = await db.query("select quote_number, status from public.quotes where id=$1", [quoteId]);
    assert.equal(rows[0].quote_number, null);
    assert.equal(rows[0].status, "draft");
  });

  test("issuing draws Q-YYYY-NNNN starting at 0008", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    const { rows } = await db.query("select quote_number from public.issue_quote($1, $2, $3)", [quoteId, 85100, 102120]);
    assert.match(rows[0].quote_number, /^Q-\d{4}-0008$/);
  });

  test("concurrent issues never collide", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await makeDraftQuote(db, userId)).quoteId);

    // Fire them together — the sequence, not the client, guarantees uniqueness.
    const results = await Promise.all(
      ids.map((id) => db.query("select quote_number from public.issue_quote($1,$2,$3)", [id, 1000, 1200])),
    );
    const numbers = results.map((r) => r.rows[0].quote_number);
    assert.equal(new Set(numbers).size, numbers.length, `collision: ${numbers.join(", ")}`);
  });

  test("issuing twice is refused", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("select public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    await rejects(
      () => db.query("select public.issue_quote($1,$2,$3)", [quoteId, 100, 110]),
      /already been issued/,
    );
  });

  test("issue freezes the totals", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("select public.issue_quote($1,$2,$3)", [quoteId, 85100, 102120]);
    const { rows } = await db.query(
      "select subtotal_cents::int s, total_cents::int t, sent_at, portal_token from public.quotes where id=$1",
      [quoteId],
    );
    assert.equal(rows[0].s, 85100);
    assert.equal(rows[0].t, 102120);
    assert.ok(rows[0].sent_at);
    assert.equal(rows[0].portal_token.length, 48, "portal token should be 24 random bytes hex");
  });
});

describe("immutability after issue", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("a draft is freely editable", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("update public.quotes set roof_type='Changed' where id=$1", [quoteId]);
    const { rows } = await db.query("select roof_type from public.quotes where id=$1", [quoteId]);
    assert.equal(rows[0].roof_type, "Changed");
  });

  test("editing commercial content on an issued quote throws", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("select public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    await rejects(
      () => db.query("update public.quotes set margin_pct=35 where id=$1", [quoteId]),
      /issued and immutable/,
    );
    await rejects(
      () => db.query("update public.quotes set roof_type='Sneaky edit' where id=$1", [quoteId]),
      /issued and immutable/,
    );
  });

  test("status and signature fields remain writable", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("select public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    await db.query("update public.quotes set viewed_at=now(), status='viewed' where id=$1", [quoteId]);
    const { rows } = await db.query("select status from public.quotes where id=$1", [quoteId]);
    assert.equal(rows[0].status, "viewed");
  });

  test("line items on an issued quote cannot be added, changed or removed", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await db.query("select public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    await rejects(
      () => db.query(
        "insert into public.quote_items (quote_id,kind,description,qty,unit,unit_cost_cents) values ($1,'labour','Extra',1,'hr',9500)",
        [quoteId]),
      /issued/);
    await rejects(
      () => db.query("update public.quote_items set qty=99 where quote_id=$1", [quoteId]),
      /issued/);
    await rejects(
      () => db.query("delete from public.quote_items where quote_id=$1", [quoteId]),
      /issued/);
  });
});

describe("acceptance", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  const issue = async (validDays = 30) => {
    const { quoteId } = await makeDraftQuote(db, userId, { valid_days: validDays });
    const { rows } = await db.query("select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    return { quoteId, token: rows[0].portal_token };
  };

  test("accept writes status and signature atomically", async () => {
    const { quoteId, token } = await issue();
    await db.query("select public.accept_quote($1,$2,$3)", [token, "Priya Sharma", "203.0.113.9"]);
    const { rows } = await db.query(
      "select status, accepted_at, signed_name, signed_at, signed_ip from public.quotes where id=$1",
      [quoteId]);
    assert.equal(rows[0].status, "accepted");
    assert.equal(rows[0].signed_name, "Priya Sharma");
    assert.ok(rows[0].accepted_at && rows[0].signed_at, "both timestamps must be set");
    assert.equal(rows[0].signed_ip, "203.0.113.9");
  });

  test("an expired quote cannot be accepted", async () => {
    const { quoteId, token } = await issue(14);
    // Backdate the issue beyond the validity window.
    await db.query("update public.quotes set sent_at = now() - interval '20 days' where id=$1", [quoteId]);
    await rejects(() => db.query("select public.accept_quote($1,$2)", [token, "Too Late"]), /expired/);
    const { rows } = await db.query("select status from public.quotes where id=$1", [quoteId]);
    assert.notEqual(rows[0].status, "accepted");
  });

  test("a blank signature is refused", async () => {
    const { token } = await issue();
    await rejects(() => db.query("select public.accept_quote($1,$2)", [token, "   "]), /signature name is required/);
  });

  test("accepting twice is refused", async () => {
    const { token } = await issue();
    await db.query("select public.accept_quote($1,$2)", [token, "Priya Sharma"]);
    await rejects(() => db.query("select public.accept_quote($1,$2)", [token, "Again"]), /already/);
  });

  test("an unknown token finds nothing", async () => {
    await rejects(() => db.query("select public.accept_quote($1,$2)", ["deadbeef", "Nobody"]), /not found/);
  });
});

describe("business rules", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("GST cannot be enabled while the business is not registered", async () => {
    const { clientId } = await makeDraftQuote(db, userId);
    await rejects(
      () => db.query("insert into public.quotes (client_id, gst_enabled) values ($1,true)", [clientId]),
      /not GST-registered/);
  });

  test("GST is allowed once registered", async () => {
    const { clientId } = await makeDraftQuote(db, userId);
    await db.query("update public.settings set gst_registered=true where id=1");
    await db.query("insert into public.quotes (client_id, gst_enabled) values ($1,true)", [clientId]);
    await db.query("update public.settings set gst_registered=false where id=1");
  });

  test("a lost opportunity requires a reason", async () => {
    const { clientId } = await makeDraftQuote(db, userId);
    const { rows } = await db.query(
      "insert into public.opportunities (client_id, title) values ($1,'Re-roof') returning id", [clientId]);
    await rejects(
      () => db.query("update public.opportunities set stage_id='lost' where id=$1", [rows[0].id]),
      /requires lost_reason/);
    await db.query(
      "update public.opportunities set stage_id='lost', lost_reason='price' where id=$1", [rows[0].id]);
  });

  test("a job can only be opened against an accepted quote", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await rejects(
      () => db.query("insert into public.jobs (quote_id) values ($1)", [quoteId]),
      /cannot open a job/);

    const { rows } = await db.query("select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    await db.query("select public.accept_quote($1,$2)", [rows[0].portal_token, "Client Name"]);
    await db.query("insert into public.jobs (quote_id) values ($1)", [quoteId]);
  });

  test("price book cost changes restamp cost_updated_at, description edits do not", async () => {
    const { rows } = await db.query(
      "select id, cost_updated_at from public.price_book where description='Colorbond Trimdek sheets'");
    const { id, cost_updated_at } = rows[0];

    await db.query("update public.price_book set description=description||' ' where id=$1", [id]);
    const same = await db.query("select cost_updated_at from public.price_book where id=$1", [id]);
    assert.deepEqual(same.rows[0].cost_updated_at, cost_updated_at, "description edit must not reset the clock");

    await db.query("update public.price_book set unit_cost_cents=4500 where id=$1", [id]);
    const moved = await db.query("select cost_updated_at from public.price_book where id=$1", [id]);
    assert.notDeepEqual(moved.rows[0].cost_updated_at, cost_updated_at, "cost change must restamp");
  });

  test("payments drive invoice status, including part payment", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    const { rows: t } = await db.query("select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 100000, 110000]);
    await db.query("select public.accept_quote($1,$2)", [t[0].portal_token, "Client Name"]);
    const { rows: j } = await db.query("insert into public.jobs (quote_id) values ($1) returning id", [quoteId]);
    const { rows: i } = await db.query(
      "insert into public.invoices (job_id, kind, total_cents, status) values ($1,'deposit',11000,'sent') returning id",
      [j[0].id]);
    const invoiceId = i[0].id;

    await db.query("insert into public.payments (invoice_id, amount_cents, method) values ($1,5000,'bank_transfer')", [invoiceId]);
    let s = await db.query("select status from public.invoices where id=$1", [invoiceId]);
    assert.equal(s.rows[0].status, "part_paid");

    await db.query("insert into public.payments (invoice_id, amount_cents, method) values ($1,6000,'stripe')", [invoiceId]);
    s = await db.query("select status, paid_at from public.invoices where id=$1", [invoiceId]);
    assert.equal(s.rows[0].status, "paid");
    assert.ok(s.rows[0].paid_at);
  });

  test("a duplicated Stripe webhook cannot book the same intent twice", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    const { rows: t } = await db.query("select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 100, 110]);
    await db.query("select public.accept_quote($1,$2)", [t[0].portal_token, "Client Name"]);
    const { rows: j } = await db.query("insert into public.jobs (quote_id) values ($1) returning id", [quoteId]);

    await db.query(
      "insert into public.invoices (job_id, kind, total_cents, stripe_payment_intent) values ($1,'deposit',1000,'pi_123')",
      [j[0].id]);
    await rejects(
      () => db.query(
        "insert into public.invoices (job_id, kind, total_cents, stripe_payment_intent) values ($1,'progress',1000,'pi_123')",
        [j[0].id]),
      /duplicate key|unique/i);
  });
});

describe("identity", () => {
  let db;
  before(async () => { db = await freshDb(); });
  after(async () => { await db?.close(); });

  test("a new auth user is provisioned into public.users as owner", async () => {
    await db.query("insert into auth.users (email) values ('john@roofing.sydney')");
    const { rows } = await db.query("select email, role from public.users where email='john@roofing.sydney'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, "owner");
  });

  test("is_staff reflects the signed-in user", async () => {
    const id = await makeUser(db, { email: "estimator@roofing.sydney", role: "estimator" });
    await as(db, id, async () => {
      const { rows } = await db.query("select public.is_staff() s, public.can_write() w");
      assert.equal(rows[0].s, true);
      assert.equal(rows[0].w, true);
    });
    const readonly = await makeUser(db, { email: "ro@roofing.sydney", role: "readonly" });
    await as(db, readonly, async () => {
      const { rows } = await db.query("select public.is_staff() s, public.can_write() w");
      assert.equal(rows[0].s, true);
      assert.equal(rows[0].w, false, "readonly must not be able to write");
    });
  });

  test("with no session, is_staff is false — policies fail closed", async () => {
    const { rows } = await db.query("select public.is_staff() s, public.can_write() w");
    assert.equal(rows[0].s, false);
    assert.equal(rows[0].w, false);
  });
});
