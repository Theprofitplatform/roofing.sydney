import "server-only";
import Stripe from "stripe";
import type { Client, Invoice, InvoiceKind, Settings } from "./db/types";

/**
 * Stripe, held at arm's length.
 *
 * Two properties this module exists to protect:
 *
 * 1. **Stripe is optional.** The money column ships whether or not John ever
 *    connects an account, so nothing here may touch the environment at import
 *    time. An unset `STRIPE_SECRET_KEY` has to surface on the invoice screen as
 *    "Stripe is not configured" — a sentence the operator can act on — rather
 *    than as a crash on the first render of a page that has other work to do.
 *
 * 2. **Stripe counts in minor units, exactly as this codebase does.**
 *    `unit_amount` takes `invoice.total_cents` unchanged. There is no conversion
 *    in this file and there must never be one: multiplying by 100 here would
 *    charge a homeowner a hundred times the invoice, and Stripe would take it.
 */

/** Cached so a burst of payment links does not open a client per request. */
let cached: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor(variable: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" = "STRIPE_SECRET_KEY") {
    super(`Stripe is not configured — ${variable} is not set.`);
    this.name = "StripeNotConfiguredError";
  }
}

/** Cheap enough to call in a page render, so the UI can hide the card button. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  if (!cached) cached = new Stripe(key);
  return cached;
}

const KIND_LABEL: Record<InvoiceKind, string> = {
  deposit: "Deposit",
  progress: "Progress claim",
  final: "Final invoice",
};

export interface CheckoutSessionInput {
  invoice: Pick<Invoice, "id" | "invoice_number" | "kind" | "total_cents">;
  client: Pick<Client, "name" | "email"> | null;
  settings: Pick<Settings, "business_name"> | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  /** Checkout links are short-lived; the screen tells the operator when. */
  expiresAt: Date;
}

/**
 * A one-off Checkout Session for a single invoice, priced ad hoc — no Stripe
 * Product or Price is created, because the catalogue would be one throwaway
 * entry per invoice and reconciliation happens against our invoice number, not
 * against Stripe's.
 */
export async function createCheckoutSession({
  invoice,
  client,
  settings,
  successUrl,
  cancelUrl,
}: CheckoutSessionInput): Promise<CheckoutSession> {
  if (invoice.total_cents <= 0) {
    throw new Error("An invoice of zero cannot be paid by card.");
  }

  const business = settings?.business_name?.trim() || "Australian Roofing Contractors";
  const label = [KIND_LABEL[invoice.kind], invoice.invoice_number].filter(Boolean).join(" ");

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: invoice.id,
    customer_email: client?.email ?? undefined,
    metadata: { invoice_id: invoice.id },
    // `payment_intent.succeeded` carries the intent, not the session, so the
    // invoice id has to be stamped on both or that handler has nothing to
    // resolve the payment against.
    payment_intent_data: {
      description: `${business} — ${label}`,
      metadata: { invoice_id: invoice.id },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "aud",
          // Stripe's minor units are this codebase's cents. No conversion.
          unit_amount: invoice.total_cents,
          product_data: {
            name: label || "Roofing works",
            description: client?.name ? `For ${client.name}` : undefined,
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error("Stripe returned a Checkout Session with no payment URL.");
  }

  return {
    id: session.id,
    url: session.url,
    expiresAt: new Date(session.expires_at * 1000),
  };
}

/**
 * Verify a webhook delivery. Throws on anything that is not provably from
 * Stripe — the caller must treat a throw as a 400 and act on nothing, because
 * an unverified payload marking an invoice paid is a free roof.
 */
export function verifyWebhook(rawBody: string, signature: string | null | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeNotConfiguredError("STRIPE_WEBHOOK_SECRET");
  if (!signature) throw new Error("Missing stripe-signature header.");
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
