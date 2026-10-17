import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, properties, tenants, units, users } from "@/db/schema";
import { isUuid } from "@/lib/utils";

export interface PayableLease {
  id: string;
  startDate: Date;
  endDate: Date | null;
  /** `rent_amount` is numeric, so the driver returns it as a string. */
  rentAmount: string;
  unitName: string;
  propertyName: string;
  /** The landlord's GCash wallet, shown on the GCash method page. */
  gcashNumber: string | null;
  gcashName: string | null;
}

/**
 * The signed-in tenant account's own *active* lease for `leaseId`, or null.
 * Guards every portal pay-rent page: a tenant may only ever pay a lease that
 * belongs to them, and only while it is active. Everything a payment needs
 * (rent, property, unit, and the landlord's GCash details) is derived
 * server-side from this row — nothing comes from the client.
 */
export async function loadPayableLease(
  accountId: string,
  leaseId: string,
): Promise<PayableLease | null> {
  if (!isUuid(leaseId)) return null;

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountId, accountId))
    .limit(1);
  if (!tenant) return null;

  const [lease] = await db
    .select({
      id: leases.id,
      status: leases.status,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      unitName: units.name,
      propertyName: properties.name,
      gcashNumber: users.gcashNumber,
      gcashName: users.gcashName,
    })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .innerJoin(users, eq(properties.userId, users.id))
    .where(and(eq(leases.id, leaseId), eq(leases.tenantId, tenant.id)))
    .limit(1);
  if (!lease || lease.status !== "active") return null;

  return {
    id: lease.id,
    startDate: lease.startDate,
    endDate: lease.endDate,
    rentAmount: lease.rentAmount,
    unitName: lease.unitName,
    propertyName: lease.propertyName,
    gcashNumber: lease.gcashNumber,
    gcashName: lease.gcashName,
  };
}
