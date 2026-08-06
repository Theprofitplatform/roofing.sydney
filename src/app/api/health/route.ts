import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Container healthcheck. Deliberately dependency-free — it reports that the
 * Node process is serving, not that Supabase is reachable. A liveness probe
 * that fails on a third-party outage restarts a perfectly healthy container.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "roofing-sydney",
      commit: process.env.GIT_COMMIT ?? "unknown",
      uptime_s: Math.round(process.uptime()),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
