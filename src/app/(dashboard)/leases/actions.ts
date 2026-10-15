"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, tenants, units } from "@/db/schema";
import { canManageUnit } from "@/lib/access";
import { awardXp } from "@/lib/gamification";
import { saveLeaseSignature } from "@/lib/signatures";
import { isUuid } from "@/lib/utils";
import {
  leaseSchema,
  leaseSignatureSchema,
  type LeaseFormParsed,
} from "@/lib/validations";

export type ActionState = { error: string } | null;

/** Shape for the signature form (landlord + tenant sides share it). */
export type SignatureFormState = { error?: string; ok?: boolean } | null;

/**
 * Sign a lease as the landlord. Typed signatures store the name; drawn
 * ones a PNG data URL. The attestation box is required — that is what
 * makes this an electronic signature rather than a scribble.
 */
export async function signLeaseAction(
  _prev: SignatureFormState,
  formData: FormData,
): Promise<SignatureFormState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "landlord") {
    return { error: "Only landlord accounts can sign here." };
  }

  const leaseId = String(formData.get("leaseId") ?? "");
  if (!isUuid(leaseId)) return { error: "That lease could not be found." };

  const [lease] = await db
    .select({ unitId: leases.unitId })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!lease || !(await canManageUnit(session.user.id, lease.unitId))) {
    return { error: "You cannot sign this lease." };
  }

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
    role: "landlord",
    signerName: parsed.data.signerName,
    method: parsed.data.method,
    signature,
  });

  revalidatePath(`/leases/${leaseId}/edit`);
  revalidatePath(`/leases/${leaseId}/signed`);
  revalidatePath("/leases");
  return { ok: true };
}

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

/**
 * Keep a unit's status in sync with its leases: an active lease means the
 * unit is occupied; without one it goes back to vacant. Units in maintenance
 * are left alone either way — the landlord manages that status manually.
 */
export async function syncUnitStatus(unitId: string): Promise<void> {
  const active = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.unitId, unitId), eq(leases.status, "active")))
    .limit(1);

  if (active.length) {
    await db
      .update(units)
      .set({ status: "occupied", updatedAt: new Date() })
      .where(
        and(
          eq(units.id, unitId),
          inArray(units.status, ["vacant", "occupied"]),
        ),
      );
  } else {
    await db
      .update(units)
      .set({ status: "vacant", updatedAt: new Date() })
      .where(and(eq(units.id, unitId), eq(units.status, "occupied")));
  }
}

// Unit manage access (owned or co-owned — viewers excluded) is checked via
// `canManageUnit`.

async function ownsTenant(userId: string, tenantId: string) {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** A unit can only hold one active lease at a time. */
async function hasActiveLease(unitId: string, exceptLeaseId?: string) {
  const rows = await db
    .select({ id: leases.id })
    .from(leases)
    .where(and(eq(leases.unitId, unitId), eq(leases.status, "active")))
    .limit(5);
  return rows.some((r) => r.id !== exceptLeaseId);
}

// Drizzle's numeric columns map to strings by default, so stringify the
// parsed decimal amounts before writing them. Date columns (mode: "date")
// want Date objects — parse the "YYYY-MM-DD" strings as UTC midnights so
// the stored calendar day always matches what the user picked.
function leaseDbValues(data: LeaseFormParsed) {
  return {
    unitId: data.unitId,
    tenantId: data.tenantId,
    startDate: new Date(`${data.startDate}T00:00:00Z`),
    // null (not undefined) so clearing the end date actually persists —
    // Drizzle skips undefined keys in .set()/.values().
    endDate: data.endDate ? new Date(`${data.endDate}T00:00:00Z`) : null,
    rentAmount: String(data.rentAmount ?? 0),
    depositAmount: String(data.depositAmount ?? 0),
    depositReturned: data.depositReturned === "on",
    status: data.status,
    notes: data.notes,
  };
}

function revalidateLeasePaths() {
  revalidatePath("/leases");
  revalidatePath("/tenants");
  revalidatePath("/properties");
}

export async function createLeaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = leaseSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lease data." };
  }

  if (!(await canManageUnit(session.user.id, parsed.data.unitId))) {
    return { error: "Unit not found." };
  }
  if (!(await ownsTenant(session.user.id, parsed.data.tenantId))) {
    return { error: "Tenant not found." };
  }
  if (
    parsed.data.status === "active" &&
    (await hasActiveLease(parsed.data.unitId))
  ) {
    return { error: "This unit already has an active lease." };
  }

  await db.insert(leases).values(leaseDbValues(parsed.data));
  await syncUnitStatus(parsed.data.unitId);

  await awardXp(session.user.id, "lease_created");
  revalidateLeasePaths();
  redirect("/leases");
}

export async function updateLeaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const leaseId = formData.get("leaseId");
  if (typeof leaseId !== "string" || !leaseId) {
    return { error: "Missing lease id." };
  }

  // Confirm the lease's unit is on a property this user can manage
  // (owned or co-owned — not a read-only viewer) before touching anything.
  const owned = await db
    .select({ id: leases.id, unitId: leases.unitId, endDate: leases.endDate })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!owned.length || !(await canManageUnit(session.user.id, owned[0].unitId))) {
    return { error: "Lease not found." };
  }

  const parsed = leaseSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lease data." };
  }

  if (!(await canManageUnit(session.user.id, parsed.data.unitId))) {
    return { error: "Unit not found." };
  }
  if (!(await ownsTenant(session.user.id, parsed.data.tenantId))) {
    return { error: "Tenant not found." };
  }
  if (
    parsed.data.status === "active" &&
    (await hasActiveLease(parsed.data.unitId, leaseId))
  ) {
    return { error: "This unit already has an active lease." };
  }

  // Moving the end date re-arms the lease-end reminder email — the old
  // "already reminded" stamp would otherwise suppress it forever.
  const newEndDate = parsed.data.endDate
    ? new Date(`${parsed.data.endDate}T00:00:00Z`)
    : null;
  const endDateChanged =
    (owned[0].endDate?.getTime() ?? null) !== (newEndDate?.getTime() ?? null);

  await db
    .update(leases)
    .set({
      ...leaseDbValues(parsed.data),
      ...(endDateChanged ? { leaseEndReminderSentAt: null } : {}),
    })
    .where(eq(leases.id, leaseId));

  // The unit may have changed — resync both the old and the new unit.
  await syncUnitStatus(owned[0].unitId);
  if (parsed.data.unitId !== owned[0].unitId) {
    await syncUnitStatus(parsed.data.unitId);
  }

  revalidateLeasePaths();
  redirect("/leases");
}

export async function deleteLeaseAction(
  leaseId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const owned = await db
    .select({ id: leases.id, unitId: leases.unitId })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (
    !owned.length ||
    !(await canManageUnit(session.user.id, owned[0].unitId))
  ) {
    return { error: "Lease not found." };
  }

  await db.delete(leases).where(eq(leases.id, leaseId));
  await syncUnitStatus(owned[0].unitId);

  revalidateLeasePaths();
  return {};
}
