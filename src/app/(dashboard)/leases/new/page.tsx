import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties, tenants, units } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LeaseForm, type LeaseUnitOption } from "@/components/leases/lease-form";
import { manageablePropertyIds } from "@/lib/access";
import { activePortfolioId } from "@/lib/portfolios";

export default async function NewLeasePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  // Only units on properties the user can manage (owned + co-owned) can
  // receive new leases — viewers are redirected to the guidance card below.
  const manageableIds = await manageablePropertyIds(userId);
  const portfolioId = (await activePortfolioId(userId)) ?? "";

  const [tenantRows, unitRows] = await Promise.all([
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
      .where(inArray(properties.id, manageableIds))
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

  const backLink = (
    <Link
      href="/leases"
      className="inline-block text-sm text-muted-foreground hover:text-foreground"
    >
      ← Back to leases
    </Link>
  );

  // A lease needs both sides — guide the user to create what's missing.
  if (!tenantOptions.length || !unitOptions.length) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>
              {!tenantOptions.length ? "Add a tenant first" : "Add a unit first"}
            </CardTitle>
            <CardDescription>
              {!tenantOptions.length
                ? "A lease assigns a tenant to a unit, so you need at least one tenant."
                : "A lease assigns a tenant to a unit, so you need at least one property with a unit."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              render={
                <Link
                  href={!tenantOptions.length ? "/tenants/new" : "/properties"}
                />
              }
            >
              {!tenantOptions.length ? "Add tenant" : "Go to properties"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backLink}
      <LeaseForm unitOptions={unitOptions} tenantOptions={tenantOptions} />
    </div>
  );
}
