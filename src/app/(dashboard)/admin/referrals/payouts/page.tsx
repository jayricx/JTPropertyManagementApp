import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeftIcon, BanknoteIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { PayoutControls } from "@/components/referrals/payout-controls";
import { PayoutSettleButtons } from "@/components/referrals/payout-settle-buttons";
import { Badge } from "@/components/ui/badge";
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
import {
  allPayoutTotals,
  programSettings,
  allPayouts,
} from "@/lib/referral-payouts";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Referral payouts — Renta-PH.net" };

/**
 * What the referral programme owes, and the switch that stops it owing more.
 *
 * The first card is the one that matters: *owed* is real money leaving the
 * business, and it is the number that should be impossible to miss on this
 * page. Everything else is bookkeeping in service of it.
 */
export default async function AdminPayoutsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [account] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account?.isAdmin) notFound();

  const [settings, totals, rows] = await Promise.all([
    programSettings(),
    allPayoutTotals(),
    allPayouts(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/referrals"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          All referral codes
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BanknoteIcon className="size-6 text-primary" />
          Referral payouts
        </h1>
        <p className="text-muted-foreground">
          A fixed bounty when a landlord you referred has their first rent
          payment verified. Not at signup — a signup isn&apos;t a customer.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Owed now</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totals.owed)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Past the delay, not yet paid
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Still waiting</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totals.waiting)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Inside the {settings.payoutDelayDays}-day delay
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid out</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totals.paid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lifetime earned</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totals.earned)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            across {rows.length} referral{rows.length === 1 ? "" : "s"}
          </CardContent>
        </Card>
      </div>

      <PayoutControls
        enabled={settings.enabled}
        bountyAmount={settings.bountyAmount}
        payoutDelayDays={settings.payoutDelayDays}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length === 0 ? "No bounties yet" : "All bounties"}
          </CardTitle>
          <CardDescription>
            Newest first. Only one bounty per referred landlord, ever.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              A bounty appears here the first time a referred landlord verifies
              a rent payment. That hasn&apos;t happened yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referred landlord</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-mono text-xs">
                        {row.affiliateCode}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.affiliateName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {row.referredName ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.referredEmail}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCurrency(row.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.triggeredAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.status === "pending"
                        ? row.isPayable
                          ? "Now"
                          : `in ${row.daysUntilPayable}d`
                        : formatDate(row.payableAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "paid"
                            ? "default"
                            : row.status === "voided"
                              ? "secondary"
                              : row.isPayable
                                ? "default"
                                : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {row.status === "paid"
                          ? "Paid"
                          : row.status === "voided"
                            ? "Voided"
                            : row.isPayable
                              ? "Owed"
                              : "Waiting"}
                      </Badge>
                      {row.payoutMethod && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.payoutMethod}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.status === "pending" && (
                        <PayoutSettleButtons
                          payoutId={row.id}
                          isPayable={row.isPayable}
                        />
                      )}
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