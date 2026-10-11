"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, tenants } from "@/db/schema";
import { tenantSchema } from "@/lib/validations";
import { syncUnitStatus } from "../leases/actions";

export type ActionState = { error: string } | null;

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

function revalidateTenantPaths() {
  revalidatePath("/tenants");
  revalidatePath("/leases");
}

export async function createTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = tenantSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid tenant data." };
  }

  await db
    .insert(tenants)
    .values({ ...parsed.data, userId: session.user.id });

  revalidateTenantPaths();
  redirect("/tenants");
}

export async function updateTenantAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const tenantId = formData.get("tenantId");
  if (typeof tenantId !== "string" || !tenantId) {
    return { error: "Missing tenant id." };
  }

  const parsed = tenantSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid tenant data." };
  }

  const updated = await db
    .update(tenants)
    .set(parsed.data)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .returning({ id: tenants.id });
  if (!updated.length) return { error: "Tenant not found." };

  revalidateTenantPaths();
  redirect("/tenants");
}

export async function deleteTenantAction(
  tenantId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const owned = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .limit(1);
  if (!owned.length) return { error: "Tenant not found." };

  // Leases reference tenants with onDelete: "cascade", so collect the units
  // they occupy first — those need their status resynced after the delete.
  const leaseUnits = await db
    .select({ unitId: leases.unitId })
    .from(leases)
    .where(eq(leases.tenantId, tenantId));

  await db.delete(tenants).where(eq(tenants.id, tenantId));

  for (const { unitId } of leaseUnits) {
    await syncUnitStatus(unitId);
  }

  revalidateTenantPaths();
  revalidatePath("/properties");
  return {};
}
