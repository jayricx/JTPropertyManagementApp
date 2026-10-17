import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentCheckouts } from "@/db/schema";
import { cardPaymentNote, recordRentPayment } from "@/lib/rent-payment";

/**
 * Reconciles a settled card checkout with the ledger. Kept separate from the
 * webhook route so the same logic can be reused (or replayed by hand) and so
 * the route stays a thin verifier.
 */

export type ApplyResult = "recorded" | "already" | "not_found";

/**
 * Mark the checkout paid and record its rent payment exactly once.
 *
 * Idempotent by construction: we atomically claim the row (flip it to `paid`)
 * before writing anything, so a replayed (or concurrent) webhook finds nothing
 * to claim and never writes a second payment. If the lease can't be found the
 * row is still marked paid — the charge did happen — with `paymentId` left
 * null so the mismatch is visible.
 */
export async function applyCheckoutPaid(input: {
  providerRef: string;
  referenceNumber?: string | null;
}): Promise<ApplyResult> {
  const [checkout] = await db
    .select({
      id: paymentCheckouts.id,
      leaseId: paymentCheckouts.leaseId,
      tenantAccountId: paymentCheckouts.tenantAccountId,
      amountCentavos: paymentCheckouts.amountCentavos,
      referenceNumber: paymentCheckouts.referenceNumber,
      status: paymentCheckouts.status,
      paymentId: paymentCheckouts.paymentId,
    })
    .from(paymentCheckouts)
    .where(
      input.referenceNumber
        ? or(
            eq(paymentCheckouts.providerRef, input.providerRef),
            eq(paymentCheckouts.referenceNumber, input.referenceNumber),
          )
        : eq(paymentCheckouts.providerRef, input.providerRef),
    )
    .limit(1);
  if (!checkout) return "not_found";
  if (checkout.status === "paid" || checkout.paymentId) return "already";

  // Claim it first: only one caller can move the row to `paid`. `ne paid`
  // (rather than `= pending`) also catches a late success on a session we'd
  // parked as expired/failed. Under READ COMMITTED a concurrent claim
  // re-evaluates the predicate after locking, so only one caller wins.
  const claimed = await db
    .update(paymentCheckouts)
    .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(paymentCheckouts.id, checkout.id),
        ne(paymentCheckouts.status, "paid"),
      ),
    )
    .returning({ id: paymentCheckouts.id });
  if (claimed.length === 0) return "already";

  const paymentId = await recordRentPayment({
    leaseId: checkout.leaseId,
    userId: checkout.tenantAccountId,
    amount: checkout.amountCentavos / 100,
    method: "card",
    notes: cardPaymentNote(checkout.referenceNumber),
  });

  if (paymentId) {
    await db
      .update(paymentCheckouts)
      .set({ paymentId, updatedAt: new Date() })
      .where(eq(paymentCheckouts.id, checkout.id));
  }

  return "recorded";
}
