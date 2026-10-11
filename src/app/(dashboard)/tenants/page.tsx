import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, tenants } from "@/db/schema";
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

export default async function TenantsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  const rows = await db
    .select({
      id: tenants.id,
      firstName: tenants.firstName,
      lastName: tenants.lastName,
      email: tenants.email,
      phone: tenants.phone,
      // Postgres aggregate FILTER — active leases only.
      activeLeases: sql<number>`count(${leases.id}) filter (where ${leases.status} = 'active')`,
    })
    .from(tenants)
    .leftJoin(leases, eq(leases.tenantId, tenants.id))
    .where(eq(tenants.userId, userId))
    .groupBy(tenants.id)
    .orderBy(desc(tenants.createdAt));

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
                      {t.firstName} {t.lastName}
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={
                            <Link href={`/tenants/${t.id}/edit`}>
                              Edit
                            </Link>
                          }
                        />
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
