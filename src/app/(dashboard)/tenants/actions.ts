"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, maintenanceRequests, tenants, users } from "@/db/schema";
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

// ---------------------------------------------------------------------------
// Tenant portal access — the landlord grants or revokes a login for a roster
// entry. The account created here has role "tenant" and can only ever see the
// portal (the dashboard layout bounces it).
// ---------------------------------------------------------------------------

export async function grantPortalAccessAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const tenantId = formData.get("tenantId");
  if (typeof tenantId !== "string" || !tenantId) {
    return { error: "Missing tenant id." };
  }

  const password = z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(100)
    .safeParse(formData.get("password"));
  if (!password.success) {
    return { error: password.error.issues[0]?.message ?? "Invalid password." };
  }

  // Roster entries are per-landlord — only the creator may grant access.
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .limit(1);
  if (!tenant) return { error: "Tenant not found." };
  if (tenant.accountId) {
    return { error: "Portal access is already granted for this tenant." };
  }

  const email = tenant.email?.trim().toLowerCase();
  if (!email) {
    return { error: "Add an email address to the tenant first." };
  }

  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);
  if (clash.length) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password.data, 10);
  const [account] = await db
    .insert(users)
    .values({
      name: `${tenant.firstName} ${tenant.lastName}`,
      email,
      passwordHash,
      role: "tenant",
    })
    .returning({ id: users.id });

  await db
    .update(tenants)
    .set({ accountId: account.id })
    .where(eq(tenants.id, tenantId));

  revalidateTenantPaths();
  revalidatePath(`/tenants/${tenantId}/edit`);
  return null;
}

export async function revokePortalAccessAction(
  tenantId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const [tenant] = await db
    .select({ id: tenants.id, accountId: tenants.accountId })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, session.user.id)))
    .limit(1);
  if (!tenant) return { error: "Tenant not found." };
  if (!tenant.accountId) return { error: "Portal access is not granted." };

  // Maintenance requests the tenant filed reference their user row and would
  // cascade away with the account — reassign them to the landlord first.
  await db
    .update(maintenanceRequests)
    .set({ userId: session.user.id })
    .where(eq(maintenanceRequests.userId, tenant.accountId));

  await db.delete(users).where(eq(users.id, tenant.accountId));
  await db
    .update(tenants)
    .set({ accountId: null })
    .where(eq(tenants.id, tenantId));

  revalidateTenantPaths();
  revalidatePath(`/tenants/${tenantId}/edit`);
  return {};
}
