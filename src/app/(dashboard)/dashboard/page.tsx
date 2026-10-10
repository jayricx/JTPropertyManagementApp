import { auth } from "@/auth";
import { db } from "@/db/client";
import { and, count, eq, gte, inArray, sum } from "drizzle-orm";
import { Building2, KeyRound, Wallet, Wrench } from "lucide-react";
import { maintenanceRequests, payments, properties, units } from "@/db/schema";
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

  const [totalProperties, totalUnits, occupiedUnits, incomeResult, openRequests] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(properties)
        .where(eq(properties.userId, userId)),
      db
        .select({ value: count() })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(eq(properties.userId, userId)),
      db
        .select({ value: count() })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(eq(properties.userId, userId), eq(units.status, "occupied")),
        ),
      db
        .select({ value: sum(payments.amount) })
        .from(payments)
        .where(
          and(eq(payments.userId, userId), gte(payments.paidDate, firstOfMonth)),
        ),
      db
        .select({ value: count() })
        .from(maintenanceRequests)
        .where(
          and(
            eq(maintenanceRequests.userId, userId),
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
  const stats = session?.user ? await getStats(session.user.id) : null;

  const formatCurrency = (value: number) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

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
        />
        <StatCard
          icon={KeyRound}
          label="Occupancy"
          value={`${occupancy}%`}
          sub={`${stats?.occupiedUnits ?? 0} of ${stats?.totalUnits ?? 0} units rented`}
        />
        <StatCard
          icon={Wallet}
          label="Income this month"
          value={formatCurrency(stats?.incomeThisMonth ?? 0)}
          sub="Rent collected so far"
        />
        <StatCard
          icon={Wrench}
          label="Open requests"
          value={String(stats?.openRequests ?? 0)}
          sub="New + in progress"
        />
      </div>

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
