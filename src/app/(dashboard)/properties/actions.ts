"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties, units } from "@/db/schema";
import {
  accessiblePropertyIds,
  canDeleteProperty,
  canManageProperty,
  portfolioIdForProperty,
} from "@/lib/access";
import { awardXp } from "@/lib/gamification";
import { ensurePortfolioForUser } from "@/lib/portfolios";
import {
  suggestRentForUnit,
  type RentSuggestion,
} from "@/lib/rent-insights";
import { isUuid } from "@/lib/utils";
import { propertySchema, unitSchema, type UnitFormParsed } from "@/lib/validations";
import { getPortfolioUsage, type PlanUsage } from "@/lib/plan-usage";

export type ActionState = { error: string } | null;
export type UnitActionState = { error: string } | { upgrade: PlanUsage } | null;

/**
 * Read-only: a rent suggestion for a unit, or for a new unit in a property,
 * built from comparable units this landlord already rents out. Returns null
 * when there is nothing to compare against.
 */
export async function suggestRentAction(input: {
  unitId?: string;
  propertyId?: string;
}): Promise<RentSuggestion | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (input.unitId && !isUuid(input.unitId)) return null;
  if (input.propertyId && !isUuid(input.propertyId)) return null;

  // Checked in SQL so a crafted id can never pull another landlord's
  // comparables into the answer.
  const accessible = await accessiblePropertyIds(userId);

  if (input.unitId) {
    const [unit] = await db
      .select({
        id: units.id,
        propertyId: units.propertyId,
        city: properties.city,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(units.id, input.unitId),
          inArray(properties.id, accessible.length ? accessible : [""]),
        ),
      )
      .limit(1);
    if (!unit) return null;
    return suggestRentForUnit({ unitId: unit.id });
  }

  if (input.propertyId && accessible.includes(input.propertyId)) {
    return suggestRentForUnit({ propertyId: input.propertyId });
  }
  return null;
}

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

  // Every property belongs to a portfolio; the first one is provisioned
  // silently so a solo owner never has to think about it.
  const portfolioId = await ensurePortfolioForUser(session.user.id);

  const [created] = await db
    .insert(properties)
    .values({ ...parsed.data, portfolioId })
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

  // Deleting cascades to units, leases, and requests — portfolio owner only.
  if (!(await canDeleteProperty(session.user.id, id))) {
    return { error: "Only the portfolio owner can delete this property." };
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
    sqm: data.sqm,
    status: data.status,
    notes: data.notes,
  };
}

export async function createUnitAction(
  _prev: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
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

  // The unit lands in a portfolio, so the quota that applies is the one that
  // pays for it: the portfolio owner's plan, not the co-owner's own.
  const portfolioId = await portfolioIdForProperty(propertyId);
  const usage = await getPortfolioUsage(portfolioId ?? "");
  if (usage.atLimit && usage.limit !== null) {
    return { upgrade: usage };
  }

  await db.insert(units).values({ ...unitDbValues(parsed.data), propertyId });

  await awardXp(session.user.id, "unit_created");
  revalidatePath(`/properties/${propertyId}`);
  redirect(`/properties/${propertyId}`);
}

export async function updateUnitAction(
  _prev: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
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
