import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, properties, tenants, units } from "@/db/schema";
import { LeaseForm, type LeaseUnitOption } from "@/components/leases/lease-form";
import { accessiblePropertyIds, canAccessUnit } from "@/lib/access";
import { isUuid } from "@/lib/utils";
import type { LeaseFormValues } from "@/lib/validations";

interface EditLeasePageProps {
  params: Promise<{ id: string }>;
}

/** Format a stored date as the "YYYY-MM-DD" value `<input type="date">` wants. */
function toInputDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function EditLeasePage({ params }: EditLeasePageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  const [lease] = await db
    .select({
      id: leases.id,
      unitId: leases.unitId,
      tenantId: leases.tenantId,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      depositAmount: leases.depositAmount,
      depositReturned: leases.depositReturned,
      status: leases.status,
      notes: leases.notes,
    })
    .from(leases)
    .where(eq(leases.id, id))
    .limit(1);
  // The lease's unit must sit on a property this user can access.
  if (!lease || !(await canAccessUnit(userId, lease.unitId))) notFound();

  const accessibleIds = await accessiblePropertyIds(userId);

  const [tenantRows, unitRows] = await Promise.all([
    db
      .select({
        id: tenants.id,
        firstName: tenants.firstName,
        lastName: tenants.lastName,
      })
      .from(tenants)
      .where(eq(tenants.userId, userId))
      .orderBy(asc(tenants.lastName), asc(tenants.firstName)),
    db
      .select({
        id: units.id,
        name: units.name,
        rentAmount: units.rentAmount,
        propertyName: properties.name,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(inArray(properties.id, accessibleIds))
      .orderBy(asc(properties.name), asc(units.name)),
  ]);

  const tenantOptions = tenantRows.map((t) => ({
    id: t.id,
    label: `${t.firstName} ${t.lastName}`,
  }));
  const unitOptions: LeaseUnitOption[] = unitRows.map((u) => ({
    id: u.id,
    label: `${u.propertyName} — ${u.name}`,
    rentAmount: u.rentAmount,
  }));

  const formValues: LeaseFormValues & { id: string } = {
    id: lease.id,
    unitId: lease.unitId,
    tenantId: lease.tenantId,
    startDate: toInputDate(lease.startDate),
    endDate: toInputDate(lease.endDate),
    rentAmount: lease.rentAmount === null ? "" : Number(lease.rentAmount),
    depositAmount:
      lease.depositAmount === null ? "" : Number(lease.depositAmount),
    depositReturned: lease.depositReturned ? "on" : "",
    status: lease.status,
    notes: lease.notes ?? "",
  };

  return (
    <div className="space-y-6">
      <Link
        href="/leases"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to leases
      </Link>
      <LeaseForm
        lease={formValues}
        unitOptions={unitOptions}
        tenantOptions={tenantOptions}
      />
    </div>
  );
}
