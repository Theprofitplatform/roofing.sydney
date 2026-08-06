import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, makeDraftQuote, rejects } from "./harness.mjs";

/**
 * Lock-on-issue is only defensible if revising is one action, so the revision
 * path gets the same scrutiny as the lock itself. The uplift and template
 * helpers are tested for the thing that actually costs money if it drifts:
 * rounding, and whether cost or marked-up price is what gets carried forward.
 */

/** An issued quote with a base line, an optional extra, a clause and a photo. */
async function issued(db, userId) {
  const { quoteId, clientId } = await makeDraftQuote(db, userId);

  await db.query(
    `insert into public.quote_items (quote_id, kind, description, qty, unit, unit_cost_cents, is_optional, tier, sort)
     values ($1,'labour','Removal & installation',14,'hr',9500,false,null,2),
            ($1,'material','Gutter guard — aluminium mesh',40,'m',2200,true,'better',3)`,
    [quoteId]);
  await db.query(
    `insert into public.quote_clauses (quote_id, kind, text, sort)
     values ($1,'exclusion','We are not responsible for electrical work.',1)`, [quoteId]);
  await db.query(
    `insert into public.quote_photos (quote_id, storage_path, caption, sort)
     values ($1,'quotes/before.jpg','Existing quad gutter',1)`, [quoteId]);

  const { rows } = await db.query(
    "select portal_token from public.issue_quote($1,$2,$3)", [quoteId, 85100, 102120]);

  return { quoteId, clientId, token: rows[0].portal_token };
}

describe("revisions", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("revising an issued quote yields a v2 draft and supersedes the parent", async () => {
    const { quoteId } = await issued(db, userId);
    const { rows } = await db.query(
      `select id, version, status, parent_quote_id, quote_number, sent_at,
              portal_token, total_cents, signed_name, margin_pct::float m, roof_type
       from public.revise_quote($1)`, [quoteId]);
    const child = rows[0];

    assert.equal(child.version, 2);
    assert.equal(child.status, "draft");
    assert.equal(child.parent_quote_id, quoteId);
    assert.equal(child.quote_number, null, "a revision draws its own number on issue");
    assert.equal(child.sent_at, null);
    assert.equal(child.portal_token, null);
    assert.equal(child.total_cents, null, "totals are recomputed, not inherited");
    assert.equal(child.signed_name, null);
    assert.equal(child.m, 20, "commercial settings carry over");
    assert.equal(child.roof_type, "Gutter & downpipe replacement");

    const { rows: parent } = await db.query("select status from public.quotes where id=$1", [quoteId]);
    assert.equal(parent[0].status, "superseded");
  });

  test("items, clauses and photos are deep copied, not shared", async () => {
    const { quoteId } = await issued(db, userId);
    const { rows } = await db.query("select id from public.revise_quote($1)", [quoteId]);
    const childId = rows[0].id;

    const counts = await db.query(
      `select (select count(*)::int from public.quote_items   where quote_id=$1) items,
              (select count(*)::int from public.quote_clauses where quote_id=$1) clauses,
              (select count(*)::int from public.quote_photos  where quote_id=$1) photos`, [childId]);
    assert.deepEqual(counts.rows[0], { items: 3, clauses: 1, photos: 1 });

    const { rows: extra } = await db.query(
      "select description, tier, is_optional from public.quote_items where quote_id=$1 and is_optional", [childId]);
    assert.equal(extra[0].tier, "better", "tiering survives the clone");

    // The copies are the child's own rows, so the draft is editable even though
    // the parent's identical lines are frozen.
    await db.query("update public.quote_items set qty=99 where quote_id=$1 and not is_optional", [childId]);
    const { rows: parentQty } = await db.query(
      "select qty::float q from public.quote_items where quote_id=$1 order by sort limit 1", [quoteId]);
    assert.equal(parentQty[0].q, 46, "the parent's frozen lines must not move");
  });

  test("revising a draft is refused — that is just editing it", async () => {
    const { quoteId } = await makeDraftQuote(db, userId);
    await rejects(() => db.query("select public.revise_quote($1)", [quoteId]), /has not been issued/);
  });

  test("a superseded quote cannot be revised twice", async () => {
    const { quoteId } = await issued(db, userId);
    await db.query("select public.revise_quote($1)", [quoteId]);
    await rejects(() => db.query("select public.revise_quote($1)", [quoteId]), /already been superseded/);
  });

  test("an accepted quote can still be revised, and the v2 chain continues", async () => {
    const { quoteId, token } = await issued(db, userId);
    await db.query("select public.accept_quote($1,$2)", [token, "Margaret Chen"]);

    const { rows: v2 } = await db.query("select id from public.revise_quote($1)", [quoteId]);
    await db.query("select public.issue_quote($1,$2,$3)", [v2[0].id, 90000, 108000]);
    const { rows: v3 } = await db.query("select version from public.revise_quote($1)", [v2[0].id]);
    assert.equal(v3[0].version, 3);
  });
});

describe("price book uplift", () => {
  let db;
  before(async () => { db = await freshDb(); });
  after(async () => { await db?.close(); });

  test("a category uplift rounds to whole cents and reports the row count", async () => {
    const { rows: n } = await db.query("select public.uplift_price_book($1,$2) n", ["Sheet roofing", 7]);
    assert.equal(n[0].n, 4);

    const { rows } = await db.query(
      "select description, unit_cost_cents::int c from public.price_book where category='Sheet roofing' order by description");
    const by = Object.fromEntries(rows.map((r) => [r.description, r.c]));
    assert.equal(by["Colorbond Trimdek sheets"], 4494);      // 4200 × 1.07
    assert.equal(by["Colorbond Klip-Lok 700"], 5778);        // 5400 × 1.07
    assert.equal(by["Anticon blanket insulation 60mm"], 1445); // 1350 × 1.07 = 1444.5, rounded up
    assert.equal(by["Steel top-hat battens"], 910);          // 850 × 1.07 = 909.5, rounded up
  });

  test("the uplift restamps cost_updated_at via the existing trigger", async () => {
    const { rows: before_ } = await db.query(
      "select cost_updated_at from public.price_book where description='Colorbond quad gutter'");
    await db.query("select public.uplift_price_book($1,$2)", ["Rainwater goods", 5]);
    const { rows: after_ } = await db.query(
      "select cost_updated_at from public.price_book where description='Colorbond quad gutter'");
    assert.notDeepEqual(after_[0].cost_updated_at, before_[0].cost_updated_at);
  });

  test("a null category lifts every live row, archived rows excepted", async () => {
    const { rows: arch } = await db.query(
      "update public.price_book set archived_at=now() where description='Cherry picker / EWP day hire' returning unit_cost_cents::int c");
    const { rows: n } = await db.query("select public.uplift_price_book(null,$1) n", [10]);
    assert.equal(n[0].n, 13, "the archived row must be left out");

    const { rows: still } = await db.query(
      "select unit_cost_cents::int c from public.price_book where description='Cherry picker / EWP day hire'");
    assert.equal(still[0].c, arch[0].c, "history must not be repriced");
  });

  test("a discount that would drive costs negative is refused", async () => {
    await rejects(() => db.query("select public.uplift_price_book(null,$1)", [-120]), /below zero/);
    await rejects(() => db.query("select public.uplift_price_book(null,null)"), /percentage is required/);
  });
});

describe("save a quote as a template", () => {
  let db, userId;
  before(async () => { db = await freshDb(); userId = await makeUser(db); });
  after(async () => { await db?.close(); });

  test("the template carries cost lines in sort order and the quote's settings", async () => {
    const { quoteId } = await issued(db, userId);
    const { rows } = await db.query(
      `select label, sub, icon, roof_type, valid_days, margin_pct::float m, show_breakdown, sort, line_items
       from public.save_quote_as_template($1,$2,$3,$4)`,
      [quoteId, "Marrickville gutter swap", "Quad gutter, downpipes & guard", "corner-down-right"]);
    const t = rows[0];

    assert.equal(t.label, "Marrickville gutter swap");
    assert.equal(t.icon, "corner-down-right");
    assert.equal(t.roof_type, "Gutter & downpipe replacement");
    assert.equal(t.valid_days, 30);
    assert.equal(t.m, 20);
    assert.equal(t.show_breakdown, true);
    assert.equal(t.sort, 4, "it lands after the three seeded templates");

    assert.equal(t.line_items.length, 3);
    assert.deepEqual(
      t.line_items.map((i) => i.description),
      ["Colorbond quad gutter", "Removal & installation", "Gutter guard — aluminium mesh"]);

    const first = t.line_items[0];
    assert.equal(first.kind, "material");
    assert.equal(first.unit, "m");
    assert.equal(Number(first.qty), 46);
    assert.equal(first.unit_cost_cents, 1850, "cost, never the marked-up price");
  });

  test("a quote with no lines still yields a usable template", async () => {
    const { rows: c } = await db.query(
      "insert into public.clients (name) values ('Empty Co') returning id");
    const { rows: q } = await db.query(
      "insert into public.quotes (client_id) values ($1) returning id", [c[0].id]);
    const { rows } = await db.query(
      "select line_items from public.save_quote_as_template($1,$2)", [q[0].id, "Blank start"]);
    assert.deepEqual(rows[0].line_items, []);
  });

  test("a blank label and an unknown quote are both refused", async () => {
    const { quoteId } = await issued(db, userId);
    await rejects(() => db.query("select public.save_quote_as_template($1,$2)", [quoteId, "  "]),
      /label is required/);
    await rejects(
      () => db.query("select public.save_quote_as_template($1,$2)",
        ["00000000-0000-4000-8000-000000000000", "Ghost"]),
      /not found/);
  });
});
