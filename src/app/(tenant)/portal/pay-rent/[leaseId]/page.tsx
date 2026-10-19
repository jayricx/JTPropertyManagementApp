import { redirect } from "next/navigation";
import Link from "next/link";
import { LandmarkIcon, SmartphoneIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadPayableLease } from "@/lib/portal-lease";
import { balanceComposition } from "@/lib/statements";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Rent-payment method chooser. GCash (send money + reference number) is
 * always available; bank transfer joins it once the landlord has saved an
 * account under Settings. With a single method there is no choice to make,
 * so the page forwards straight to it and the tenant never sees a
 * pointless menu.
 */
export default async function PayRentPage({
  params,
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const lease = await loadPayableLease(session.user.id, leaseId);
  if (!lease) redirect("/portal");

  // Only GCash is configured — go straight to it, exactly as before bank
  // transfer existed.
  if (lease.bankAccounts.length === 0) {
    redirect(`/portal/pay-rent/${leaseId}/gcash`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay rent</h1>
        <p className="text-muted-foreground">Choose how you&apos;d like to pay.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment details</CardTitle>
          <CardDescription>
            {lease.propertyName} · Unit {lease.unitName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                Amount due ({balanceComposition(lease.statement).label})
              </dt>
              <dd className="text-lg font-semibold">
                {formatCurrency(lease.amountDue)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lease period</dt>
              <dd className="text-sm font-medium">
                {formatDate(lease.startDate)} →{" "}
                {lease.endDate ? formatDate(lease.endDate) : "Open-ended"}
              </dd>
            </div>
          </dl>

          {lease.amountDue <= 0 ? (
            <p className="text-sm text-muted-foreground">
              You&apos;re all paid up — there&apos;s no balance to settle right
              now.
            </p>
          ) : (
            <div className="grid gap-3">
              <Button render={<Link href={`/portal/pay-rent/${leaseId}/gcash`} />}>
                <SmartphoneIcon />
                Pay with GCash
              </Button>
              <Button
                variant="outline"
                render={
                  <Link href={`/portal/pay-rent/${leaseId}/bank-transfer`} />
                }
              >
                <LandmarkIcon />
                Pay with bank transfer
              </Button>
            </div>
          )}

          <div className="border-t pt-4">
            <Button variant="ghost" render={<Link href="/portal" />}>
              Back to portal
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
