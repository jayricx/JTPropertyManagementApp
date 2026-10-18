"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  documents,
  leaseContracts,
  leases,
  maintenanceRequests,
  payments,
  tenants,
  units,
} from "@/db/schema";
import {
  sanitizeFileName,
  validateMediaFile,
  validateMediaSelection,
} from "@/lib/attachments";
import { loadPayableLease } from "@/lib/portal-lease";
import {
  bankTransferPaymentNote,
  attachPaymentReceipts,
  gcashPaymentNote,
  recordRentPayment,
  todayPaymentDate,
} from "@/lib/rent-payment";
import { saveLeaseSignature } from "@/lib/signatures";
import { signContract } from "@/lib/contracts";
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

/**
 * Sign the contract version the landlord issued. Scoped exactly like the lease
 * signature above — the contract must belong to *this* tenant's lease, and it
 * must be one they were actually sent (never a draft, and never someone
 * else's version).
 */
export async function signContractAsTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const contractId = String(formData.get("contractId") ?? "");
  if (!isUuid(contractId)) return { error: "That contract could not be found." };

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountId, session.user.id))
    .limit(1);
  if (!tenant) return { error: "No tenant profile is linked to this account." };

  // The lease join is the gate: a contract id from another tenant's lease
  // simply doesn't come back.
  const [contract] = await db
    .select({ id: leaseContracts.id, leaseId: leaseContracts.leaseId })
    .from(leaseContracts)
    .innerJoin(leases, eq(leases.id, leaseContracts.leaseId))
    .where(
      and(
        eq(leaseContracts.id, contractId),
        eq(leases.tenantId, tenant.id),
        inArray(leaseContracts.status, ["sent", "viewed"]),
      ),
    )
    .limit(1);
  if (!contract) return { error: "That contract could not be found." };

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

  try {
    await signContract({
      contractId: contract.id,
      role: "tenant",
      signerName: parsed.data.signerName,
      method: parsed.data.method,
      signature,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Signing failed." };
  }

  revalidatePath("/portal");
  revalidatePath(`/portal/contract/${contract.leaseId}`);
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

/** One receipt photo may be attached, up to the shared media size limit. */
const MAX_RECEIPTS = 1;

/**
 * Pull the optional receipt photo out of a payment submission and check it is
 * really an image. A missing photo is fine — plenty of tenants would rather
 * just type the reference — but a bad one is reported rather than silently
 * dropped, so nobody thinks they sent evidence they didn't.
 */
function receiptPhotos(formData: FormData): File[] {
  const picked = formData
    .getAll("receipt")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (picked.length === 0) return [];

  if (picked.length > MAX_RECEIPTS) {
    throw new Error("Only one receipt photo per payment.");
  }
  const file = picked[0];
  const check = validateMediaFile(file);
  if (!check.ok) throw new Error(check.error);
  if (!file.type.startsWith("image/")) {
    throw new Error("Attach a photo of the receipt, not another file type.");
  }
  return [file];
}

/** Turn a thrown receipt error into the form's error state. */
function receiptError(error: unknown): ActionState {
  return {
    error:
      error instanceof Error
        ? error.message
        : "That receipt photo couldn't be uploaded.",
  };
}

/**
 * "Pay rent" via GCash — the tenant sends rent from their own GCash app to
 * the landlord's wallet, then submits the reference number from the
 * confirmation screen here. The submission is recorded as **pending**: it
 * shows in the tenant's payment history and in the landlord's Finance queue,
 * but does not reduce the balance (or count as income) until the landlord
 * verifies it against their GCash history. Repeated submissions of the same
 * reference can't create a second payment; a reference the landlord rejected
 * can be resubmitted, which reopens it for review.
 *
 * The amount is the lease's outstanding statement balance at submit time —
 * rent plus any sub-metered utilities and manual charges not yet covered — so
 * a utility reading billed after last month's rent is still collected.
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
  if (found.amountDue <= 0) {
    return { error: "You have no outstanding balance to pay." };
  }

  const notes = gcashPaymentNote(parsed.data.reference);
  const [existing] = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(and(eq(payments.leaseId, leaseId), eq(payments.notes, notes)))
    .limit(1);

  // Optional receipt photos, attached to whichever row ends up on file.
  let receipts: File[];
  try {
    receipts = receiptPhotos(formData);
  } catch (error) {
    return receiptError(error);
  }

  if (existing?.status === "rejected") {
    // The landlord turned this reference away — resubmitting reopens it for
    // review at the current balance instead of stacking a second payment.
    await db
      .update(payments)
      .set({
        status: "pending",
        reviewedAt: null,
        amount: found.amountDue.toFixed(2),
        paidDate: todayPaymentDate(),
      })
      .where(eq(payments.id, existing.id));
    await attachPaymentReceipts({
      paymentId: existing.id,
      leaseId,
      userId: session.user.id,
      files: receipts,
    });
  } else if (!existing) {
    const paymentId = await recordRentPayment({
      leaseId,
      userId: session.user.id,
      amount: found.amountDue,
      method: "gcash",
      notes,
      status: "pending",
    });
    if (!paymentId) return { error: "Payment could not be recorded." };
    await attachPaymentReceipts({
      paymentId,
      leaseId,
      userId: session.user.id,
      files: receipts,
    });
  }
  // An already-pending or already-verified row is the idempotent path: the
  // submission is on file, nothing new to write.

  revalidatePath("/portal");
  // The landlord's finance page and dashboard income KPI read payments.
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/portal?payment=success");
}

/**
 * "Pay rent" via bank transfer — the tenant sends rent from their own bank
 * app to one of the landlord's accounts (chosen here so the landlord knows
 * where to look), then submits the transaction reference from their
 * confirmation screen. The submission is recorded as **pending**: it shows in
 * the tenant's payment history and in the landlord's Finance queue, but does
 * not reduce the balance (or count as income) until the landlord verifies it
 * against their bank statement. The same idempotency rules as GCash apply —
 * a duplicate reference can't create a second payment, and a reference the
 * landlord rejected can be resubmitted, which reopens it for review.
 */
export async function confirmBankTransferPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const leaseId = String(formData.get("leaseId") ?? "");
  const parsed = z
    .object({
      bankAccountId: z.string().trim().uuid("Choose the account you sent to."),
      reference: z
        .string()
        .trim()
        .regex(
          /^[A-Za-z0-9-]{6,32}$/,
          "Enter the transaction reference (6–32 letters, digits, or dashes).",
        ),
    })
    .safeParse({
      bankAccountId: formData.get("bankAccountId") ?? "",
      reference: formData.get("reference") ?? "",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid submission." };
  }

  const found = await loadPayableLease(session.user.id, leaseId);
  if (!found) return { error: "Lease not found." };
  if (found.amountDue <= 0) {
    return { error: "You have no outstanding balance to pay." };
  }

  // Only the landlord's own active accounts can be named as the destination —
  // a forged id must never point the verification queue at another landlord's
  // account. `loadPayableLease` already filtered to the active ones.
  const destination = found.bankAccounts.find(
    (account) => account.id === parsed.data.bankAccountId,
  );
  if (!destination) {
    return { error: "Choose one of the landlord's bank accounts." };
  }

  const notes = bankTransferPaymentNote(parsed.data.reference);
  const [existing] = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(and(eq(payments.leaseId, leaseId), eq(payments.notes, notes)))
    .limit(1);

  // Optional receipt photo — a bank app confirmation is the easiest proof.
  let receipts: File[];
  try {
    receipts = receiptPhotos(formData);
  } catch (error) {
    return receiptError(error);
  }

  if (existing?.status === "rejected") {
    // The landlord turned this reference away — resubmitting reopens it for
    // review at the current balance (and can point at a different account)
    // instead of stacking a second payment.
    await db
      .update(payments)
      .set({
        status: "pending",
        reviewedAt: null,
        amount: found.amountDue.toFixed(2),
        paidDate: todayPaymentDate(),
        bankAccountId: destination.id,
      })
      .where(eq(payments.id, existing.id));
    await attachPaymentReceipts({
      paymentId: existing.id,
      leaseId,
      userId: session.user.id,
      files: receipts,
    });
  } else if (!existing) {
    const paymentId = await recordRentPayment({
      leaseId,
      userId: session.user.id,
      amount: found.amountDue,
      method: "bank_transfer",
      notes,
      status: "pending",
      bankAccountId: destination.id,
    });
    if (!paymentId) return { error: "Payment could not be recorded." };
    await attachPaymentReceipts({
      paymentId,
      leaseId,
      userId: session.user.id,
      files: receipts,
    });
  }
  // An already-pending or already-verified row is the idempotent path: the
  // submission is on file, nothing new to write.

  revalidatePath("/portal");
  // The landlord's finance page and dashboard income KPI read payments.
  revalidatePath("/finance");
  revalidatePath("/dashboard");
  redirect("/portal?payment=success");
}
