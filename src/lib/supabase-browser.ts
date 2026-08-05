"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for client components. Uses the anon key and the session
 * cookie, so every query runs under RLS as the signed-in user.
 */
export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
