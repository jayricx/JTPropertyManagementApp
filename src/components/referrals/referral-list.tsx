import Link from "next/link";
import { DownloadIcon } from "lucide-react";
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
import type { ReferralSignup } from "@/lib/referrals";
import { formatDate } from "@/lib/utils";

/**
 * The accounts that arrived through this code. Strictly this holder's own list
 * — there is no way to render anyone else's from here, by construction.
 */
export function ReferralList({
  signups,
  csvHref,
}: {
  signups: ReferralSignup[];
  csvHref: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">
            {signups.length}{" "}
            {signups.length === 1 ? "sign-up" : "sign-ups"}
          </CardTitle>
          <CardDescription>
            Newest first. A sign-up with no units may simply be someone still
            setting up.
          </CardDescription>
        </div>
        {signups.length > 0 && (
          <Button variant="outline" size="sm" render={<Link href={csvHref} />}>
            <DownloadIcon />
            Export CSV
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {signups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. When a landlord signs up with your link they&apos;ll
            appear here with the date they joined.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signups.map((signup) => (
                <TableRow key={signup.userId}>
                  <TableCell className="font-medium">
                    {signup.name || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {signup.email}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(signup.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm capitalize">
                    {signup.plan}
                  </TableCell>
                  <TableCell className="text-sm">
                    {signup.units}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}