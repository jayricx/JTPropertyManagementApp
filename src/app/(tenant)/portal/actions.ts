"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, maintenanceRequests, tenants, units } from "@/db/schema";
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
