"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, maintenanceRequests, payments, properties, tenants, units } from "@/db/schema";
import {
  DEMO_PAYMENT_NOTE,
  recordRentPayment,
  stripeEnabled,
  todayPaymentDate,
} from "@/lib/rent-payment";
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
 * "Pay rent" — form action from the portal. With Stripe keys configured it
 * creates a Checkout Session and redirects to Stripe (the webhook records the
 * payment); without keys it redirects to the local confirm page so the flow
 * works end-to-end in development.
 */
export async function startRentPaymentAction(formData: FormData): Promise<void> {
  const leaseId = String(formData.get("leaseId") ?? "");
  const session = await auth();
  if (!session?.user || session.user.role !== "tenant") redirect("/login");

  const found = await loadPayableLease(session.user.id, leaseId);
  if (!found) redirect("/portal?payment=error");
  const { tenant, lease } = found;

  if (stripeEnabled()) {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const cents = Math.round(Number(lease.rentAmount) * 100);
    if (cents <= 0) redirect("/portal?payment=error");

    const appUrl = process.env.AUTH_URL ?? "http://localhost:3000";
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: tenant.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "php",
            unit_amount: cents,
            product_data: {
              name: `Rent — ${lease.propertyName} · Unit ${lease.unitName}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { leaseId, tenantId: tenant.id, userId: session.user.id },
      client_reference_id: leaseId,
      success_url: `${appUrl}/portal?payment=success`,
      cancel_url: `${appUrl}/portal?payment=cancelled`,
    });
    if (!checkout.url) redirect("/portal?payment=error");
    redirect(checkout.url);
  }

  redirect(`/portal/pay-rent/${leaseId}`);
}

/**
 * Confirm a payment on the local (no-Stripe) checkout page. Records one rent
 * payment per lease per day — a double-clicked submit can't duplicate it.
 */
export async function confirmDevPaymentAction(formData: FormData): Promise<void> {
  const leaseId = String(formData.get("leaseId") ?? "");
  const session = await auth();
  if (!session?.user || session.user.role !== "tenant") redirect("/login");
  // Live mode never renders the local checkout page.
  if (stripeEnabled()) redirect("/portal");

  const found = await loadPayableLease(session.user.id, leaseId);
  if (!found) redirect("/portal?payment=error");

  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.leaseId, leaseId),
        eq(payments.notes, DEMO_PAYMENT_NOTE),
        eq(payments.paidDate, todayPaymentDate()),
      ),
    )
    .limit(1);
  if (!existing) {
    const ok = await recordRentPayment({
      leaseId,
      userId: session.user.id,
      amount: Number(found.lease.rentAmount),
      notes: DEMO_PAYMENT_NOTE,
    });
    if (!ok) redirect("/portal?payment=error");
  }

  revalidatePath("/portal");
  // The landlord's finance page and dashboard income KPI read payments.
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/portal?payment=success");
}
