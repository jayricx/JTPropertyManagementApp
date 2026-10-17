import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2Icon, InfoIcon, XCircleIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { paymentCheckouts } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardCheckoutButton } from "@/components/portal/card-checkout-button";
import { cardCheckoutEnabled } from "@/lib/payments/provider";
import { loadPayableLease } from "@/lib/portal-lease";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Card rent payment. The tenant is handed off to the gateway's hosted page,
 * then returns here. The charge is only ever confirmed by the gateway webhook,
 * so the return page may briefly say "confirming" before it reads as paid.
 */
export default async function CardPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ leaseId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { leaseId } = await params;
  const { status } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const lease = await loadPayableLease(session.user.id, leaseId);
  if (!lease) redirect("/portal");
  if (!cardCheckoutEnabled()) redirect(`/portal/pay-rent/${leaseId}`);

  const [latest] = await db
    .select({
      status: paymentCheckouts.status,
      paidAt: paymentCheckouts.paidAt,
    })
    .from(paymentCheckouts)
    .where(
      and(
        eq(paymentCheckouts.leaseId, leaseId),
        eq(paymentCheckouts.tenantAccountId, session.user.id),
      ),
    )
    .orderBy(desc(paymentCheckouts.createdAt))
    .limit(1);

  const paid = latest?.status === "paid";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay rent by card</h1>
        <p className="text-muted-foreground">
          You&apos;ll finish on PayMongo&apos;s secure page, then come back here.
        </p>
      </div>

      {status === "success" &&
        (paid ? (
          <Banner tone="success" icon={<CheckCircle2Icon />}>
            Payment received. A receipt is on its way to your email.
          </Banner>
        ) : (
          <Banner tone="info" icon={<InfoIcon />}>
            Thanks! We&apos;re confirming the payment with your bank. It will
            show as paid here in a moment — you can safely refresh this page.
          </Banner>
        ))}

      {status === "cancel" && (
        <Banner tone="warning" icon={<XCircleIcon />}>
          Payment cancelled. No charge was made — you can try again below.
        </Banner>
      )}

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

          {paid && latest?.paidAt && (
            <p className="text-sm text-muted-foreground">
              Last payment confirmed {formatDate(latest.paidAt)}.
            </p>
          )}

          <div className="border-t pt-4">
            <CardCheckoutButton leaseId={leaseId} />
          </div>

          <p className="text-xs text-muted-foreground">
            Prefer to avoid card fees? You can also{" "}
            <Link
              href={`/portal/pay-rent/${leaseId}/gcash`}
              className="underline underline-offset-2"
            >
              pay via GCash
            </Link>
            .
          </p>

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

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "success" | "info" | "warning";
  icon: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  } as const;

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${tones[tone]}`}
    >
      <span className="mt-0.5 [&>svg]:size-4">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
