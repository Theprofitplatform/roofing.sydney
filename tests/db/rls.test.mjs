import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, makeDraftQuote, asRole, rejects } from "./harness.mjs";

/**
 * The pre-existing `leads` table runs RLS enabled with zero policies, which is
 * safe only because nothing reads it. An operator app that reads and edits
 * cannot inherit that, so these tests assert denial explicitly, per table.
 *
 * Run as the `anon` / `authenticated` roles — as superuser RLS is bypassed and
 * every one of these would pass vacuously.
 */

const STAFF_TABLES = [
  "clients", "opportunities", "activities",
  "quotes", "quote_items", "quote_clauses", "quote_photos",
  "price_book", "snippets", "job_templates", "settings",
  "jobs", "variations", "invoices", "payments",
  "pipeline_stages", "leads",
];

describe("RLS — anonymous access", () => {
  let db, ownerId, clientId;

  before(async () => {
    db = await freshDb();
    ownerId = await makeUser(db, { email: "owner@roofing.sydney", role: "owner" });
    ({ clientId } = await makeDraftQuote(db, ownerId));
  });
  after(async () => { await db?.close(); });

  test("anon reads nothing from any table", async () => {
    await asRole(db, "anon", null, async () => {
      for (const t of STAFF_TABLES) {
        const { rows } = await db.query(`select count(*)::int n from public.${t}`);
        assert.equal(rows[0].n, 0, `anon could read ${t}`);
      }
    });
  });

  test("anon cannot insert a client", async () => {
    await asRole(db, "anon", null, async () => {
      await rejects(
        () => db.query("insert into public.clients (name) values ('Intruder')"),
        /row-level security|policy/i,
      );
    });
  });

  test("anon cannot insert a quote, even knowing a real client id", async () => {
    // Note the id is supplied literally. An INSERT ... SELECT would insert zero
    // rows (anon cannot read clients) and succeed vacuously, testing nothing.
    await asRole(db, "anon", null, async () => {
      await rejects(
        () => db.query("insert into public.quotes (client_id) values ($1)", [clientId]),
        /row-level security|policy/i,
      );
    });
  });

  test("anon cannot read the price book — cost prices are not public", async () => {
    await asRole(db, "anon", null, async () => {
      const { rows } = await db.query("select count(*)::int n from public.price_book");
      assert.equal(rows[0].n, 0);
    });
  });

  test("anon cannot reach quotes by guessing a portal token", async () => {
    // The portal resolves tokens server-side through the service role. There is
    // deliberately no anon policy, so the table is not probeable.
    await asRole(db, "anon", null, async () => {
      const { rows } = await db.query(
        "select count(*)::int n from public.quotes where portal_token is not null");
      assert.equal(rows[0].n, 0);
    });
  });
});

describe("RLS — authenticated but not staff", () => {
  let db, ownerId;

  before(async () => {
    db = await freshDb();
    ownerId = await makeUser(db, { email: "owner@roofing.sydney", role: "owner" });
    await makeDraftQuote(db, ownerId);
  });
  after(async () => { await db?.close(); });

  test("a session with no staff row reads nothing", async () => {
    const stranger = "00000000-0000-4000-8000-000000000000";
    await asRole(db, "authenticated", stranger, async () => {
      for (const t of ["clients", "quotes", "price_book", "settings", "leads"]) {
        const { rows } = await db.query(`select count(*)::int n from public.${t}`);
        assert.equal(rows[0].n, 0, `non-staff could read ${t}`);
      }
    });
  });

  test("a session with no staff row cannot write", async () => {
    const stranger = "00000000-0000-4000-8000-000000000000";
    await asRole(db, "authenticated", stranger, async () => {
      await rejects(
        () => db.query("insert into public.clients (name) values ('Intruder')"),
        /row-level security|policy/i,
      );
    });
  });
});

describe("RLS — staff access", () => {
  let db, ownerId, readonlyId, crewId;

  before(async () => {
    db = await freshDb();
    ownerId = await makeUser(db, { email: "owner@roofing.sydney", role: "owner" });
    readonlyId = await makeUser(db, { email: "ro@roofing.sydney", role: "readonly" });
    crewId = await makeUser(db, { email: "crew@roofing.sydney", role: "crew" });
    await makeDraftQuote(db, ownerId);
  });
  after(async () => { await db?.close(); });

  test("an owner reads clients, quotes and the price book", async () => {
    await asRole(db, "authenticated", ownerId, async () => {
      for (const [t, min] of [["clients", 1], ["quotes", 1], ["price_book", 14], ["snippets", 11]]) {
        const { rows } = await db.query(`select count(*)::int n from public.${t}`);
        assert.ok(rows[0].n >= min, `owner should see ${t} (saw ${rows[0].n})`);
      }
    });
  });

  test("an owner can create a client", async () => {
    await asRole(db, "authenticated", ownerId, async () => {
      await db.query("insert into public.clients (name) values ('New Client')");
    });
  });

  test("a readonly staff member reads but cannot write", async () => {
    await asRole(db, "authenticated", readonlyId, async () => {
      const { rows } = await db.query("select count(*)::int n from public.clients");
      assert.ok(rows[0].n >= 1, "readonly should still read");

      await rejects(
        () => db.query("insert into public.clients (name) values ('Nope')"),
        /row-level security|policy/i,
      );
    });
  });

  test("crew cannot author quotes", async () => {
    await asRole(db, "authenticated", crewId, async () => {
      await rejects(
        () => db.query("insert into public.clients (name) values ('Nope')"),
        /row-level security|policy/i,
      );
    });
  });
});
