"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, maintenanceRequests, payments, properties, tenants, units } from "@/db/schema";
import { gcashPaymentNote, recordRentPayment } from "@/lib/rent-payment";
import { isUuid } from "@/lib/utils";
import { tenantRequestSchema } from "@/lib/validations";

/** `ok` lets the form reset itself after a successful submission. */
export type ActionState = { error?: string; ok?: boolean } | null;

export async function createTenantRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  // Server actions are callable by any signed-in user — enforce the role
  // here too, not just in the portal layout.
  if (session.user.role !== "tenant") {
    return { error: "Only tenant accounts can report issues." };
  }

  // The tenant profile is whatever roster entry links to this account.
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountId, session.user.id))
    .limit(1);
  if (!tenant) {
    return { error: "No tenant profile is linked to this account." };
  }

  const parsed = tenantRequestSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    priority: formData.get("priority") ?? "medium",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  // Property and unit come from the tenant's own active lease — never from
  // the client, so a tenant can only file issues for their own home.
  const [lease] = await db
    .select({ unitId: leases.unitId })
    .from(leases)
    .where(and(eq(leases.tenantId, tenant.id), eq(leases.status, "active")))
    .orderBy(desc(leases.startDate))
    .limit(1);
  if (!lease) {
    return { error: "You need an active lease to report an issue." };
  }

  const [unit] = await db
    .select({ propertyId: units.propertyId })
    .from(units)
    .where(eq(units.id, lease.unitId))
    .limit(1);
  if (!unit) {
    return { error: "Your unit could not be found." };
  }

  await db.insert(maintenanceRequests).values({
    propertyId: unit.propertyId,
    unitId: lease.unitId,
    tenantId: tenant.id,
    userId: session.user.id,
    title: parsed.data.title,
    description: parsed.data.description,
    status: "new",
    priority: parsed.data.priority,
  });

  revalidatePath("/portal");
  // The landlord's maintenance list and dashboard KPI show the new request.
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rent payments
// ---------------------------------------------------------------------------

/**
 * The signed-in tenant's own *active* lease for `leaseId`, or null. Everything
 * a payment needs (rent, property, unit) is derived server-side from this row.
 */
async function loadPayableLease(userId: string, leaseId: string) {
  if (!isUuid(leaseId)) return null;
  const [tenant] = await db
    .select({ id: tenants.id, email: tenants.email })
    .from(tenants)
    .where(eq(tenants.accountId, userId))
    .limit(1);
  if (!tenant) return null;
  const [lease] = await db
    .select({
      id: leases.id,
      status: leases.status,
      rentAmount: leases.rentAmount,
      unitName: units.name,
      propertyName: properties.name,
    })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(and(eq(leases.id, leaseId), eq(leases.tenantId, tenant.id)))
    .limit(1);
  if (!lease || lease.status !== "active") return null;
  return { tenant, lease };
}

/**
 * "Pay rent" via GCash — the tenant sends rent from their own GCash app to
 * the landlord's wallet, then submits the reference number from the
 * confirmation screen here. The payment is recorded with the reference in
 * its notes; the landlord verifies it against their GCash history. Repeated
 * submissions of the same reference can't create a second payment.
 */
export async function confirmGcashPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "tenant") redirect("/login");

  const leaseId = String(formData.get("leaseId") ?? "");
  const parsed = z
    .object({
      reference: z
        .string()
        .trim()
        .regex(
          /^[A-Za-z0-9-]{6,32}$/,
          "Enter the GCash reference number (6–32 letters, digits, or dashes).",
        ),
    })
    .safeParse({ reference: formData.get("reference") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid reference." };
  }

  const found = await loadPayableLease(session.user.id, leaseId);
  if (!found) return { error: "Lease not found." };

  const notes = gcashPaymentNote(parsed.data.reference);
  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.leaseId, leaseId), eq(payments.notes, notes)))
    .limit(1);
  if (!existing) {
    const ok = await recordRentPayment({
      leaseId,
      userId: session.user.id,
      amount: Number(found.lease.rentAmount),
      method: "gcash",
      notes,
    });
    if (!ok) return { error: "Payment could not be recorded." };
  }

  revalidatePath("/portal");
  // The landlord's finance page and dashboard income KPI read payments.
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/portal?payment=success");
}
