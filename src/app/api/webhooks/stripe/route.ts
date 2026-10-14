import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/db/client";
import { payments } from "@/db/schema";
import {
  recordRentPayment,
  stripeEnabled,
  stripePaymentNote,
} from "@/lib/rent-payment";
import { isUuid } from "@/lib/utils";

/**
 * Stripe webhook — records rent payments after a Checkout Session completes.
 * The signature is verified against STRIPE_WEBHOOK_SECRET, and the session id
 * embedded in the payment note makes retries idempotent.
 */
export async function POST(req: Request) {
  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set" },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const StripeClient = (await import("stripe")).default;
  const stripe = new StripeClient(process.env.STRIPE_SECRET_KEY!);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const leaseId = session.metadata?.leaseId;
    const userId = session.metadata?.userId;
    const amount = (session.amount_total ?? 0) / 100;

    if (
      !leaseId ||
      !isUuid(leaseId) ||
      !userId ||
      !isUuid(userId) ||
      session.payment_status !== "paid" ||
      amount <= 0
    ) {
      return NextResponse.json({ received: true, skipped: true });
    }

    const note = stripePaymentNote(session.id);
    const [existing] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.notes, note))
      .limit(1);
    if (!existing) {
      const ok = await recordRentPayment({ leaseId, userId, amount, notes: note });
      if (!ok) {
        console.warn(`[stripe:webhook] lease ${leaseId} not found — payment skipped`);
        return NextResponse.json({ received: true, skipped: true });
      }
    }
  }

  // Acknowledge everything else (checkout.session.expired, etc.).
  return NextResponse.json({ received: true });
}
