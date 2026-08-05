import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { verifyWebhook } from "@/lib/stripe";
import { recordStripePayment } from "@/lib/db/invoices";

/**
 * Stripe's side of the payment loop.
 *
 * Three things make this correct, and all three are easy to lose:
 *
 * 1. **The raw body.** Signature verification hashes the exact bytes Stripe
 *    sent. Anything that parses the body first — a JSON middleware, a framework
 *    convenience — re-serialises it and every delivery then fails to verify.
 *
 * 2. **Nothing happens before verification.** An unverified payload is a 400 and
 *    no side effect. Anyone can POST to this URL; marking an invoice paid on an
 *    unsigned body would hand out free roofs.
 *
 * 3. **Idempotency.** Stripe retries deliveries, and a card checkout fires both
 *    `checkout.session.completed` and `payment_intent.succeeded` for the same
 *    money. `recordStripePayment` is keyed on the payment intent, so the second
 *    arrival books nothing; without that the invoice silently overpays, which is
 *    the worst kind of reconciliation error because nothing complains.
 */

// The Stripe SDK needs node crypto for constructEvent — it cannot run on edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What a handled event boils down to: which invoice, how much, keyed on what. */
interface Booking {
  invoiceId: string;
  amountCents: number;
  paymentIntentId: string;
}

function fromCheckoutSession(session: Stripe.Checkout.Session): Booking | null {
  // An unpaid session is a customer who reached the page and left.
  if (session.payment_status !== "paid") return null;

  const invoiceId = session.metadata?.invoice_id ?? session.client_reference_id;
  const amountCents = session.amount_total;
  if (!invoiceId || amountCents == null) return null;

  const intent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  // The intent is the idempotency key shared with payment_intent.succeeded. A
  // session with none (a zero-amount or async method) can still fall back to its
  // own id — unique per session, which is all the key has to be.
  return { invoiceId, amountCents, paymentIntentId: intent ?? session.id };
}

function fromPaymentIntent(intent: Stripe.PaymentIntent): Booking | null {
  const invoiceId = intent.metadata?.invoice_id;
  if (!invoiceId) return null;

  // amount_received is what actually settled; amount is only what was asked for.
  const amountCents = intent.amount_received || intent.amount;
  return { invoiceId, amountCents, paymentIntentId: intent.id };
}

export async function POST(req: Request) {
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyWebhook(raw, req.headers.get("stripe-signature"));
  } catch (error) {
    console.warn("[stripe] rejected an unverified delivery:", message(error));
    return new NextResponse(`Signature verification failed: ${message(error)}`, { status: 400 });
  }

  let booking: Booking | null = null;

  switch (event.type) {
    case "checkout.session.completed":
      booking = fromCheckoutSession(event.data.object);
      break;
    case "payment_intent.succeeded":
      booking = fromPaymentIntent(event.data.object);
      break;
    default:
      // Stripe sends whatever the endpoint is subscribed to. Log it so an
      // unexpected subscription is visible, and acknowledge so it stops retrying.
      console.info(`[stripe] ignoring ${event.type} (${event.id})`);
      return NextResponse.json({ received: true, handled: false });
  }

  if (!booking) {
    // Verified, but carrying no invoice to credit — a payment taken outside this
    // app, or a session the customer abandoned. Retrying cannot fix either.
    console.warn(`[stripe] ${event.type} (${event.id}) had no invoice to credit`);
    return NextResponse.json({ received: true, handled: false });
  }

  try {
    const { booked } = await recordStripePayment(
      booking.invoiceId,
      booking.amountCents,
      booking.paymentIntentId,
    );
    console.info(
      `[stripe] ${event.type} ${booked ? "booked" : "already booked"} ` +
        `${booking.amountCents}c against invoice ${booking.invoiceId}`,
    );
    // 200 whether or not this delivery was the one that booked the money. A
    // duplicate is a success: the invoice is already correct.
    return NextResponse.json({ received: true, handled: true, booked });
  } catch (error) {
    // A genuine database fault is the one case worth a retry — Stripe will
    // redeliver with backoff, and the idempotency key makes that safe.
    console.error(`[stripe] failed to book ${event.id}:`, message(error));
    return NextResponse.json({ error: "Could not record the payment." }, { status: 500 });
  }
}
