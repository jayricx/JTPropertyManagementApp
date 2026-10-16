import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  documents,
  leaseNotes,
  leases,
  properties,
  tenants,
  units,
  users,
} from "@/db/schema";
import { LeaseForm, type LeaseUnitOption } from "@/components/leases/lease-form";
import { LeaseAttachmentsCard } from "@/components/leases/lease-attachments-card";
import { LeaseNotesCard } from "@/components/leases/lease-notes-card";
import { LeaseSignaturesCard } from "@/components/leases/lease-signatures-card";
import { signLeaseAction } from "@/app/(dashboard)/leases/actions";
import { accessiblePropertyIds, canManageUnit } from "@/lib/access";
import { getLeaseSignatures } from "@/lib/signatures";
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
  // Viewers may look at leases but not edit them.
  if (!lease || !(await canManageUnit(userId, lease.unitId))) notFound();

  const accessibleIds = await accessiblePropertyIds(userId);

  const [
    tenantRows,
    unitRows,
    signatures,
    landlordRows,
    leaseTenantRows,
    noteRows,
    attachmentRows,
  ] = await Promise.all([
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
      getLeaseSignatures(lease.id),
      db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      // The lease's tenant may belong to a co-owner rather than this user.
      db
        .select({
          firstName: tenants.firstName,
          lastName: tenants.lastName,
        })
        .from(tenants)
        .where(eq(tenants.id, lease.tenantId))
        .limit(1),
      db
        .select({
          id: leaseNotes.id,
          body: leaseNotes.body,
          createdAt: leaseNotes.createdAt,
          userId: leaseNotes.userId,
          authorName: users.name,
        })
        .from(leaseNotes)
        .innerJoin(users, eq(leaseNotes.userId, users.id))
        .where(eq(leaseNotes.leaseId, lease.id))
        .orderBy(desc(leaseNotes.createdAt)),
      db
        .select({
          id: documents.id,
          name: documents.name,
          type: documents.type,
          sizeBytes: documents.sizeBytes,
          createdAt: documents.createdAt,
          userId: documents.userId,
          uploadedBy: users.name,
        })
        .from(documents)
        .innerJoin(users, eq(documents.userId, users.id))
        .where(eq(documents.leaseId, lease.id))
        .orderBy(desc(documents.createdAt)),
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
      <LeaseSignaturesCard
        leaseId={lease.id}
        viewer="landlord"
        signatures={signatures}
        defaultName={landlordRows[0]?.name ?? ""}
        landlordName={landlordRows[0]?.name ?? "Landlord"}
        tenantName={
          leaseTenantRows[0]
            ? `${leaseTenantRows[0].firstName} ${leaseTenantRows[0].lastName}`
            : "Tenant"
        }
        action={signLeaseAction}
        signedHref={`/leases/${lease.id}/signed`}
      />
      <LeaseNotesCard
        leaseId={lease.id}
        notes={noteRows.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.authorName ?? "Someone",
          createdAt: n.createdAt,
          isMine: n.userId === userId,
        }))}
      />
      <LeaseAttachmentsCard
        leaseId={lease.id}
        attachments={attachmentRows.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          sizeBytes: d.sizeBytes,
          uploadedBy: d.uploadedBy ?? "Someone",
          createdAt: d.createdAt,
          isMine: d.userId === userId,
        }))}
      />
    </div>
  );
}
