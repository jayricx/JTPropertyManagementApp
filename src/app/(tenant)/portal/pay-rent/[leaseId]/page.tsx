import { and, eq } from "drizzle-orm";
import { CreditCardIcon } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { leases, properties, tenants, units } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmDevPaymentAction } from "@/app/(tenant)/portal/actions";
import { stripeEnabled } from "@/lib/rent-payment";
import { formatCurrency, formatDate, isUuid } from "@/lib/utils";

/**
 * Local checkout confirmation shown when Stripe keys aren't configured
 * (`STRIPE_SECRET_KEY` missing). Lets the pay-rent flow be completed and
 * tested end-to-end before the Stripe account exists — in live mode this
 * route redirects away to the portal.
 */
export default async function DevPayRentPage({
  params,
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== "tenant") redirect("/login");
  if (stripeEnabled()) redirect("/portal");
  if (!isUuid(leaseId)) redirect("/portal");

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountId, session.user.id))
    .limit(1);
  if (!tenant) redirect("/portal");

  const [lease] = await db
    .select({
      status: leases.status,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      unitName: units.name,
      propertyName: properties.name,
    })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(and(eq(leases.id, leaseId), eq(leases.tenantId, tenant.id)))
    .limit(1);
  if (!lease || lease.status !== "active") redirect("/portal");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay rent</h1>
        <p className="text-muted-foreground">
          Review the details and confirm your payment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment details</CardTitle>
          <CardDescription>
            {lease.propertyName} · Unit {lease.unitName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Amount</dt>
              <dd className="text-lg font-semibold">
                {formatCurrency(lease.rentAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lease period</dt>
              <dd className="text-sm font-medium">
                {formatDate(lease.startDate)} →{" "}
                {lease.endDate ? formatDate(lease.endDate) : "Open-ended"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Type</dt>
              <dd className="text-sm font-medium">Rent</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Method</dt>
              <dd className="text-sm font-medium">Card (demo mode)</dd>
            </div>
          </dl>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
            Demo mode: Stripe keys aren&apos;t configured, so confirming below
            records the payment directly instead of charging a card. Add
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900">
              STRIPE_SECRET_KEY
            </code>
            to switch to real card payments.
          </div>

          <div className="flex gap-2">
            <form action={confirmDevPaymentAction}>
              <input type="hidden" name="leaseId" value={leaseId} />
              <Button type="submit">
                <CreditCardIcon />
                Pay {formatCurrency(lease.rentAmount)}
              </Button>
            </form>
            <Button variant="outline" render={<Link href="/portal" />}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
