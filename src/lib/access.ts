import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, properties, units } from "@/db/schema";
import {
  activePortfolioId,
  isPortfolioOwner,
  portfolioIdsFor,
  portfoliosForUser,
} from "@/lib/portfolios";

/**
 * Access helpers. A portfolio is the bucket that owns properties, units,
 * leases and tenants; an account reaches it through `portfolio_members` with
 * a role (see `src/lib/portfolios.ts`). Access has two tiers:
 *
 * - READ (all helpers below): any member — pages, lists, KPIs.
 * - MANAGE (`canManage*`): `owner` or `co_owner` only — every create/update/
 *   delete action funnels through those so viewers stay read-only.
 *
 * Every helper below resolves through the *active* portfolio, so a user with
 * several portfolios sees one at a time and the call sites never had to
 * change. `accessiblePropertyIdsAcrossPortfolios` is the explicit escape hatch
 * for the few places that genuinely need the union.
 */
export type PropertyAccess = "owner" | "co_owner" | "viewer" | null;

const empty: string[] = [];

/** Property ids in the active portfolio — everything the user can read. */
export async function accessiblePropertyIds(userId: string): Promise<string[]> {
  const portfolioId = await activePortfolioId(userId);
  if (!portfolioId) return empty;
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.portfolioId, portfolioId));
  return rows.map((r) => r.id);
}

/**
 * Property ids across every portfolio the user belongs to. Used by the
 * portfolio switcher, invite-by-email and account-level settings — not by the
 * dashboard, which stays scoped to the active portfolio.
 */
export async function accessiblePropertyIdsAcrossPortfolios(
  userId: string,
): Promise<string[]> {
  const ids = await portfolioIdsFor(userId);
  if (!ids.length) return empty;
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(inArray(properties.portfolioId, ids));
  return rows.map((r) => r.id);
}

/** Accessible properties with names, for filter UIs. */
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

/** The portfolio that owns a property, or null when it doesn't exist. */
export async function portfolioIdForProperty(
  propertyId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ portfolioId: properties.portfolioId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  return row?.portfolioId ?? null;
}

/**
 * True when the user may delete a property: only the portfolio's owner can.
 * (Deleting a property removes units, leases and tenants with it.)
 */
export async function canDeleteProperty(
  userId: string,
  propertyId: string,
): Promise<boolean> {
  const portfolioId = await portfolioIdForProperty(propertyId);
  if (!portfolioId) return false;
  return isPortfolioOwner(userId, portfolioId);
}

/** True when the user can access any property in the active portfolio. */
export async function canAccessProperty(
  userId: string,
  propertyId: string,
): Promise<boolean> {
  const portfolioId = await activePortfolioId(userId);
  if (!portfolioId) return false;
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.portfolioId, portfolioId),
      ),
    )
    .limit(1);
  return row !== undefined;
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
    .where(and(eq(leases.id, leaseId), inArray(units.propertyId, ids)))
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Manage tier — owner or co_owner in the active portfolio (viewers excluded).
// ---------------------------------------------------------------------------

/** True when the user may edit records on this property. */
export async function canManageProperty(
  userId: string,
  propertyId: string,
): Promise<boolean> {
  const portfolioId = await activePortfolioId(userId);
  if (!portfolioId) return false;
  const role = await roleFor(userId, portfolioId);
  if (role !== "owner" && role !== "co_owner") return false;
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.portfolioId, portfolioId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Property ids in the active portfolio the user may create/update records on.
 * Every member of a portfolio can manage its properties except viewers.
 */
export async function manageablePropertyIds(userId: string): Promise<string[]> {
  const portfolioId = await activePortfolioId(userId);
  if (!portfolioId) return empty;
  const role = await roleFor(userId, portfolioId);
  if (role !== "owner" && role !== "co_owner") return empty;
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.portfolioId, portfolioId));
  return rows.map((r) => r.id);
}

/**
 * The user's role on a property — which is now just their portfolio role, the
 * portfolio being the unit of access.
 *
 * A property outside the portfolio currently in view reads as "no access" so
 * the detail page and the list can never disagree about what a user can manage.
 */
export async function getPropertyAccess(
  userId: string,
  propertyId: string,
): Promise<PropertyAccess> {
  const portfolioId = await portfolioIdForProperty(propertyId);
  if (!portfolioId) return null;
  if ((await activePortfolioId(userId)) !== portfolioId) return null;
  return roleFor(userId, portfolioId);
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

/** Internal: the role without the extra portfolio lookups the UI does. */
async function roleFor(
  userId: string,
  portfolioId: string,
): Promise<PropertyAccess> {
  const rows = await portfoliosForUser(userId);
  return rows.find((r) => r.id === portfolioId)?.role ?? null;
}