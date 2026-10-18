import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, leases, payments, properties, tenants, units } from "@/db/schema";
import { sanitizeFileName } from "@/lib/attachments";
import { sendPaymentReceipt } from "@/lib/email";
import type { PaymentMethod } from "@/lib/validations";
import { formatCurrency } from "@/lib/utils";

/**
 * GCash rent payments: the tenant sends rent from their GCash app to the
 * landlord's wallet and submits the reference number; the landlord verifies it
 * in their GCash history. The note doubles as the idempotency key so a
 * re-submitted reference can't create a second payment.
 */
export function gcashPaymentNote(reference: string): string {
  return `GCash payment — Ref #${reference}`;
}

/**
 * Bank-transfer rent payments: the tenant sends rent from their own bank app
 * to one of the landlord's accounts and submits the transaction reference;
 * the landlord verifies it against their bank statement. Like the GCash note
 * this doubles as the idempotency key, and `payments.bankAccountId` records
 * which of the landlord's accounts the money went to.
 */
export function bankTransferPaymentNote(reference: string): string {
  return `Bank transfer — Ref #${reference}`;
}

/**
 * Receipt photos a tenant attaches when submitting a payment. Kept in
 * `documents` like every other attachment — bytes in the DB for now — and
 * linked by `payment_id` so the landlord's Finance queue can show the photo
 * beside the reference being verified.
 *
 * Optional and best-effort: a failed or oversized photo must never swallow the
 * payment the tenant just submitted, so problems are logged and swallowed.
 * Returns how many were stored.
 */
export async function attachPaymentReceipts(input: {
  paymentId: string;
  leaseId: string;
  userId: string;
  files: File[];
}): Promise<number> {
  let stored = 0;
  for (const file of input.files) {
    try {
      const id = crypto.randomUUID();
      const bytes = Buffer.from(await file.arrayBuffer());
      await db.insert(documents).values({
        id,
        userId: input.userId,
        paymentId: input.paymentId,
        // Carrying the lease keeps the download route's existing rule intact:
        // the uploader always sees it, and anyone who can reach the lease can.
        leaseId: input.leaseId,
        name: sanitizeFileName(file.name),
        url: `/api/documents/${id}`,
        type: file.type,
        sizeBytes: bytes.byteLength,
        data: bytes.toString("base64"),
      });
      stored++;
    } catch (error) {
      console.error("[rent-payment] receipt photo failed", file.name, error);
    }
  }
  return stored;
}

/** The photos attached to a payment, oldest first. */
export async function paymentReceipts(
  paymentId: string,
): Promise<{ id: string; name: string; url: string; type: string | null }[]> {
  return db
    .select({
      id: documents.id,
      name: documents.name,
      url: documents.url,
      type: documents.type,
    })
    .from(documents)
    .where(eq(documents.paymentId, paymentId))
    .orderBy(asc(documents.createdAt));
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
  /**
   * For bank transfers: which of the landlord's accounts the tenant sent the
   * money to, so the landlord knows where to look when verifying.
   */
  bankAccountId?: string;
  /**
   * `pending` for tenant GCash or bank-transfer submissions awaiting the
   * landlord's approval — no receipt is sent yet (the landlord's
   * verification sends it). Defaults to `paid`: the landlord's own records
   * need no approval.
   */
  status?: "pending" | "paid";
}

/** The names a payment receipt needs, loaded straight from the lease. */
interface LeaseReceiptInfo {
  tenantFirstName: string;
  tenantLastName: string;
  tenantEmail: string | null;
  unitName: string;
  propertyName: string;
}

/**
 * Load the current property/unit/tenant for a lease — nothing comes from the
 * client, so a receipt always names the real countersignees.
 */
async function loadLeaseReceiptInfo(
  leaseId: string,
): Promise<LeaseReceiptInfo | null> {
  const [lease] = await db
    .select({
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
    .where(eq(leases.id, leaseId))
    .limit(1);
  return lease ?? null;
}

/**
 * Email the tenant a receipt for a payment. A receipt that fails to send must
 * not fail (or worse, roll back) the payment; the landlord still sees it in
 * Finance.
 */
async function emailReceipt(
  leaseId: string,
  amount: number,
  paidDate: Date,
): Promise<void> {
  const lease = await loadLeaseReceiptInfo(leaseId);
  if (!lease?.tenantEmail) return;
  try {
    await sendPaymentReceipt({
      to: lease.tenantEmail,
      tenantName: `${lease.tenantFirstName} ${lease.tenantLastName}`.trim(),
      amountText: formatCurrency(amount),
      paidDate,
      unitName: lease.unitName,
      propertyName: lease.propertyName,
    });
  } catch (error) {
    console.error("[rent-payment] receipt email failed", error);
  }
}

/**
 * Record a rent payment against a lease and email the tenant a receipt
 * (unless it is a `pending` tenant submission awaiting the landlord's
 * verification). Returns the new payment's id, or null when the lease doesn't
 * exist (callers treat that as failure).
 */
export async function recordRentPayment(
  input: RentPaymentInput,
): Promise<string | null> {
  const lease = await loadLeaseReceiptInfo(input.leaseId);
  if (!lease) return null;

  const [inserted] = await db
    .insert(payments)
    .values({
      userId: input.userId,
      leaseId: input.leaseId,
      amount: input.amount.toFixed(2),
      paidDate: todayPaymentDate(),
      method: input.method,
      type: "rent",
      status: input.status ?? "paid",
      notes: input.notes,
      bankAccountId: input.bankAccountId ?? null,
    })
    .returning({ id: payments.id });

  if (input.status !== "pending") {
    await emailReceipt(input.leaseId, input.amount, todayPaymentDate());
  }
  return inserted?.id ?? null;
}

/**
 * Approve a pending tenant payment: flip it to `paid` (only while it still is
 * pending — the conditional claim makes a double-click harmless) and email the
 * tenant their receipt. Returns false when the row was already reviewed.
 */
export async function verifyPendingPayment(
  paymentId: string,
): Promise<boolean> {
  const [claimed] = await db
    .update(payments)
    .set({ status: "paid", reviewedAt: new Date() })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
    .returning({
      leaseId: payments.leaseId,
      amount: payments.amount,
      paidDate: payments.paidDate,
    });
  if (!claimed) return false;

  if (claimed.leaseId) {
    await emailReceipt(claimed.leaseId, Number(claimed.amount), claimed.paidDate);
  }
  return true;
}

/**
 * Turn a pending tenant payment away: mark it `rejected` so it stops counting
 * toward the statement and income, keeping the row as a record of the refusal.
 * Returns false when the row was already reviewed.
 */
export async function rejectPendingPayment(
  paymentId: string,
): Promise<boolean> {
  const [claimed] = await db
    .update(payments)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
    .returning({ id: payments.id });
  return Boolean(claimed);
}
