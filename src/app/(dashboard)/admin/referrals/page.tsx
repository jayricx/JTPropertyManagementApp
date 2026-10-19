import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { GiftIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ReferralPauseButton } from "@/components/referrals/referral-pause-button";
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
import { allAffiliates, referralTotals } from "@/lib/referrals";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Referral codes — Renta-PH.net" };

/**
 * Every code and what it brought in.
 *
 * This is the view that makes spam visible: a code with a lot of sign-ups and
 * none of them doing anything is the shape of someone posting links into groups.
 * That's why signups and units sit next to each other.
 */
export default async function AdminReferralsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [account] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account?.isAdmin) notFound();

  const [rows, totals] = await Promise.all([
    allAffiliates(),
    referralTotals(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GiftIcon className="size-6 text-primary" />
          Referral codes
        </h1>
        <p className="text-muted-foreground">
          Attribution only — nothing is discounted and nobody is paid. This is
          for spotting links being used for spam.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Codes</CardDescription>
            <CardTitle className="text-2xl">{totals.codes}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totals.active} active · {totals.paused} paused
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Attributed sign-ups</CardDescription>
            <CardTitle className="text-2xl">{totals.referred}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            of {totals.accounts} accounts
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Share of sign-ups</CardDescription>
            <CardTitle className="text-2xl">
              {totals.accounts === 0
                ? "—"
                : `${Math.round((totals.referred / totals.accounts) * 100)}%`}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All codes</CardTitle>
          <CardDescription>
            Sorted by sign-ups. A high count with no units is usually a spammer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No codes yet. Every landlord gets one when their account is created.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Sign-ups</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">
                      {row.code}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {row.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.ownerEmail}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{row.signups}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "active" ? "default" : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      <ReferralPauseButton
                        affiliateId={row.id}
                        code={row.code}
                        paused={row.status === "paused"}
                        pausedReason={row.pausedReason}
                      />
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