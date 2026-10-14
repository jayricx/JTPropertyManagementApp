import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, properties, propertyCollaborators, units } from "@/db/schema";

/**
 * Co-ownership access helpers. A user can access a property when they own it
 * or when they've been added as a collaborator. Access has two tiers:
 *
 * - READ (all helpers below): owned, co_owner, or viewer — pages, lists, KPIs.
 * - MANAGE (`canManage*`): owned or co_owner only — every create/update/delete
 *   action funnels through those so viewers stay read-only.
 */
export type PropertyAccess = "owner" | "co_owner" | "viewer" | null;

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

/** Accessible properties (owned + co-owned) with names, for filter UIs. */
export async function listAccessibleProperties(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const ids = await accessiblePropertyIds(userId);
  if (!ids.length) return [];
  return db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(inArray(properties.id, ids))
    .orderBy(asc(properties.name));
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

// ---------------------------------------------------------------------------
// Manage tier — owner or co_owner only (viewers are excluded).
// ---------------------------------------------------------------------------

/** Property ids the user can create/update records on: owned + co-owned. */
export async function manageablePropertyIds(userId: string): Promise<string[]> {
  const [owned, shared] = await Promise.all([
    db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.userId, userId)),
    db
      .select({ propertyId: propertyCollaborators.propertyId })
      .from(propertyCollaborators)
      .where(
        and(
          eq(propertyCollaborators.userId, userId),
          eq(propertyCollaborators.role, "co_owner"),
        ),
      ),
  ]);
  return [...owned.map((r) => r.id), ...shared.map((r) => r.propertyId)];
}

/** The user's role on a property: owner, co_owner, viewer, or null. */
export async function getPropertyAccess(
  userId: string,
  propertyId: string,
): Promise<PropertyAccess> {
  const [owned, collab] = await Promise.all([
    db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
      .limit(1),
    db
      .select({ role: propertyCollaborators.role })
      .from(propertyCollaborators)
      .where(
        and(
          eq(propertyCollaborators.propertyId, propertyId),
          eq(propertyCollaborators.userId, userId),
        ),
      )
      .limit(1),
  ]);
  if (owned.length) return "owner";
  if (collab.length) return collab[0].role;
  return null;
}

/** True when the user owns or co-owns the property (viewer → false). */
export async function canManageProperty(
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
        eq(propertyCollaborators.role, "co_owner"),
      ),
    )
    .where(
      and(
        eq(properties.id, propertyId),
        or(eq(properties.userId, userId), isNotNull(propertyCollaborators.id)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** True when the unit belongs to a property the user can manage. */
export async function canManageUnit(
  userId: string,
  unitId: string,
): Promise<boolean> {
  const ids = await manageablePropertyIds(userId);
  if (!ids.length) return false;
  const rows = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), inArray(units.propertyId, ids)))
    .limit(1);
  return rows.length > 0;
}

/** True when the lease's unit belongs to a property the user can manage. */
export async function canManageLease(
  userId: string,
  leaseId: string,
): Promise<boolean> {
  const ids = await manageablePropertyIds(userId);
  if (!ids.length) return false;
  const rows = await db
    .select({ id: leases.id })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .where(and(eq(leases.id, leaseId), inArray(units.propertyId, ids)))
    .limit(1);
  return rows.length > 0;
}
