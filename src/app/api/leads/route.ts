import { NextResponse } from "next/server";
import { validateLead, type LeadInput } from "@/lib/leads";
import { getSupabaseAdmin } from "@/lib/supabase";
import { notifyContractor } from "@/lib/email";
import { intakeLead } from "@/lib/db/pipeline";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: Request) {
  let raw: Partial<LeadInput>;
  try {
    raw = (await req.json()) as Partial<LeadInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateLead(raw);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }
  const lead = result.value;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;

  let leadId: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("leads").insert({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      lat: lead.lat ?? null,
      lng: lead.lng ?? null,
      place_id: lead.placeId ?? null,
      selected_colour_id: lead.selectedColourId ?? null,
      selected_colour_name: lead.selectedColourName ?? null,
      best_time: lead.bestTime ?? null,
      notes: lead.notes ?? null,
      source: "web",
      ip,
      user_agent: userAgent,
    }).select("id").single();
    if (error) {
      console.error("supabase insert failed", error);
      return NextResponse.json(
        { error: "Could not save your enquiry. Please try again." },
        { status: 500 }
      );
    }
    leadId = data?.id ?? null;
  } catch (e) {
    console.error("supabase client error", e);
    return NextResponse.json(
      { error: "Lead storage is not configured." },
      { status: 500 }
    );
  }

  // Pull the enquiry straight into the pipeline as a client + an opportunity at
  // `enquiry`. Best-effort on purpose: the homeowner's submission is already
  // saved, and failing their request because an internal projection stumbled
  // would lose the lead entirely. `intake_lead` is idempotent on lead_id, so the
  // operator can retry from the CRM without creating a duplicate client.
  if (leadId) {
    try {
      await intakeLead(leadId);
    } catch (e) {
      console.error("lead intake failed", e);
    }
  }

  // Best-effort email — don't fail the request if Resend has a hiccup.
  try {
    await notifyContractor(lead);
  } catch (e) {
    console.error("resend notify failed", e);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
