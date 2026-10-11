import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, properties, tenants, units } from "@/db/schema";
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
import { DeleteLeaseButton } from "@/components/leases/delete-lease-button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { leaseStatusLabels, type LeaseStatus } from "@/lib/validations";

const leaseStatusClass: Record<LeaseStatus, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  upcoming:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400",
  ended: "border-border bg-muted text-muted-foreground",
};

export default async function LeasesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  const rows = await db
    .select({
      id: leases.id,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      depositAmount: leases.depositAmount,
      depositReturned: leases.depositReturned,
      status: leases.status,
      tenantName: sql<string>`concat(${tenants.firstName}, ' ', ${tenants.lastName})`,
      unitName: units.name,
      propertyName: properties.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(eq(properties.userId, userId))
    // Active first, then upcoming, then ended — newest start within each.
    .orderBy(
      sql`case ${leases.status} when 'active' then 0 when 'upcoming' then 1 else 2 end`,
      desc(leases.startDate),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leases</h1>
          <p className="text-muted-foreground">
            Track lease terms, deposits, and renewal dates.
          </p>
        </div>
        <Button render={<Link href="/leases/new" />}>
          <PlusIcon />
          Add lease
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No leases yet</CardTitle>
            <CardDescription>
              Assign a tenant to a unit to start tracking lease terms. Active
              leases automatically mark their unit as occupied.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/leases/new" />}>
              Add your first lease
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right">Deposit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.tenantName}</TableCell>
                    <TableCell>
                      <div>{l.unitName}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.propertyName}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(l.startDate)} →{" "}
                      {l.endDate ? formatDate(l.endDate) : "Open-ended"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(l.rentAmount)}/mo
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(l.depositAmount) > 0 ? (
                        <>
                          {formatCurrency(l.depositAmount)}
                          {l.depositReturned && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (returned)
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={leaseStatusClass[l.status]}>
                        {leaseStatusLabels[l.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<Link href={`/leases/${l.id}/edit`}>Edit</Link>}
                        />
                        <DeleteLeaseButton
                          leaseId={l.id}
                          leaseLabel={`${l.tenantName} — ${l.unitName}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
