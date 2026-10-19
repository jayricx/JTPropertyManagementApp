import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Building2, InboxIcon, UsersIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
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
import { landlordAccounts, planBreakdown, tenantAccountCount } from "@/lib/admin";
import { PLAN_PRICES } from "@/lib/plans";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Landlord accounts — Renta-PH.net" };

/**
 * Operator view of the landlord accounts and what they're on.
 *
 * There is no billing behind this yet — `users.plan` is set by hand — so the
 * useful column isn't the plan name but the usage against the cap, which is
 * who is one upgrade away from paying.
 */
export default async function AdminLandlordsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  const [account, landlords, breakdown, tenants] = await Promise.all([
    db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0]),
    landlordAccounts(),
    planBreakdown(),
    tenantAccountCount(),
  ]);

  if (!account?.isAdmin) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <UsersIcon className="size-6 text-primary" />
            Landlord accounts
          </h1>
          <p className="text-muted-foreground">
            Every landlord, what they&apos;re on, and how much of their unit
            allowance they&apos;re using.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/feedback/inbox" />}>
          <InboxIcon />
          Request inbox
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {breakdown.map((tier) => (
          <Card key={tier.plan}>
            <CardHeader className="pb-2">
              <CardDescription>{tier.label}</CardDescription>
              <CardTitle className="text-2xl">{tier.accounts}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {PLAN_PRICES[tier.plan].monthly === 0
                ? "Free forever"
                : `₱${PLAN_PRICES[tier.plan].monthly}/month`}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Landlords</CardTitle>
          <CardDescription>
            {landlords.length} landlord account{landlords.length === 1 ? "" : "s"}
            , plus {tenants} tenant account{tenants === 1 ? "" : "s"} on the
            portal. Plans are set by hand while billing is off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {landlords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No landlord accounts yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Landlord</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Units used</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {landlords.map((landlord) => (
                  <TableRow key={landlord.id}>
                    <TableCell>
                      <div className="font-medium">
                        {landlord.name || landlord.email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {landlord.email}
                        {landlord.isAdmin && (
                          <Badge variant="secondary" className="ml-2">
                            Operator
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          landlord.plan === "free" ? "outline" : "secondary"
                        }
                      >
                        {landlord.plan === "free" ? "Free" : `₱${PLAN_PRICES[landlord.plan].monthly}`}
                      </Badge>
                      <span className="ml-2 text-xs capitalize text-muted-foreground">
                        {landlord.plan}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {landlord.unitCount}
                          {landlord.unitLimit !== null
                            ? ` / ${landlord.unitLimit}`
                            : ""}
                        </span>
                        {landlord.atLimit && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-700 dark:text-amber-400"
                          >
                            at cap
                          </Badge>
                        )}
                      </div>
                      {landlord.unitLimit !== null && (
                        <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={
                              landlord.atLimit
                                ? "h-full bg-amber-500"
                                : "h-full bg-primary"
                            }
                            style={{ width: `${Math.round(landlord.usageRatio * 100)}%` }}
                          />
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {landlord.portfolioCount === 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3.5" />
                          none yet
                        </span>
                      ) : (
                        <>
                          {landlord.portfolioCount} portfolio
                          {landlord.portfolioCount === 1 ? "" : "s"} ·{" "}
                          {landlord.propertyCount} propert
                          {landlord.propertyCount === 1 ? "y" : "ies"}
                          {landlord.memberCount > 1
                            ? ` · ${landlord.memberCount} members`
                            : ""}
                        </>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(landlord.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}