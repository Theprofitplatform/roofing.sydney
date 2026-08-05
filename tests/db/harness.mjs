import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const SEED = path.join(ROOT, "supabase/seed.sql");

/**
 * Supabase provides the `auth` schema (GoTrue) and `auth.uid()`. PGlite does
 * not, so we stand up the minimum the migrations and policies reference.
 * `auth.uid()` reads a session GUC, which lets a test impersonate a user.
 */
/**
 * PGlite's WASM build ships without pgcrypto. Supabase has it (the pre-existing
 * supabase/schema.sql already depends on it), so rather than weaken the schema
 * we shim the one function the migrations use. gen_random_uuid() needs no shim
 * — it is core from PostgreSQL 13.
 *
 * TEST ONLY. This random source is not cryptographically secure; production
 * portal tokens come from pgcrypto, or are passed in from application code.
 */
const PGCRYPTO_SHIM = `
  create or replace function public.gen_random_bytes(n int)
  returns bytea
  language sql
  volatile
  as $$
    select decode(
      string_agg(lpad(to_hex(floor(random() * 256)::int), 2, '0'), ''),
      'hex')
    from generate_series(1, n);
  $$;
`;

const AUTH_STUB = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id                   uuid primary key default gen_random_uuid(),
    email                text unique not null,
    raw_user_meta_data   jsonb default '{}'::jsonb,
    created_at           timestamptz not null default now()
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
`;

/** Boot a database with all migrations applied. */
export async function freshDb({ seed = true } = {}) {
  const db = await PGlite.create();
  await db.exec(AUTH_STUB);
  await db.exec(PGCRYPTO_SHIM);

  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    let sql = await readFile(path.join(MIGRATIONS, file), "utf8");
    // pgcrypto is unavailable in PGlite; the shim above stands in for it.
    sql = sql.replace(/create\s+extension[^;]*;/gi, "");
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }

  if (seed) {
    await db.exec(await readFile(SEED, "utf8"));
  }

  await db.exec(SUPABASE_ROLES);

  return db;
}

/**
 * Reproduces Supabase's role model so RLS can actually be exercised.
 *
 * Two things matter here. First, the default PGlite user is a superuser and
 * superusers bypass RLS unconditionally — testing as postgres proves nothing.
 * Second, Supabase grants anon/authenticated blanket table privileges and
 * relies on RLS alone to decide access; granting the same here means a passing
 * test reflects the POLICY, not a missing GRANT.
 */
const SUPABASE_ROLES = `
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
  end
  $$;

  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant usage, select on all sequences in schema public to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
`;

/**
 * Run `fn` as a database role (`anon` or `authenticated`), optionally with
 * auth.uid() resolving to `userId`. Mirrors how PostgREST executes a request.
 */
export async function asRole(db, role, userId, fn) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

/** Create an auth user + staff row and return its id. */
export async function makeUser(db, { email, role = "owner" } = {}) {
  const address = email ?? `op${Math.floor(Number(process.hrtime.bigint() % 100000n))}@roofing.sydney`;
  const { rows } = await db.query(
    "insert into auth.users (email) values ($1) returning id",
    [address],
  );
  const id = rows[0].id;
  // The on_auth_user_created trigger provisions public.users; set the role.
  await db.query("update public.users set role = $1 where id = $2", [role, id]);
  return id;
}

/** Run `fn` with auth.uid() resolving to `userId`. */
export async function as(db, userId, fn) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  try {
    return await fn();
  } finally {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

/** Minimal client + draft quote, returning both ids. */
export async function makeDraftQuote(db, userId, overrides = {}) {
  const { rows: c } = await db.query(
    "insert into public.clients (name, email, property_address, created_by) values ($1,$2,$3,$4) returning id",
    ["Margaret Chen", "m.chen@bigpond.com", "14 Wattle Street, Marrickville NSW 2204", userId],
  );
  const clientId = c[0].id;

  const { rows: q } = await db.query(
    `insert into public.quotes (client_id, roof_type, margin_pct, valid_days, created_by)
     values ($1,$2,$3,$4,$5) returning id`,
    [
      clientId,
      overrides.roof_type ?? "Gutter & downpipe replacement",
      overrides.margin_pct ?? 20,
      overrides.valid_days ?? 30,
      userId,
    ],
  );
  const quoteId = q[0].id;

  await db.query(
    `insert into public.quote_items (quote_id, kind, description, qty, unit, unit_cost_cents)
     values ($1,'material','Colorbond quad gutter',46,'m',1850)`,
    [quoteId],
  );

  return { clientId, quoteId };
}

/** Assert that `fn` rejects, optionally matching `pattern`. */
export async function rejects(fn, pattern) {
  let threw = null;
  try {
    await fn();
  } catch (err) {
    threw = err;
  }
  if (!threw) throw new Error("expected the statement to throw, but it succeeded");
  if (pattern && !pattern.test(threw.message)) {
    throw new Error(`error did not match ${pattern}\n  actual: ${threw.message}`);
  }
  return threw;
}
