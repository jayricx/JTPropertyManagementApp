import { desc, eq, inArray, sql } from "drizzle-orm";
import { SmartphoneIcon } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  leases,
  maintenanceRequests,
  payments,
  properties,
  tenants,
  units,
  users,
} from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TenantRequestForm } from "@/components/portal/tenant-request-form";
import { LeaseSignaturesCard } from "@/components/leases/lease-signatures-card";
import { signLeaseAsTenantAction } from "@/app/(tenant)/portal/actions";
import { getLeaseSignatures } from "@/lib/signatures";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  leaseStatusLabels,
  maintenancePriorityLabels,
  maintenanceStatusLabels,
  paymentMethodLabels,
  paymentTypeLabels,
  type LeaseStatus,
  type MaintenancePriority,
  type MaintenanceStatus,
} from "@/lib/validations";

const leaseStatusClass: Record<LeaseStatus, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  upcoming:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400",
  ended: "border-border bg-muted text-muted-foreground",
};

const statusClass: Record<MaintenanceStatus, string> = {
  new: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400",
  in_progress:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
  resolved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  cancelled: "border-border bg-muted text-muted-foreground",
};

const priorityClass: Record<MaintenancePriority, string> = {
  urgent:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  high:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400",
  medium: "border-border bg-muted text-muted-foreground",
  low: "border-border bg-muted text-muted-foreground",
};

export default async function TenantPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  // The portal layout redirects unauthenticated visitors.
  if (!userId) return null;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.accountId, userId))
    .limit(1);

  if (!tenant) {
    // Access was revoked while signed in, or the roster entry was deleted.
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>No tenant profile</CardTitle>
          <CardDescription>
            This account isn&apos;t linked to a tenant anymore. Contact your
            landlord, or sign out and back in once access is restored.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [leaseRows, requestRows] = await Promise.all([
    db
      .select({
        id: leases.id,
        startDate: leases.startDate,
        endDate: leases.endDate,
        rentAmount: leases.rentAmount,
        depositAmount: leases.depositAmount,
        depositReturned: leases.depositReturned,
        status: leases.status,
        unitName: units.name,
        propertyName: properties.name,
        propertyId: properties.id,
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(leases.tenantId, tenant.id))
      .orderBy(desc(leases.startDate)),
    db
      .select({
        id: maintenanceRequests.id,
        title: maintenanceRequests.title,
        description: maintenanceRequests.description,
        status: maintenanceRequests.status,
        priority: maintenanceRequests.priority,
        createdAt: maintenanceRequests.createdAt,
        resolvedAt: maintenanceRequests.resolvedAt,
      })
      .from(maintenanceRequests)
      .where(eq(maintenanceRequests.tenantId, tenant.id))
      .orderBy(
        sql`case ${maintenanceRequests.status} when 'new' then 0 when 'in_progress' then 1 when 'resolved' then 2 else 3 end`,
        desc(maintenanceRequests.createdAt),
      ),
  ]);

  const leaseIds = leaseRows.map((l) => l.id);
  const paymentRows = leaseIds.length
    ? await db
        .select({
          id: payments.id,
          leaseId: payments.leaseId,
          amount: payments.amount,
          paidDate: payments.paidDate,
          method: payments.method,
          type: payments.type,
        })
        .from(payments)
        .where(inArray(payments.leaseId, leaseIds))
        .orderBy(desc(payments.paidDate))
    : [];

  const active = leaseRows.find((l) => l.status === "active") ?? null;
  const lastPayment = paymentRows[0] ?? null;
  const openRequests = requestRows.filter(
    (r) => r.status === "new" || r.status === "in_progress",
  ).length;

  // Signature state + the counterparty's name for the sign card.
  const [signatures, landlordName] = active
    ? await Promise.all([
        getLeaseSignatures(active.id),
        db
          .select({ name: users.name })
          .from(properties)
          .innerJoin(users, eq(properties.userId, users.id))
          .where(eq(properties.id, active.propertyId))
          .limit(1)
          .then((rows) => rows[0]?.name ?? "Your landlord"),
      ])
    : [null, "Your landlord"];

  return (
    <div className="space-y-6">
      {/* Payment result banners — from the GCash reference submission. */}
      {payment === "success" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
          Payment recorded — thank you! It is now in your payment history
          below.
        </div>
      )}
      {payment === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          We couldn&apos;t start a payment for that lease. Please try again or
          contact your landlord.
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome, {tenant.firstName}
        </h1>
        <p className="text-muted-foreground">
          Your lease, payments, and repair requests at a glance.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Current lease                                                    */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>My lease</CardTitle>
            <CardDescription>
              {active
                ? `${active.propertyName} · Unit ${active.unitName}`
                : leaseRows.length
                  ? "Your most recent lease"
                  : "No lease on file yet"}
            </CardDescription>
          </div>
          {(active ?? leaseRows[0]) && (
            <Badge
              variant="outline"
              className={leaseStatusClass[(active ?? leaseRows[0]).status]}
            >
              {leaseStatusLabels[(active ?? leaseRows[0]).status]}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {!leaseRows.length ? (
            <p className="text-sm text-muted-foreground">
              Your landlord hasn&apos;t set up a lease for you yet. Once they
              do, the details show up here.
            </p>
          ) : (
            (() => {
              const lease = active ?? leaseRows[0];
              return (
                <>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Property
                      </dt>
                      <dd className="text-sm font-medium">
                        {lease.propertyName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Unit</dt>
                      <dd className="text-sm font-medium">{lease.unitName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Period</dt>
                      <dd className="text-sm font-medium">
                        {formatDate(lease.startDate)} →{" "}
                        {lease.endDate ? formatDate(lease.endDate) : "Open-ended"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Rent</dt>
                      <dd className="text-sm font-medium">
                        {formatCurrency(lease.rentAmount)}/mo
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Security deposit
                      </dt>
                      <dd className="text-sm font-medium">
                        {Number(lease.depositAmount) > 0
                          ? `${formatCurrency(lease.depositAmount)}${
                              lease.depositReturned ? " (returned)" : ""
                            }`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  {leaseRows.length > 1 && (
                    <div className="mt-6">
                      <h3 className="mb-2 text-sm font-medium">Lease history</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Property</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaseRows.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell>{l.propertyName}</TableCell>
                              <TableCell>{l.unitName}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDate(l.startDate)} →{" "}
                                {l.endDate
                                  ? formatDate(l.endDate)
                                  : "Open-ended"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={leaseStatusClass[l.status]}
                                >
                                  {leaseStatusLabels[l.status]}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Lease signatures                                                  */}
      {/* ---------------------------------------------------------------- */}
      {active && signatures && (
        <LeaseSignaturesCard
          leaseId={active.id}
          viewer="tenant"
          signatures={signatures}
          defaultName={`${tenant.firstName} ${tenant.lastName}`.trim()}
          landlordName={landlordName}
          tenantName={`${tenant.firstName} ${tenant.lastName}`.trim()}
          action={signLeaseAsTenantAction}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Pay rent                                                         */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Pay rent</CardTitle>
          <CardDescription>
            {active
              ? `${formatCurrency(active.rentAmount)} due monthly`
              : "No active lease"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {active ? (
            <>
              <Button render={<Link href={`/portal/pay-rent/${active.id}`} />}>
                <SmartphoneIcon />
                Pay {formatCurrency(active.rentAmount)} with GCash
              </Button>
              <p>
                Send rent from your GCash app to your landlord&apos;s wallet,
                then submit the reference number to record your payment.
              </p>
              {lastPayment && (
                <p>
                  Last payment recorded: {formatCurrency(lastPayment.amount)} on{" "}
                  {formatDate(lastPayment.paidDate)}.
                </p>
              )}
            </>
          ) : (
            <p>
              You can pay rent once your landlord sets up an active lease for
              you.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Payment history                                                  */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>
            {paymentRows.length
              ? `${paymentRows.length} payment${paymentRows.length === 1 ? "" : "s"} recorded`
              : "No payments recorded yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paymentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Payments your landlord records for your leases will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.paidDate)}</TableCell>
                    <TableCell>{paymentTypeLabels[p.type]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {paymentMethodLabels[p.method]}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Maintenance                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
          <CardDescription>
            {requestRows.length
              ? `${openRequests} open · ${requestRows.length} total`
              : "Report a problem in your unit and track its status"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {active ? (
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-medium">Report an issue</h3>
              <TenantRequestForm />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You can report issues once you have an active lease.
            </p>
          )}

          {requestRows.length > 0 && (
            <ul className="divide-y">
              {requestRows.map((r) => (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.title}</p>
                    <div className="flex gap-1.5">
                      <Badge
                        variant="outline"
                        className={priorityClass[r.priority]}
                      >
                        {maintenancePriorityLabels[r.priority]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={statusClass[r.status]}
                      >
                        {maintenanceStatusLabels[r.status]}
                      </Badge>
                    </div>
                  </div>
                  {r.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reported {formatDate(r.createdAt)}
                    {r.resolvedAt && r.status === "resolved"
                      ? ` · Resolved ${formatDate(r.resolvedAt)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
