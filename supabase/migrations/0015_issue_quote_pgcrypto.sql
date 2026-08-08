-- Let issue_quote resolve gen_random_bytes().
--
-- 0003 declares issue_quote as `security definer set search_path = public` and
-- mints the portal token with `encode(gen_random_bytes(24), 'hex')`.
-- gen_random_bytes comes from pgcrypto, which Supabase installs into the
-- `extensions` schema — not `public`. Pinning search_path to `public` alone is
-- correct for a security definer function, but it also puts pgcrypto out of
-- reach, so the call cannot resolve:
--
--   ERROR: function gen_random_bytes(integer) does not exist
--
-- The failure surfaces on the first quote ever issued and nowhere earlier: the
-- draft, the builder and the PDF never touch it, and the unit and PGlite suites
-- do not exercise this path against a Supabase-shaped extension layout. It is
-- not specific to self-hosting — a fresh cloud project keeps pgcrypto in
-- `extensions` too.
--
-- Adding `extensions` to the search_path is preferable to schema-qualifying the
-- call: it keeps 0003's body as written, and `extensions` stays a trusted,
-- non-writable schema, so the security definer guarantee is unchanged.
--
-- ALTER FUNCTION is idempotent and preserves the body, so this replays cleanly.

alter function public.issue_quote(uuid, bigint, bigint, text)
  set search_path = public, extensions;
