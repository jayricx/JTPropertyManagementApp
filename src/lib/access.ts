import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, properties, propertyCollaborators, units } from "@/db/schema";

/**
 * Co-ownership access helpers. A user can access a property when they own it
 * or when they've been added as a co-owner. Every multi-tenant query in the
 * app funnels through these helpers so scoping stays consistent.
 */

/** All property ids the user can access: owned + co-owned. */
export async function accessiblePropertyIds(userId: string): Promise<string[]> {
  const [owned, shared] = await Promise.all([
    db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.userId, userId)),
    db
      .select({ propertyId: propertyCollaborators.propertyId })
      .from(propertyCollaborators)
      .where(eq(propertyCollaborators.userId, userId)),
  ]);
  return [...owned.map((r) => r.id), ...shared.map((r) => r.propertyId)];
}

/** True when the user owns the property outright (not merely co-owns it). */
export async function isPropertyOwner(
  userId: string,
  propertyId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** True when the user owns the property or is a co-owner of it. */
export async function canAccessProperty(
  userId: string,
  propertyId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .leftJoin(
      propertyCollaborators,
      and(
        eq(propertyCollaborators.propertyId, properties.id),
        eq(propertyCollaborators.userId, userId),
      ),
    )
    .where(
      and(
        eq(properties.id, propertyId),
        or(
          eq(properties.userId, userId),
          isNotNull(propertyCollaborators.id),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** True when the unit belongs to a property the user can access. */
export async function canAccessUnit(
  userId: string,
  unitId: string,
): Promise<boolean> {
  const ids = await accessiblePropertyIds(userId);
  if (!ids.length) return false;
  const rows = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), inArray(units.propertyId, ids)))
    .limit(1);
  return rows.length > 0;
}

/** True when the lease's unit belongs to a property the user can access. */
export async function canAccessLease(
  userId: string,
  leaseId: string,
): Promise<boolean> {
  const ids = await accessiblePropertyIds(userId);
  if (!ids.length) return false;
  const rows = await db
    .select({ id: leases.id })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .where(
      and(eq(leases.id, leaseId), inArray(units.propertyId, ids)),
    )
    .limit(1);
  return rows.length > 0;
}
