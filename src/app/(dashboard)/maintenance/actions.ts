"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { maintenanceRequests, tenants, units, documents } from "@/db/schema";
import { canManageProperty } from "@/lib/access";
import { canManagePortfolio } from "@/lib/portfolios";
import { awardXp } from "@/lib/gamification";
import { maintenanceSchema, type MaintenanceFormParsed } from "@/lib/validations";
import { validateMediaFile, validateMediaSelection, sanitizeFileName } from "@/lib/attachments";

/** `ok` lets dialog forms close themselves after a successful mutation. */
export type ActionState = { error?: string; ok?: boolean } | null;

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

/** Confirm the property is manageable (owned or co-owned — not a viewer) and the unit is in it. */
async function ownsTargets(
  userId: string,
  propertyId: string,
  unitId: string,
): Promise<boolean> {
  if (!(await canManageProperty(userId, propertyId))) return false;
  const rows = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.propertyId, propertyId)))
    .limit(1);
  return rows.length > 0;
}

/** The tenant roster is shared by the whole portfolio (owner or co-owner). */
async function ownsTenant(userId: string, tenantId: string) {
  const [row] = await db
    .select({ portfolioId: tenants.portfolioId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row ? canManagePortfolio(userId, row.portfolioId) : false;
}

/** Attach uploaded photos/videos to a maintenance request, best-effort. */
async function attachMedia(
  requestId: string,
  propertyId: string,
  unitId: string,
  userId: string,
  formData: FormData,
): Promise<string | null> {
  const media = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (media.length === 0) return null;

  for (const file of media) {
    const check = validateMediaFile(file);
    if (!check.ok) return check.error;
  }
  const selection = validateMediaSelection(media);
  if (!selection.ok) return selection.error;

  for (const file of media) {
    try {
      const id = crypto.randomUUID();
      const bytes = Buffer.from(await file.arrayBuffer());
      await db.insert(documents).values({
        id,
        userId,
        maintenanceRequestId: requestId,
        propertyId,
        unitId,
        name: sanitizeFileName(file.name),
        url: `/api/documents/${id}`,
        type: file.type,
        sizeBytes: bytes.byteLength,
        data: bytes.toString("base64"),
      });
    } catch {
      console.error("[maintenance] attachment failed", file.name);
    }
  }
  return null;
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

  const [created] = await db.insert(maintenanceRequests).values({
    ...maintenanceDbValues(parsed.data),
    userId: session.user.id,
    // Stamping resolvedAt here lets requests be created as already resolved.
    resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
  }).returning({ id: maintenanceRequests.id });

  const attachError = await attachMedia(
    created.id,
    parsed.data.propertyId,
    parsed.data.unitId,
    session.user.id,
    formData,
  );
  if (attachError) {
    // Request was created; only the photos failed. Surface the error but don't
    // lose the report.
    revalidatePath("/maintenance");
    revalidatePath("/dashboard");
    return { error: attachError, ok: true };
  }

  await awardXp(session.user.id, "maintenance_created");
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

  // Requests on shared properties are visible to owner and co-owner alike,
  // so update rights follow property manage access (viewers excluded).
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
    !(await canManageProperty(session.user.id, existing.propertyId))
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

  // Attach any newly picked photos/videos (best-effort).
  await attachMedia(
    requestId,
    parsed.data.propertyId,
    parsed.data.unitId,
    session.user.id,
    formData,
  );

  // Reward actually fixing things — only on the new→resolved transition.
  if (isResolved && !wasResolved) {
    await awardXp(session.user.id, "maintenance_resolved");
  }

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
    !(await canManageProperty(session.user.id, existing.propertyId))
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
