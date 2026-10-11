"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { maintenanceRequests, tenants, units } from "@/db/schema";
import { canAccessProperty } from "@/lib/access";
import { maintenanceSchema, type MaintenanceFormParsed } from "@/lib/validations";

/** `ok` lets dialog forms close themselves after a successful mutation. */
export type ActionState = { error?: string; ok?: boolean } | null;

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

/** Confirm the property is accessible (owned or co-owned) and the unit is in it. */
async function ownsTargets(
  userId: string,
  propertyId: string,
  unitId: string,
): Promise<boolean> {
  if (!(await canAccessProperty(userId, propertyId))) return false;
  const rows = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.propertyId, propertyId)))
    .limit(1);
  return rows.length > 0;
}

async function ownsTenant(userId: string, tenantId: string) {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

function maintenanceDbValues(data: MaintenanceFormParsed) {
  return {
    propertyId: data.propertyId,
    unitId: data.unitId,
    tenantId: data.tenantId,
    title: data.title,
    description: data.description,
    status: data.status,
    priority: data.priority,
    cost: data.cost === undefined ? null : String(data.cost),
  };
}

export async function createMaintenanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = maintenanceSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid request data.",
    };
  }

  if (
    !(await ownsTargets(
      session.user.id,
      parsed.data.propertyId,
      parsed.data.unitId,
    ))
  ) {
    return { error: "Property or unit not found." };
  }
  if (parsed.data.tenantId && !(await ownsTenant(session.user.id, parsed.data.tenantId))) {
    return { error: "Tenant not found." };
  }

  await db.insert(maintenanceRequests).values({
    ...maintenanceDbValues(parsed.data),
    userId: session.user.id,
    // Stamping resolvedAt here lets requests be created as already resolved.
    resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
  });

  revalidatePath("/maintenance");
  revalidatePath("/dashboard"); // open-requests KPI
  return { ok: true };
}

export async function updateMaintenanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) {
    return { error: "Missing request id." };
  }

  // Requests on co-owned properties are visible to both partners, so update
  // rights follow property access rather than who created the request.
  const [existing] = await db
    .select({
      id: maintenanceRequests.id,
      status: maintenanceRequests.status,
      propertyId: maintenanceRequests.propertyId,
    })
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.id, requestId))
    .limit(1);
  if (
    !existing ||
    !(await canAccessProperty(session.user.id, existing.propertyId))
  ) {
    return { error: "Request not found." };
  }

  const parsed = maintenanceSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid request data.",
    };
  }

  if (
    !(await ownsTargets(
      session.user.id,
      parsed.data.propertyId,
      parsed.data.unitId,
    ))
  ) {
    return { error: "Property or unit not found." };
  }
  if (parsed.data.tenantId && !(await ownsTenant(session.user.id, parsed.data.tenantId))) {
    return { error: "Tenant not found." };
  }

  // Stamp resolvedAt when a request becomes resolved; clear it when it
  // leaves the resolved state. Keep the original stamp if it stays resolved.
  const wasResolved = existing.status === "resolved";
  const isResolved = parsed.data.status === "resolved";
  const resolvedAt =
    isResolved && !wasResolved
      ? new Date()
      : !isResolved && wasResolved
        ? null
        : undefined; // unchanged — omitted from the UPDATE set

  await db
    .update(maintenanceRequests)
    .set({
      ...maintenanceDbValues(parsed.data),
      ...(resolvedAt !== undefined ? { resolvedAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(maintenanceRequests.id, requestId));

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteMaintenanceAction(
  requestId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const [existing] = await db
    .select({
      id: maintenanceRequests.id,
      propertyId: maintenanceRequests.propertyId,
    })
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.id, requestId))
    .limit(1);
  if (
    !existing ||
    !(await canAccessProperty(session.user.id, existing.propertyId))
  ) {
    return { error: "Request not found." };
  }

  await db
    .delete(maintenanceRequests)
    .where(eq(maintenanceRequests.id, requestId))
    .returning({ id: maintenanceRequests.id });

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return {};
}
