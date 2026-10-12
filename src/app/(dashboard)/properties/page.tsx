import Link from "next/link";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties, propertyCollaborators, units } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { accessiblePropertyIds } from "@/lib/access";
import { formatCurrency } from "@/lib/utils";
import { propertyTypeLabels } from "@/lib/validations";

export default async function PropertiesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  // Owned properties plus properties shared with this user as co-owner.
  const accessibleIds = await accessiblePropertyIds(userId);

  const rows = accessibleIds.length
    ? await db
        .select({
          id: properties.id,
          name: properties.name,
          address: properties.address,
          city: properties.city,
          state: properties.state,
          country: properties.country,
          type: properties.type,
          ownerId: properties.userId,
          unitCount: count(units.id),
          // Postgres aggregate FILTER — occupied units only.
          occupiedCount: sql<string>`count(${units.id}) filter (where ${units.status} = 'occupied')`,
          rentRoll: sql<string>`coalesce(sum(${units.rentAmount}), 0)`,
        })
        .from(properties)
        .leftJoin(units, eq(units.propertyId, properties.id))
        .where(inArray(properties.id, accessibleIds))
        .groupBy(properties.id)
        .orderBy(desc(properties.createdAt))
    : [];

  // This user's collaborator roles, to badge shared properties as
  // "Co-owned" vs read-only "Viewer".
  const collabRoleRows = await db
    .select({
      propertyId: propertyCollaborators.propertyId,
      role: propertyCollaborators.role,
    })
    .from(propertyCollaborators)
    .where(eq(propertyCollaborators.userId, userId));
  const roleByProperty = new Map(
    collabRoleRows.map((r) => [r.propertyId, r.role]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">
            Manage your properties and their units.
          </p>
        </div>
        <Button render={<Link href="/properties/new" />}>
          <PlusIcon />
          Add property
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No properties yet</CardTitle>
            <CardDescription>
              Add your first property to start tracking units, tenants, and
              income.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/properties/new" />}>
              Add your first property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => {
            const addressLine =
              [p.address, p.city, p.state, p.country]
                .filter(Boolean)
                .join(", ") || "No address on file";
            const occupied = Number(p.occupiedCount ?? 0);
            const occupancy =
              p.unitCount > 0 ? Math.round((occupied / p.unitCount) * 100) : 0;
            const isCoOwned = p.ownerId !== userId;

            return (
              <Link key={p.id} href={`/properties/${p.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-ring/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {p.name}
                      </CardTitle>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isCoOwned && (
                          <Badge variant="outline">
                            {roleByProperty.get(p.id) === "viewer"
                              ? "Viewer"
                              : "Co-owned"}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="capitalize">
                          {propertyTypeLabels[p.type]}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {addressLine}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="flex items-center justify-between text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Units
                        </dt>
                        <dd className="font-semibold">{p.unitCount}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-muted-foreground">
                          Occupied
                        </dt>
                        <dd className="font-semibold">{occupancy}%</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-muted-foreground">
                          Rent roll
                        </dt>
                        <dd className="font-semibold">
                          {formatCurrency(p.rentRoll)}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
