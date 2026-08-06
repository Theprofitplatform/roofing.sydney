import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, asRole, rejects } from "./harness.mjs";

/**
 * The public lead form has no session at all — it writes through the service
 * role. So the thing to prove is that intake works with auth.uid() resolving to
 * nothing, and that a double-submit or a retried request produces one client
 * and one pipeline card rather than two of each.
 */

const LEAD = {
  name: "Priya Sharma",
  phone: "0412 345 678",
  email: "priya.sharma@bigpond.com",
  address: "9 Sydenham Road, Marrickville NSW 2204",
};

async function makeLead(db, overrides = {}) {
  const l = { ...LEAD, ...overrides };
  const { rows } = await db.query(
    `insert into public.leads (name, phone, email, address, lat, lng, selected_colour_name, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [l.name, l.phone, l.email, l.address, l.lat ?? -33.911, l.lng ?? 151.155,
     l.selected_colour_name ?? null, l.source ?? "web"],
  );
  return rows[0].id;
}

describe("lead intake", () => {
  let db;
  before(async () => { db = await freshDb(); });
  after(async () => { await db?.close(); });

  test("a lead becomes a client and an enquiry-stage opportunity", async () => {
    const leadId = await makeLead(db, { selected_colour_name: "Colorbond Monument" });
    const { rows } = await db.query(
      "select id, client_id, stage_id, title from public.intake_lead($1)", [leadId]);

    assert.equal(rows[0].stage_id, "enquiry");
    assert.equal(rows[0].title, `Colorbond Monument — ${LEAD.address}`);

    const { rows: c } = await db.query(
      "select name, phone, email, property_address, lat, lng, source, lead_id, created_by from public.clients where id=$1",
      [rows[0].client_id]);
    assert.equal(c[0].name, LEAD.name);
    assert.equal(c[0].phone, LEAD.phone);
    assert.equal(c[0].email, LEAD.email);
    assert.equal(c[0].property_address, LEAD.address, "the address the homeowner typed is not re-keyed");
    assert.equal(c[0].lat, -33.911);
    assert.equal(c[0].source, "web");
    assert.equal(c[0].lead_id, leadId, "provenance back to the enquiry");
    assert.equal(c[0].created_by, null, "the enquiry was authored by the homeowner, not by staff");
  });

  test("with no colour chosen the card falls back to the address", async () => {
    const leadId = await makeLead(db, { address: "14 Wattle Street, Marrickville NSW 2204" });
    const { rows } = await db.query("select title from public.intake_lead($1)", [leadId]);
    assert.equal(rows[0].title, "14 Wattle Street, Marrickville NSW 2204");
  });

  test("calling it twice yields one client and one opportunity", async () => {
    const leadId = await makeLead(db);
    const first = await db.query("select id, client_id from public.intake_lead($1)", [leadId]);
    const again = await db.query("select id, client_id from public.intake_lead($1)", [leadId]);

    assert.equal(again.rows[0].id, first.rows[0].id);
    assert.equal(again.rows[0].client_id, first.rows[0].client_id);

    const { rows: c } = await db.query(
      "select count(*)::int n from public.clients where lead_id=$1", [leadId]);
    assert.equal(c[0].n, 1);

    const { rows: o } = await db.query(
      "select count(*)::int n from public.opportunities where client_id=$1", [first.rows[0].client_id]);
    assert.equal(o[0].n, 1);
  });

  test("a re-run returns the original card, not a later one the operator raised", async () => {
    const leadId = await makeLead(db);
    const first = await db.query("select id, client_id from public.intake_lead($1)", [leadId]);
    const { rows: second } = await db.query(
      "insert into public.opportunities (client_id, title) values ($1,'Gutter guard follow-up') returning id",
      [first.rows[0].client_id]);

    const again = await db.query("select id from public.intake_lead($1)", [leadId]);
    assert.equal(again.rows[0].id, first.rows[0].id);
    assert.notEqual(again.rows[0].id, second[0].id);
  });

  test("a second client cannot be forced onto the same lead", async () => {
    const leadId = await makeLead(db);
    await db.query("select public.intake_lead($1)", [leadId]);
    await rejects(
      () => db.query("insert into public.clients (name, lead_id) values ('Duplicate', $1)", [leadId]),
      /duplicate key|unique/i);
  });

  test("two clients with no lead at all are still fine", async () => {
    await db.query("insert into public.clients (name) values ('Walk-in One')");
    await db.query("insert into public.clients (name) values ('Walk-in Two')");
    const { rows } = await db.query(
      "select count(*)::int n from public.clients where lead_id is null");
    assert.ok(rows[0].n >= 2, "the partial index must not constrain manually created clients");
  });

  test("an unknown lead is refused", async () => {
    await rejects(
      () => db.query("select public.intake_lead($1)", ["00000000-0000-4000-8000-000000000000"]),
      /not found/);
  });
});

describe("lead intake runs without a session", () => {
  let db, ownerId;
  before(async () => {
    db = await freshDb();
    ownerId = await makeUser(db, { email: "owner@roofing.sydney", role: "owner" });
  });
  after(async () => { await db?.close(); });

  test("intake works with auth.uid() resolving to nothing", async () => {
    const leadId = await makeLead(db);
    const { rows: staff } = await db.query("select public.is_staff() s");
    assert.equal(staff[0].s, false, "there must be no session for this to prove anything");

    const { rows } = await db.query("select id, client_id from public.intake_lead($1)", [leadId]);
    assert.ok(rows[0].id);
  });

  test("the card the service role created is then visible to staff", async () => {
    const leadId = await makeLead(db, { address: "3 Illawarra Road, Marrickville NSW 2204" });
    await db.query("select public.intake_lead($1)", [leadId]);

    await asRole(db, "authenticated", ownerId, async () => {
      const { rows } = await db.query(
        "select count(*)::int n from public.opportunities where stage_id='enquiry'");
      assert.ok(rows[0].n >= 1, "the pipeline board must show it");
    });
  });

  test("anon still reads nothing", async () => {
    await asRole(db, "anon", null, async () => {
      for (const t of ["clients", "opportunities", "leads"]) {
        const { rows } = await db.query(`select count(*)::int n from public.${t}`);
        assert.equal(rows[0].n, 0, `anon could read ${t}`);
      }
    });
  });
});
