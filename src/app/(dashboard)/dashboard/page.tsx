import { auth } from "@/auth";
import { db } from "@/db/client";
import { and, count, eq, gte, inArray, or, sum } from "drizzle-orm";
import { Building2, KeyRound, Wallet, Wrench } from "lucide-react";
import {
  leases,
  maintenanceRequests,
  payments,
  properties,
  units,
} from "@/db/schema";
import { accessiblePropertyIds } from "@/lib/access";
import { getGamificationOverview } from "@/lib/gamification";
import { formatCurrency } from "@/lib/utils";
import { GamificationPanel } from "@/components/gamification/gamification-panel";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

interface DashboardStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  incomeThisMonth: number;
  openRequests: number;
}

async function getStats(userId: string): Promise<DashboardStats> {
  const firstOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );

  // Every KPI covers the whole portfolio the user can see: owned properties
  // plus properties shared with them as co-owner.
  const propertyIds = await accessiblePropertyIds(userId);

  const [totalProperties, totalUnits, occupiedUnits, incomeResult, openRequests] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(properties)
        .where(inArray(properties.id, propertyIds)),
      db
        .select({ value: count() })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(inArray(properties.id, propertyIds)),
      db
        .select({ value: count() })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(inArray(properties.id, propertyIds), eq(units.status, "occupied")),
        ),
      // Own payments (including unassigned ones) plus anything recorded on
      // an accessible property by a co-owner.
      db
        .select({ value: sum(payments.amount) })
        .from(payments)
        .leftJoin(leases, eq(payments.leaseId, leases.id))
        .leftJoin(units, eq(leases.unitId, units.id))
        .leftJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(
            or(
              eq(payments.userId, userId),
              inArray(properties.id, propertyIds),
            ),
            gte(payments.paidDate, firstOfMonth),
            // Pending tenant submissions aren't income yet.
            eq(payments.status, "paid"),
          ),
        ),
      db
        .select({ value: count() })
        .from(maintenanceRequests)
        .where(
          and(
            inArray(maintenanceRequests.propertyId, propertyIds),
            inArray(maintenanceRequests.status, ["new", "in_progress"]),
          ),
        ),
    ]);

  return {
    totalProperties: totalProperties[0].value,
    totalUnits: totalUnits[0].value,
    occupiedUnits: occupiedUnits[0].value,
    incomeThisMonth: incomeResult[0].value ? Number(incomeResult[0].value) : 0,
    openRequests: openRequests[0].value,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const [stats, gamification] = session?.user
    ? await Promise.all([
        getStats(session.user.id),
        getGamificationOverview(session.user.id),
      ])
    : [null, null];

  const occupancy =
    stats && stats.totalUnits > 0
      ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back,{" "}
          {session?.user?.name?.split(" ")[0] ?? "landlord"}. Here&apos;s your
          portfolio at a glance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Properties"
          value={String(stats?.totalProperties ?? 0)}
          sub={`${stats?.totalUnits ?? 0} total units`}
          tone="primary"
        />
        <StatCard
          icon={KeyRound}
          label="Occupancy"
          value={`${occupancy}%`}
          sub={`${stats?.occupiedUnits ?? 0} of ${stats?.totalUnits ?? 0} units rented`}
          tone="teal"
        />
        <StatCard
          icon={Wallet}
          label="Income this month"
          value={formatCurrency(stats?.incomeThisMonth ?? 0)}
          sub="Rent collected so far"
          tone="gold"
        />
        <StatCard
          icon={Wrench}
          label="Open requests"
          value={String(stats?.openRequests ?? 0)}
          sub="New + in progress"
          tone="rose"
        />
      </div>

      {gamification && stats && stats.totalProperties > 0 && (
        <GamificationPanel overview={gamification} />
      )}

      {stats && stats.totalProperties === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Add your first property to see live stats here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/properties/new">
              <Button>Add your first property</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
