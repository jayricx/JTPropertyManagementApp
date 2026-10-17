"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, maintenanceRequests, paymentCheckouts, payments, properties, tenants, units } from "@/db/schema";
import { documents } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import {
  sanitizeFileName,
  validateMediaFile,
  validateMediaSelection,
} from "@/lib/attachments";
import { pesosToCentavos } from "@/lib/payments/money";
import { createCheckoutSession, paymongoEnabled } from "@/lib/payments/paymongo";
import { gcashPaymentNote, recordRentPayment } from "@/lib/rent-payment";
import { saveLeaseSignature } from "@/lib/signatures";
import { isUuid } from "@/lib/utils";
import { leaseSignatureSchema, tenantRequestSchema } from "@/lib/validations";

/** `ok` lets the form reset itself after a successful submission. */
export type ActionState = { error?: string; ok?: boolean } | null;

/**
 * Sign the tenant's own lease. Same attestation flow as the landlord
 * side, but scoped to a lease that belongs to this tenant account.
 */
export async function signLeaseAsTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const leaseId = String(formData.get("leaseId") ?? "");
  if (!isUuid(leaseId)) return { error: "That lease could not be found." };

  // Access follows the linked profile, not the account role — an owner who
  // rents from another owner signs here as their own tenant.
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountId, session.user.id))
    .limit(1);
  if (!tenant) return { error: "No tenant profile is linked to this account." };

  const [lease] = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.id, leaseId), eq(leases.tenantId, tenant.id)))
    .limit(1);
  if (!lease) return { error: "That lease does not belong to you." };

  const parsed = leaseSignatureSchema.safeParse({
    signerName: formData.get("signerName"),
    method: formData.get("method"),
    drawnSignature: formData.get("drawnSignature") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid signature." };
  }
  if (formData.get("attestation") !== "on") {
    return { error: "Tick the agreement box to sign." };
  }

  const signature =
    parsed.data.method === "typed"
      ? parsed.data.signerName
      : (parsed.data.drawnSignature ?? "");
  if (!signature) return { error: "Draw your signature before signing." };

  await saveLeaseSignature({
    leaseId,
    role: "tenant",
    signerName: parsed.data.signerName,
    method: parsed.data.method,
    signature,
  });

  // The landlord watches the lease page for the tenant's mark.
  revalidatePath("/portal");
  revalidatePath("/leases");
  return { ok: true };
}

export async function createTenantRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  // The profile lookup below is the real gate: only a linked tenant can file
  // an issue, whatever the account's primary role is.
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

  const media = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  for (const file of media) {
    const check = validateMediaFile(file);
    if (!check.ok) return { error: check.error };
  }
  const selection = validateMediaSelection(media);
  if (!selection.ok) return { error: selection.error };

  const [created] = await db
    .insert(maintenanceRequests)
    .values({
      propertyId: unit.propertyId,
      unitId: lease.unitId,
      tenantId: tenant.id,
      userId: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: "new",
      priority: parsed.data.priority,
    })
    .returning({ id: maintenanceRequests.id });

  // Attachments are best-effort: a failed photo must not swallow the
  // report the tenant just filed.
  for (const file of media) {
    try {
      const id = crypto.randomUUID();
      const bytes = Buffer.from(await file.arrayBuffer());
      await db.insert(documents).values({
        id,
        userId: session.user.id,
        maintenanceRequestId: created.id,
        propertyId: unit.propertyId,
        unitId: lease.unitId,
        name: sanitizeFileName(file.name),
        url: `/api/documents/${id}`,
        type: file.type,
        sizeBytes: bytes.byteLength,
        data: bytes.toString("base64"),
      });
    } catch {
      console.error("[portal] attachment failed", file.name);
    }
  }

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
  if (!session?.user) redirect("/login");

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

/** `url` is where the client should send the tenant to complete card payment. */
export type CardCheckoutState = { error?: string; url?: string } | null;

/**
 * Start a card rent payment. Creates a hosted checkout session with the
 * gateway and returns its URL for the client to redirect to. The payment is
 * *not* recorded here — only the gateway's webhook can confirm a real charge
 * (see `/api/payments/paymongo/webhook`). A matching `paymentCheckouts` row is
 * written first so the webhook has something to reconcile against.
 */
export async function startCardCheckoutAction(
  _prev: CardCheckoutState,
  formData: FormData,
): Promise<CardCheckoutState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!paymongoEnabled()) {
    return { error: "Card payments aren't available right now." };
  }

  const leaseId = String(formData.get("leaseId") ?? "");
  const found = await loadPayableLease(session.user.id, leaseId);
  if (!found) return { error: "Lease not found." };
  const { lease } = found;

  const amountCentavos = pesosToCentavos(lease.rentAmount);
  if (amountCentavos <= 0) {
    return { error: "This lease has no rent amount to charge." };
  }

  const referenceNumber = randomUUID();
  const origin = appUrl();
  const returnPath = `${origin}/portal/pay-rent/${leaseId}/card`;

  let checkout;
  try {
    checkout = await createCheckoutSession({
      amountCentavos,
      lineItemName: `Rent — ${lease.propertyName} Unit ${lease.unitName}`,
      description: `Rent for ${lease.propertyName}, Unit ${lease.unitName}`,
      referenceNumber,
      successUrl: `${returnPath}?status=success`,
      cancelUrl: `${returnPath}?status=cancel`,
    });
  } catch (error) {
    console.error("[paymongo] could not create checkout session", error);
    return { error: "Could not start the card payment. Please try again." };
  }

  await db.insert(paymentCheckouts).values({
    leaseId,
    tenantAccountId: session.user.id,
    provider: "paymongo",
    providerRef: checkout.id,
    referenceNumber,
    amountCentavos,
    status: "pending",
  });

  revalidatePath(`/portal/pay-rent/${leaseId}/card`);
  return { url: checkout.checkoutUrl };
}
