import "server-only";
import { Resend } from "resend";
import { moneyShort } from "./money";
import type { Client, Quote, Settings } from "./db/types";

/**
 * Outbound quote mail.
 *
 * The ordering rule that matters (build plan, phase 3): the quote is committed as
 * issued FIRST, then mail is attempted inside a try/catch. A Resend hiccup must
 * report "issued as Q-2026-0008 but the email failed" — never 500 an already
 * issued document, and never roll back a number that has been drawn. Callers
 * enforce that; every function here simply reports whether it sent.
 */

let client: Resend | null = null;

function resend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  if (!client) client = new Resend(key);
  return client;
}

export interface SendResult {
  sent: boolean;
  /** Present when `sent` is false — surfaced to the operator verbatim. */
  error?: string;
}

function fromAddress(settings: Pick<Settings, "business_name" | "email">): string {
  // Resend's free tier only accepts onboarding@resend.dev until a domain is
  // verified, so the envelope sender stays configurable and the business address
  // rides on Reply-To.
  const from = process.env.LEAD_NOTIFICATION_FROM ?? "onboarding@resend.dev";
  return `${settings.business_name ?? "Australian Roofing Contractors"} <${from}>`;
}

export function defaultQuoteSubject(quote: Quote, settings: Settings): string {
  return `Your quote ${quote.quote_number ?? "from us"} — ${settings.business_name ?? "Australian Roofing Contractors"}`;
}

export function defaultQuoteBody(
  quote: Quote,
  client_: Client,
  settings: Settings,
  totalCents: number,
  portalUrl: string | null,
): string {
  const firstName = (client_.name ?? "").trim().split(/\s+/)[0] || "there";
  const lines = [
    `Hi ${firstName},`,
    ``,
    `Thanks for having us out to ${client_.property_address || "your property"}. ` +
      `Please find attached our quote ${quote.quote_number ?? ""} for ` +
      `${quote.roof_type || "the roofing works"}, totalling ${moneyShort(totalCents)}.`,
    ``,
    `The quote is valid for ${quote.valid_days} days.`,
  ];

  if (portalUrl) {
    lines.push(
      ``,
      `You can view it and accept online here:`,
      portalUrl,
      ``,
      `Accepting online records your name and the date against the quote, so there ` +
        `is nothing to print or scan.`,
    );
  } else {
    lines.push(
      ``,
      `If you'd like to proceed, sign the acceptance section and reply to this ` +
        `email, or give me a call.`,
    );
  }

  lines.push(
    ``,
    `Kind regards,`,
    settings.owner_name ?? "",
    settings.business_name ?? "",
    settings.phone ?? "",
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

export interface SendQuoteInput {
  to: string;
  subject: string;
  body: string;
  settings: Settings;
  replyTo?: string | null;
  attachment?: { filename: string; content: Buffer } | null;
}

export async function sendQuoteEmail(input: SendQuoteInput): Promise<SendResult> {
  try {
    const { error } = await resend().emails.send({
      from: fromAddress(input.settings),
      to: [input.to],
      replyTo: input.replyTo ?? input.settings.email ?? undefined,
      subject: input.subject,
      text: input.body,
      html: textToHtml(input.body),
      attachments: input.attachment
        ? [{ filename: input.attachment.filename, content: input.attachment.content }]
        : undefined,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Tell the operator a quote came back. Best-effort by design — a notification
 * that fails must never be able to undo an acceptance the client has signed.
 */
export async function notifyQuoteOutcome(
  quote: Quote,
  client_: Client,
  settings: Settings,
  outcome: "accepted" | "declined",
  totalCents: number,
): Promise<SendResult> {
  const to = process.env.CONTRACTOR_NOTIFICATION_EMAIL ?? settings.email;
  if (!to) return { sent: false, error: "No notification address configured" };

  const verb = outcome === "accepted" ? "ACCEPTED" : "declined";
  const subject = `${quote.quote_number} ${verb} — ${client_.name}`;
  const lines = [
    `${client_.name} has ${outcome} quote ${quote.quote_number}.`,
    ``,
    `Job:      ${quote.roof_type || "Roofing works"}`,
    `Property: ${client_.property_address ?? "—"}`,
    `Value:    ${moneyShort(totalCents)}`,
  ];
  if (outcome === "accepted") {
    lines.push(`Signed:   ${quote.signed_name ?? "—"} at ${quote.signed_at ?? "—"}`);
  } else if (quote.declined_reason) {
    lines.push(`Reason:   ${quote.declined_reason}`);
  }
  lines.push(``, `Phone: ${client_.phone ?? "—"}`, `Email: ${client_.email ?? "—"}`);

  const body = lines.join("\n");

  try {
    const { error } = await resend().emails.send({
      from: fromAddress(settings),
      to: [to],
      replyTo: client_.email ?? undefined,
      subject,
      text: body,
      html: textToHtml(body),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Follow-up nudge the operator sends by hand from the quotes list. */
export function defaultFollowUpBody(
  quote: Quote,
  client_: Client,
  settings: Settings,
  portalUrl: string | null,
): string {
  const firstName = (client_.name ?? "").trim().split(/\s+/)[0] || "there";
  return [
    `Hi ${firstName},`,
    ``,
    `Just checking in on quote ${quote.quote_number ?? ""} for ` +
      `${quote.roof_type || "the roofing works"} at ` +
      `${client_.property_address || "your property"}.`,
    ``,
    `Happy to walk you through any of it, or adjust the scope if something isn't ` +
      `quite right.`,
    portalUrl ? `\nThe quote is here whenever you want another look:\n${portalUrl}` : "",
    ``,
    `Kind regards,`,
    settings.owner_name ?? "",
    settings.business_name ?? "",
    settings.phone ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Plain text into a mail-client-safe HTML body. No templating, no images. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Bare URLs become links; anything else stays as written.
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#c8443b">$1</a>',
  );

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:24px;font-size:15px;line-height:1.6;white-space:pre-wrap">${linked}</body></html>`;
}
