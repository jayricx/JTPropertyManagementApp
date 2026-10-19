import { BanknoteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PayoutRow, PayoutTotals } from "@/lib/referral-payouts";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * What the referral programme owes this person, and why it isn't owed yet.
 *
 * The waiting window is explained rather than hidden. A bounty sitting at
 * "29 days" with no explanation reads like a bug; "not owed for another 29
 * days, because that's when a cancelled subscription shows up" reads like a
 * policy.
 */
export function ReferralEarnings({
  rows,
  totals,
  enabled,
  bountyAmount,
  payoutDelayDays,
}: {
  rows: PayoutRow[];
  totals: PayoutTotals;
  enabled: boolean;
  bountyAmount: number;
  payoutDelayDays: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BanknoteIcon className="size-5 text-muted-foreground" />
          What you&apos;ve earned
        </CardTitle>
        <CardDescription>
          {enabled
            ? `${formatCurrency(bountyAmount)} when a landlord you referred has their first rent payment verified — paid ${payoutDelayDays} days later, once we've seen them keep paying.`
            : "The referral bounty is paused at the moment, so nothing new is being earned."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. A bounty appears here when someone you referred is
            actually collecting rent through Renta-PH.net — not when they sign
            up, because a signup isn&apos;t a customer.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Paid to you</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(totals.paid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Owed to you</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(totals.owed)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Still waiting</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(totals.waiting)}
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="text-sm">
                    <div className="font-medium">
                      {row.referredName ?? row.referredEmail}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Earned {formatDate(row.triggeredAt)} · paid{" "}
                      {formatDate(row.payableAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatCurrency(row.amount)}
                    </span>
                    <Badge
                      variant={row.status === "paid" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {row.status === "paid"
                        ? "Paid"
                        : row.status === "voided"
                          ? "Voided"
                          : row.isPayable
                            ? "Being paid"
                            : `In ${row.daysUntilPayable}d`}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground">
              We pay by GCash or bank transfer — add the details you want to be
              paid to in Settings and we&apos;ll use them.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}