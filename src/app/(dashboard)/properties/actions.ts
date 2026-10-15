"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties, propertyCollaborators, units, users } from "@/db/schema";
import { canManageProperty, isPropertyOwner } from "@/lib/access";
import { awardXp } from "@/lib/gamification";
import { propertySchema, unitSchema, type UnitFormParsed } from "@/lib/validations";

export type ActionState = { error: string } | null;

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export async function createPropertyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = propertySchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid property data." };
  }

  const [created] = await db
    .insert(properties)
    .values({ ...parsed.data, userId: session.user.id })
    .returning({ id: properties.id });

  await awardXp(session.user.id, "property_created");
  revalidatePath("/properties");
  redirect(`/properties/${created.id}`);
}

export async function updatePropertyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing property id." };

  const parsed = propertySchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid property data." };
  }

  // Co-owners may edit the property details; viewers may not.
  if (!(await canManageProperty(session.user.id, id))) {
    return { error: "Property not found." };
  }

  const updated = await db
    .update(properties)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning({ id: properties.id });
  if (!updated.length) return { error: "Property not found." };

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

export async function deletePropertyAction(
  id: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  // Deleting cascades to units, leases, and requests — owner only.
  if (!(await canManageProperty(session.user.id, id))) {
    return { error: "Property not found." };
  }
  if (!(await isPropertyOwner(session.user.id, id))) {
    return { error: "Only the property owner can delete this property." };
  }

  const deleted = await db
    .delete(properties)
    .where(eq(properties.id, id))
    .returning({ id: properties.id });
  if (!deleted.length) return { error: "Property not found." };

  revalidatePath("/properties");
  return {};
}

// ---------------------------------------------------------------------------
// Collaborators — sharing is managed by the property owner only.
// ---------------------------------------------------------------------------

export async function addCoOwnerAction(
  propertyId: string,
  email: string,
  role: "co_owner" | "viewer" = "co_owner",
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  if (!(await isPropertyOwner(session.user.id, propertyId))) {
    return { error: "Only the property owner can manage sharing." };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { error: "Enter an email address." };
  const collaboratorRole = role === "viewer" ? "viewer" : "co_owner";

  const target = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(sql`lower(${users.email})`, normalizedEmail))
    .limit(1);
  if (!target.length) {
    return {
      error: "No account with that email. Ask them to register first.",
    };
  }
  if (target[0].id === session.user.id) {
    return { error: "You already own this property." };
  }

  const existing = await db
    .select({ id: propertyCollaborators.id })
    .from(propertyCollaborators)
    .where(
      and(
        eq(propertyCollaborators.propertyId, propertyId),
        eq(propertyCollaborators.userId, target[0].id),
      ),
    )
    .limit(1);
  if (existing.length) return { error: "That user already has access to this property." };

  await db.insert(propertyCollaborators).values({
    propertyId,
    userId: target[0].id,
    role: collaboratorRole,
    addedBy: session.user.id,
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  return {};
}

export async function removeCoOwnerAction(
  propertyId: string,
  collaboratorId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  if (!(await isPropertyOwner(session.user.id, propertyId))) {
    return { error: "Only the property owner can manage sharing." };
  }

  await db
    .delete(propertyCollaborators)
    .where(
      and(
        eq(propertyCollaborators.id, collaboratorId),
        eq(propertyCollaborators.propertyId, propertyId),
      ),
    );

  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

// Drizzle's numeric columns map to strings by default, so stringify the
// parsed decimal amounts before writing them.
function unitDbValues(data: UnitFormParsed) {
  return {
    name: data.name,
    bedrooms: data.bedrooms,
    bathrooms:
      data.bathrooms === undefined ? undefined : String(data.bathrooms),
    rentAmount:
      data.rentAmount === undefined ? undefined : String(data.rentAmount),
    sqft: data.sqft,
    status: data.status,
    notes: data.notes,
  };
}

export async function createUnitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const propertyId = formData.get("propertyId");
  if (typeof propertyId !== "string" || !propertyId) {
    return { error: "Missing property id." };
  }
  if (!(await canManageProperty(session.user.id, propertyId))) {
    return { error: "Property not found." };
  }

  const parsed = unitSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid unit data." };
  }

  await db.insert(units).values({ ...unitDbValues(parsed.data), propertyId });

  await awardXp(session.user.id, "unit_created");
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}

export async function updateUnitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const unitId = formData.get("unitId");
  if (typeof unitId !== "string" || !unitId) return { error: "Missing unit id." };

  // Confirm the unit belongs to a property this user can manage
  // (owned or co-owned — not a read-only viewer) before updating.
  const owned = await db
    .select({ id: units.id, propertyId: units.propertyId })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);
  if (
    !owned.length ||
    !(await canManageProperty(session.user.id, owned[0].propertyId))
  ) {
    return { error: "Unit not found." };
  }

  const parsed = unitSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid unit data." };
  }

  await db
    .update(units)
    .set({ ...unitDbValues(parsed.data), updatedAt: new Date() })
    .where(eq(units.id, unitId));

  revalidatePath(`/properties/${owned[0].propertyId}`);
  redirect(`/properties/${owned[0].propertyId}`);
}

export async function deleteUnitAction(
  unitId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  // Confirm the unit belongs to a property this user can manage before
  // deleting.
  const owned = await db
    .select({ id: units.id, propertyId: units.propertyId })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);
  if (
    !owned.length ||
    !(await canManageProperty(session.user.id, owned[0].propertyId))
  ) {
    return { error: "Unit not found." };
  }

  await db.delete(units).where(eq(units.id, unitId));

  revalidatePath(`/properties/${owned[0].propertyId}`);
  return {};
}
