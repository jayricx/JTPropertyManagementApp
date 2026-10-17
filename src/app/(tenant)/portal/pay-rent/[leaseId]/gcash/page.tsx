import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GcashReferenceForm } from "@/components/portal/gcash-reference-form";
import { loadPayableLease } from "@/lib/portal-lease";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * GCash rent payment: shows the landlord's wallet details and the amount to
 * send, then collects the reference number from the tenant's GCash
 * confirmation screen. The tenant pays in their own GCash app — no merchant
 * account or gateway is involved.
 */
export default async function GcashPayPage({
  params,
}: {
  params: Promise<{ leaseId: string }>;
}) {
  const { leaseId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const lease = await loadPayableLease(session.user.id, leaseId);
  if (!lease) redirect("/portal");

  const hasGcashDetails = Boolean(lease.gcashNumber);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay rent with GCash</h1>
        <p className="text-muted-foreground">
          Send rent from your GCash app, then submit the reference number below.
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
          </dl>

          {hasGcashDetails ? (
            <>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">
                  Send exactly this amount to
                </p>
                <p className="mt-1 text-xl font-bold tracking-wide">
                  {lease.gcashNumber}
                </p>
                {lease.gcashName && (
                  <p className="text-sm text-muted-foreground">
                    {lease.gcashName}
                  </p>
                )}
              </div>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                <li>
                  Open your GCash app and tap <strong>Send Money</strong>.
                </li>
                <li>
                  Enter the number above and exactly{" "}
                  {formatCurrency(lease.rentAmount)}.
                </li>
                <li>
                  On the confirmation screen, copy the{" "}
                  <strong>reference number</strong>.
                </li>
                <li>Submit it below to record your payment.</li>
              </ol>
            </>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
              Your landlord hasn&apos;t added their GCash number yet. Ask them
              for their GCash details before sending your payment.
            </div>
          )}

          <div className="border-t pt-4">
            <GcashReferenceForm leaseId={leaseId} />
          </div>

          <Button
            variant="ghost"
            render={<Link href={`/portal/pay-rent/${leaseId}`} />}
          >
            Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
