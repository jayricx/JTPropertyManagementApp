"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, tenants, units } from "@/db/schema";
import { canAccessUnit } from "@/lib/access";
import { leaseSchema, type LeaseFormParsed } from "@/lib/validations";

export type ActionState = { error: string } | null;

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

// Unit access (owned or co-owned) is checked via `canAccessUnit`.

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

  if (!(await canAccessUnit(session.user.id, parsed.data.unitId))) {
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

  // Confirm the lease's unit is on a property this user can access
  // (owned or co-owned) before touching anything.
  const owned = await db
    .select({ id: leases.id, unitId: leases.unitId, endDate: leases.endDate })
    .from(leases)
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!owned.length || !(await canAccessUnit(session.user.id, owned[0].unitId))) {
    return { error: "Lease not found." };
  }

  const parsed = leaseSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lease data." };
  }

  if (!(await canAccessUnit(session.user.id, parsed.data.unitId))) {
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
    !(await canAccessUnit(session.user.id, owned[0].unitId))
  ) {
    return { error: "Lease not found." };
  }

  await db.delete(leases).where(eq(leases.id, leaseId));
  await syncUnitStatus(owned[0].unitId);

  revalidateLeasePaths();
  return {};
}
