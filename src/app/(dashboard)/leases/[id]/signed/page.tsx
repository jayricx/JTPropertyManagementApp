import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, properties, tenants, units } from "@/db/schema";
import { SignatureDisplay } from "@/components/leases/signature-display";
import { PrintButton } from "@/components/leases/print-button";
import { canManageUnit } from "@/lib/access";
import { getLeaseSignatures } from "@/lib/signatures";
import { formatCurrency, formatDate, isUuid } from "@/lib/utils";

interface SignedLeasePageProps {
  params: Promise<{ id: string }>;
}

/**
 * Print-ready copy of a signed lease — the page a landlord prints or saves
 * as PDF when a counterparty wants something on paper. Only reachable once
 * both parties have signed; the print button hides the app chrome.
 */
export default async function SignedLeasePage({ params }: SignedLeasePageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [lease] = await db
    .select({
      id: leases.id,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      depositAmount: leases.depositAmount,
      status: leases.status,
      unitId: leases.unitId,
      tenantId: leases.tenantId,
    })
    .from(leases)
    .where(eq(leases.id, id))
    .limit(1);
  if (!lease || !(await canManageUnit(userId, lease.unitId))) notFound();

  const [tenantRows, unitRows, signatures] = await Promise.all([
    db
      .select({
        firstName: tenants.firstName,
        lastName: tenants.lastName,
        email: tenants.email,
      })
      .from(tenants)
      .where(eq(tenants.id, lease.tenantId))
      .limit(1),
    db
      .select({ name: units.name, propertyName: properties.name })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(units.id, lease.unitId))
      .limit(1),
    getLeaseSignatures(lease.id),
  ]);

  // A lease is only "signed" once both parties have put a mark on it.
  if (!signatures.landlord || !signatures.tenant) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Lease not signed</h1>
        <p className="text-muted-foreground">
          Both the landlord and the tenant need to sign before a signed copy can
          be shown.
        </p>
      </div>
    );
  }

  const signedOn = [signatures.landlord.signedAt, signatures.tenant.signedAt]
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1)!;

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Signed lease</h1>
          <p className="text-muted-foreground">
            {unitRows[0]?.propertyName} · Unit {unitRows[0]?.name}
          </p>
        </div>
        <PrintButton />
      </div>

      <article className="space-y-6 rounded-lg border bg-card p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="space-y-1 border-b pb-4">
          <h2 className="text-xl font-semibold">Lease agreement</h2>
          <p className="text-sm text-muted-foreground">
            {unitRows[0]?.propertyName} — Unit {unitRows[0]?.name}
          </p>
        </header>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Tenant</dt>
            <dd className="font-medium">
              {tenantRows[0] ? `${tenantRows[0].firstName} ${tenantRows[0].lastName}` : "—"}
            </dd>
            {tenantRows[0]?.email && (
              <dd className="text-sm text-muted-foreground">{tenantRows[0].email}</dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Lease term</dt>
            <dd className="font-medium">
              {formatDate(lease.startDate)} →{" "}
              {lease.endDate ? formatDate(lease.endDate) : "Open-ended"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Monthly rent</dt>
            <dd className="font-medium">{formatCurrency(lease.rentAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Security deposit</dt>
            <dd className="font-medium">{formatCurrency(lease.depositAmount)}</dd>
          </div>
        </dl>

        <section className="grid gap-6 border-t pt-6 sm:grid-cols-2">
          {(["landlord", "tenant"] as const).map((role) => {
            const signature = signatures[role]!;
            return (
              <div key={role} className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {role === "landlord" ? "Landlord" : "Tenant"}
                </p>
                <SignatureDisplay signature={signature} />
                <div className="border-t pt-2 text-sm">
                  <p className="font-medium">{signature.signerName}</p>
                  <p className="text-xs text-muted-foreground">
                    Signed {formatDate(signature.signedAt)} ·{" "}
                    {signature.method === "typed" ? "typed" : "drawn"} signature
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        <p className="border-t pt-4 text-xs text-muted-foreground">
          Signed electronically via JT Property Management on{" "}
          {formatDate(signedOn)}. Each party agreed that their electronic
          signature is the legal equivalent of a handwritten one.
        </p>
      </article>
    </div>
  );
}