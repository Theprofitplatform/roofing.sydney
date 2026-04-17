import { Resend } from "resend";
import type { LeadInput } from "@/lib/leads";

let client: Resend | null = null;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  if (!client) client = new Resend(key);
  return client;
}

export async function notifyContractor(lead: LeadInput): Promise<void> {
  const to = process.env.CONTRACTOR_NOTIFICATION_EMAIL;
  const from = process.env.LEAD_NOTIFICATION_FROM ?? "onboarding@resend.dev";
  if (!to) throw new Error("CONTRACTOR_NOTIFICATION_EMAIL is not set");

  const mapsLink =
    typeof lead.lat === "number" && typeof lead.lng === "number"
      ? `https://www.google.com/maps?q=${lead.lat},${lead.lng}`
      : null;

  const subject = `New roofing quote request — ${lead.name}`;
  const text = buildText(lead, mapsLink);
  const html = buildHtml(lead, mapsLink);

  await getResend().emails.send({
    from: `roofing.sydney <${from}>`,
    to: [to],
    replyTo: lead.email,
    subject,
    text,
    html,
  });
}

function buildText(lead: LeadInput, mapsLink: string | null): string {
  const lines = [
    `New quote request from roofing.sydney`,
    ``,
    `Name:    ${lead.name}`,
    `Phone:   ${lead.phone}`,
    `Email:   ${lead.email}`,
    `Address: ${lead.address}`,
  ];
  if (lead.selectedColourName) lines.push(`Colour:  ${lead.selectedColourName}`);
  if (lead.bestTime) lines.push(`Best time to call: ${lead.bestTime}`);
  if (lead.notes) lines.push(``, `Notes:`, lead.notes);
  if (mapsLink) lines.push(``, `Map: ${mapsLink}`);
  lines.push(``, `Reply to this email to respond directly to the homeowner.`);
  return lines.join("\n");
}

function buildHtml(lead: LeadInput, mapsLink: string | null): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap">${label}</td><td style="padding:6px 0;color:#111827">${escapeHtml(value)}</td></tr>`;
  const rows = [
    row("Name", lead.name),
    row("Phone", lead.phone),
    row("Email", lead.email),
    row("Address", lead.address),
    lead.selectedColourName ? row("Colour", lead.selectedColourName) : "",
    lead.bestTime ? row("Best time to call", lead.bestTime) : "",
  ].join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="font-size:18px;margin:0 0 12px">New roofing quote request</h1>
  <table cellpadding="0" cellspacing="0" style="font-size:14px;margin:12px 0 20px;border-collapse:collapse">${rows}</table>
  ${lead.notes ? `<div style="margin:12px 0;padding:12px;background:#f9fafb;border-radius:8px;font-size:14px;white-space:pre-wrap">${escapeHtml(lead.notes)}</div>` : ""}
  ${mapsLink ? `<p style="font-size:14px"><a href="${mapsLink}">Open in Google Maps</a></p>` : ""}
  <p style="font-size:12px;color:#6b7280;margin-top:24px">Reply to this email to respond to the homeowner directly.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
