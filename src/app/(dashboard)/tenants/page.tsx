import Link from "next/link";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, tenants, units } from "@/db/schema";
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
import { DeleteTenantButton } from "@/components/tenants/delete-tenant-button";
import { accessiblePropertyIds } from "@/lib/access";
import { activePortfolioId, canManagePortfolio } from "@/lib/portfolios";

export default async function TenantsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  // The roster belongs to the portfolio: every member sees the same tenants and
  // can edit them, so the old read-only "co-owner's tenant" silo is gone.
  const portfolioId = await activePortfolioId(userId);
  const accessibleIds = await accessiblePropertyIds(userId);
  const sharedTenantIds = accessibleIds.length
    ? (
        await db
          .selectDistinct({ tenantId: leases.tenantId })
          .from(leases)
          .innerJoin(units, eq(leases.unitId, units.id))
          .where(inArray(units.propertyId, accessibleIds))
      ).map((r) => r.tenantId)
    : [];

  const rows = await db
    .select({
      id: tenants.id,
      portfolioId: tenants.portfolioId,
      firstName: tenants.firstName,
      lastName: tenants.lastName,
      email: tenants.email,
      phone: tenants.phone,
      accountId: tenants.accountId,
      // Still useful as a hint, but no longer an access decision.
      addedByYou: eq(tenants.userId, userId),
      // Postgres aggregate FILTER — active leases only.
      activeLeases: sql<number>`count(${leases.id}) filter (where ${leases.status} = 'active')`,
    })
    .from(tenants)
    .leftJoin(leases, eq(leases.tenantId, tenants.id))
    .where(
      or(
        portfolioId ? eq(tenants.portfolioId, portfolioId) : undefined,
        inArray(tenants.id, sharedTenantIds),
      ),
    )
    .groupBy(tenants.id)
    .orderBy(desc(tenants.createdAt));

  // The tenant page checks `canManagePortfolio` on the tenant's own portfolio,
  // so the roster has to agree — otherwise a viewer gets a name link that
  // 404s, which is what the old unconditional Edit button did to them.
  const managed = new Set<string>();
  for (const portfolioId of new Set(rows.map((r) => r.portfolioId))) {
    if (await canManagePortfolio(userId, portfolioId)) managed.add(portfolioId);
  }
  const canManage = (portfolioId: string) => managed.has(portfolioId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground">
            Manage tenant contact details and history.
          </p>
        </div>
        <Button render={<Link href="/tenants/new" />}>
          <PlusIcon />
          Add tenant
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No tenants yet</CardTitle>
            <CardDescription>
              Add your tenants to assign them to units and track their leases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/tenants/new" />}>
              Add your first tenant
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
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Active leases</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {/* The name is the link, not a separate "Edit" button:
                            that page is the tenant's whole record — form,
                            custom fields and portal access — so labelling it
                            "Edit" undersold it. A viewer, who can't open that
                            page, gets plain text rather than a link to a 404. */}
                        {canManage(t.portfolioId) ? (
                          <Link
                            href={`/tenants/${t.id}/edit`}
                            className="hover:underline"
                          >
                            {t.firstName} {t.lastName}
                          </Link>
                        ) : (
                          <>
                            {t.firstName} {t.lastName}
                          </>
                        )}
                        {t.accountId && (
                          <Badge variant="outline">Portal</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.activeLeases > 0 ? (
                        <Badge variant="secondary">
                          {t.activeLeases} active
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Delete stays a button in its own right: it is the one
                          action here that isn't "go look at this tenant". */}
                      <div className="flex items-center justify-end gap-1">
                        <DeleteTenantButton
                          tenantId={t.id}
                          tenantName={`${t.firstName} ${t.lastName}`}
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
