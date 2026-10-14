import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, payments, properties, tenants, units } from "@/db/schema";
import { sendPaymentReceipt } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";

/**
 * Online rent payments — Stripe Checkout in production, a local confirm page
 * in development. `STRIPE_SECRET_KEY` is the switch: without it, "Pay rent"
 * records the payment directly so the whole flow stays testable before the
 * account exists (same pattern as the email/console fallbacks).
 */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Notes written for Stripe-recorded payments — doubles as the idempotency key. */
export function stripePaymentNote(sessionId: string): string {
  return `Online payment — Stripe ${sessionId}`;
}

/** Notes for payments completed through the local demo checkout. */
export const DEMO_PAYMENT_NOTE = "Online payment (demo mode)";

/**
 * Today's calendar date in Philippine time (the app's locale), as UTC
 * midnight — the same representation finance's `toUtcDate` produces, so
 * `payments.paidDate` shows the same day everywhere.
 */
export function todayPaymentDate(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD"
  return new Date(`${iso}T00:00:00Z`);
}

export interface RentPaymentInput {
  leaseId: string;
  /** The user the payment is attributed to (the tenant in portal flows). */
  userId: string;
  /** Amount in pesos. */
  amount: number;
  /** Free-text note; for Stripe payments use `stripePaymentNote(session.id)`. */
  notes: string;
}

/**
 * Record a rent payment against a lease and email the tenant a receipt.
 * Returns false when the lease doesn't exist (callers treat it as failure).
 *
 * The lease row is loaded first so the receipt always names the current
 * property/unit/tenant — nothing comes from the client.
 */
export async function recordRentPayment(input: RentPaymentInput): Promise<boolean> {
  const [lease] = await db
    .select({
      id: leases.id,
      tenantFirstName: tenants.firstName,
      tenantLastName: tenants.lastName,
      tenantEmail: tenants.email,
      unitName: units.name,
      propertyName: properties.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(eq(leases.id, input.leaseId))
    .limit(1);
  if (!lease) return false;

  await db.insert(payments).values({
    userId: input.userId,
    leaseId: input.leaseId,
    amount: input.amount.toFixed(2),
    paidDate: todayPaymentDate(),
    method: "card",
    type: "rent",
    notes: input.notes,
  });

  if (lease.tenantEmail) {
    await sendPaymentReceipt({
      to: lease.tenantEmail,
      tenantName: `${lease.tenantFirstName} ${lease.tenantLastName}`.trim(),
      amountText: formatCurrency(input.amount),
      paidDate: todayPaymentDate(),
      unitName: lease.unitName,
      propertyName: lease.propertyName,
    });
  }
  return true;
}
