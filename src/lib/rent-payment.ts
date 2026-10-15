import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, payments, properties, tenants, units } from "@/db/schema";
import { sendPaymentReceipt } from "@/lib/email";
import type { PaymentMethod } from "@/lib/validations";
import { formatCurrency } from "@/lib/utils";

/**
 * Online rent payments run through GCash — the tenant sends rent from their
 * GCash app to the landlord's wallet and submits the reference number; the
 * landlord verifies it in their GCash history. The note doubles as the
 * idempotency key so a re-submitted reference can't create a second payment.
 */
export function gcashPaymentNote(reference: string): string {
  return `GCash payment — Ref #${reference}`;
}

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
  method: PaymentMethod;
  /** Free-text note; for GCash payments use `gcashPaymentNote(reference)`. */
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
    method: input.method,
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
