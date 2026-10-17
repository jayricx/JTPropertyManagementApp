import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, properties, tenants, units, users } from "@/db/schema";
import { getLeaseStatement, type LeaseStatement } from "@/lib/statements";
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
  /** The lease's full statement of account (rent + utilities + charges). */
  statement: LeaseStatement;
  /**
   * What the tenant should settle now: everything still outstanding
   * (`statement.outstanding`, floored at zero). Utilities are read in arrears,
   * so this naturally collects last month's reading together with this
   * month's rent instead of stranding it.
   */
  amountDue: number;
}

/**
 * The signed-in tenant account's own *active* lease for `leaseId`, or null.
 * Guards every portal pay-rent page: a tenant may only ever pay a lease that
 * belongs to them, and only while it is active. Everything a payment needs
 * (rent, utilities, property, unit, and the landlord's GCash details) is
 * derived server-side from this row — nothing comes from the client.
 *
 * The amount to collect is everything still outstanding on the statement —
 * rent, sub-metered utilities, and manual charges, less payments recorded —
 * so a tenant settles any arrears in one payment rather than stranding a
 * utility reading that was billed after the rent was already paid.
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

  const statement = await getLeaseStatement(lease.id);
  if (!statement) return null;

  return {
    id: lease.id,
    startDate: lease.startDate,
    endDate: lease.endDate,
    rentAmount: lease.rentAmount,
    unitName: lease.unitName,
    propertyName: lease.propertyName,
    gcashNumber: lease.gcashNumber,
    gcashName: lease.gcashName,
    statement,
    amountDue: Math.max(statement.outstanding, 0),
  };
}
