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
import { ContractStatusCard } from "@/components/leases/contract-status-card";
import { StatementTable } from "@/components/leases/statement-table";
import { signLeaseAction } from "@/app/(dashboard)/leases/actions";
import { accessiblePropertyIds, canManageUnit } from "@/lib/access";
import { activeContract, completedContract } from "@/lib/contracts";
import { activePortfolioId, roleInPortfolio } from "@/lib/portfolios";
import {
  definitionsFor,
  parseCustomFields,
} from "@/lib/custom-fields";
import { CustomFieldsCard } from "@/components/custom-fields/custom-fields-card";
import { getLeaseStatement } from "@/lib/statements";
import { getLeaseSignatures } from "@/lib/signatures";
import { currentMonthKey, isUuid, listMonths, shiftMonth } from "@/lib/utils";
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

  // The tenant dropdown lists the portfolio's roster.
  const portfolioId = (await activePortfolioId(userId)) ?? "";

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
      customFields: leases.customFields,
    })
    .from(leases)
    .where(eq(leases.id, id))
    .limit(1);
  // The lease's unit must sit on a property this user can access.
  // Viewers may look at leases but not edit them.
  if (!lease || !(await canManageUnit(userId, lease.unitId))) notFound();

  // The lease's portfolio (through its unit's property) owns its custom
  // fields, and decides who may define versus only fill them in.
  const [leasePortfolio] = await db
    .select({ portfolioId: properties.portfolioId })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(eq(units.id, lease.unitId))
    .limit(1);
  const leasePortfolioId = leasePortfolio?.portfolioId ?? "";
  const [leaseRole, leaseFieldDefs] = await Promise.all([
    roleInPortfolio(userId, leasePortfolioId),
    definitionsFor(leasePortfolioId, "lease"),
  ]);
  const leaseFieldValues = parseCustomFields(lease.customFields);
  const canManage = leaseRole === "owner" || leaseRole === "co_owner";
  const canDefine = leaseRole === "owner";

  const accessibleIds = await accessiblePropertyIds(userId);

  const [
    tenantRows,
    unitRows,
    signatures,
    landlordRows,
    leaseTenantRows,
    noteRows,
    attachmentRows,
    statement,
    openContract,
    signedContract,
  ] = await Promise.all([
    db
      .select({
        id: tenants.id,
        firstName: tenants.firstName,
        lastName: tenants.lastName,
      })
      .from(tenants)
      .where(eq(tenants.portfolioId, portfolioId))
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
      getLeaseStatement(lease.id),
    activeContract(lease.id),
    completedContract(lease.id),
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

  // Charge months: the past year plus the coming month, newest first.
  const nowMonth = currentMonthKey();
  const chargeMonthOptions = listMonths(
    shiftMonth(nowMonth, -11),
    shiftMonth(nowMonth, 1),
  ).reverse();

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
      <CustomFieldsCard
        entity="lease"
        targetId={lease.id}
        definitions={leaseFieldDefs}
        values={leaseFieldValues}
        canEdit={canManage}
        canDefine={canDefine}
      />
      {statement && (
        <StatementTable statement={statement} canManage monthOptions={chargeMonthOptions} />
      )}
      <ContractStatusCard
        leaseId={lease.id}
        open={openContract}
        signed={signedContract}
      />
      {/* One signing surface per lease. Once a contract exists it's the thing
          being signed, so the bare lease signature card stands down rather than
          offering a second, version-less mark beside it. */}
      {!openContract && !signedContract && (
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
      )}
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
