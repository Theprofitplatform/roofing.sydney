-- ============================================================================
-- 0014 — Storage
--
-- One private bucket holds every binary the CRM produces: issued quote PDFs,
-- site photos, the business logo, and job paperwork (engineer's reports, colour
-- sheets, warranties).
--
-- Provisioned here rather than clicked in the dashboard so a fresh project is
-- reproducible from the repo alone. Without it the first issue succeeds — the
-- quote number is drawn and the status flips — and then storing the PDF fails,
-- leaving an issued quote with no artefact. That is the worst possible ordering
-- to discover a missing bucket in.
-- ============================================================================

-- PGlite has no `storage` schema, and the db tests do not exercise object
-- storage. Skip cleanly there instead of failing the whole migration run.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent (not Supabase) — skipping bucket provisioning';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'quotes',
    'quotes',
    -- PRIVATE, permanently. A public bucket makes every quote PDF enumerable by
    -- anyone who guesses an id, and these documents carry a homeowner's name,
    -- address and contract price.
    false,
    26214400,  -- 25 MB, matching client_max_body_size in the nginx vhost
    array[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/svg+xml'
    ]
  )
  on conflict (id) do update
    set public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end
$$;

-- ── Object policies ─────────────────────────────────────────────────────────
--
-- Deliberately staff-only, with no anon policy at all.
--
-- The client portal does NOT read through these. It resolves a quote by its
-- portal token server-side and hands back a short-lived signed URL minted with
-- the service role, which bypasses RLS by design. Granting the anon role a
-- policy here instead would make the bucket probeable one path at a time, and a
-- link that never expires is a link that leaks.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;

  execute 'drop policy if exists quotes_bucket_staff_read on storage.objects';
  execute $p$
    create policy quotes_bucket_staff_read on storage.objects
      for select using (bucket_id = 'quotes' and public.is_staff())
  $p$;

  -- Crew may add job paperwork from the roof but never remove it — the same
  -- split as the job_attachments table in 0010, and for the same reason: losing
  -- a document nobody notices is gone is worse than keeping a spare.
  execute 'drop policy if exists quotes_bucket_staff_write on storage.objects';
  execute $p$
    create policy quotes_bucket_staff_write on storage.objects
      for insert with check (
        bucket_id = 'quotes'
        and (public.can_write() or exists (
          select 1 from public.users u where u.id = auth.uid() and u.role = 'crew'
        ))
      )
  $p$;

  execute 'drop policy if exists quotes_bucket_staff_update on storage.objects';
  execute $p$
    create policy quotes_bucket_staff_update on storage.objects
      for update using (bucket_id = 'quotes' and public.can_write())
      with check (bucket_id = 'quotes' and public.can_write())
  $p$;

  execute 'drop policy if exists quotes_bucket_staff_delete on storage.objects';
  execute $p$
    create policy quotes_bucket_staff_delete on storage.objects
      for delete using (bucket_id = 'quotes' and public.can_write())
  $p$;
end
$$;
