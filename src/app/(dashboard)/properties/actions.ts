"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties, units } from "@/db/schema";
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

  const updated = await db
    .update(properties)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(properties.id, id), eq(properties.userId, session.user.id)))
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

  const deleted = await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, session.user.id)))
    .returning({ id: properties.id });
  if (!deleted.length) return { error: "Property not found." };

  revalidatePath("/properties");
  return {};
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

async function ownsProperty(userId: string, propertyId: string) {
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

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
  if (!(await ownsProperty(session.user.id, propertyId))) {
    return { error: "Property not found." };
  }

  const parsed = unitSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid unit data." };
  }

  await db.insert(units).values({ ...unitDbValues(parsed.data), propertyId });

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

  // Confirm the unit belongs to a property owned by this user.
  const owned = await db
    .select({ id: units.id, propertyId: units.propertyId })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(and(eq(units.id, unitId), eq(properties.userId, session.user.id)))
    .limit(1);
  if (!owned.length) return { error: "Unit not found." };

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

  // Confirm the unit belongs to a property owned by this user before deleting.
  const owned = await db
    .select({ id: units.id, propertyId: units.propertyId })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(and(eq(units.id, unitId), eq(properties.userId, session.user.id)))
    .limit(1);
  if (!owned.length) return { error: "Unit not found." };

  await db.delete(units).where(eq(units.id, unitId));

  revalidatePath(`/properties/${owned[0].propertyId}`);
  return {};
}
