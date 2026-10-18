import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { LightbulbIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { FeatureRequestForm } from "@/components/feedback/feature-request-form";
import { RequestStatusBadge } from "@/components/feedback/request-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CATEGORY_LABELS,
  MAX_OPEN_REQUESTS,
  STATUS_HELP,
  openRequestCount,
  requestsForUser,
} from "@/lib/feature-requests";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Feedback — Renta-PH" };

export default async function FeedbackPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors
  if (session.user.role !== "landlord") notFound();

  const [requests, open] = await Promise.all([
    requestsForUser(userId),
    openRequestCount(userId),
  ]);

  const [account] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const isAdmin = account?.isAdmin ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <LightbulbIcon className="size-6 text-primary" />
            Feedback
          </h1>
          {isAdmin && (
            <Button variant="outline" size="sm" render={<Link href="/feedback/inbox" />}>
              Request inbox
            </Button>
          )}
        </div>
        <p className="mt-1 text-muted-foreground">
          Tell us what&apos;s missing. Every request is read, and you&apos;ll
          get an email when its status changes.
        </p>
      </div>

      <FeatureRequestForm openSlots={MAX_OPEN_REQUESTS - open} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My requests</h2>

        {requests.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Nothing sent yet. Your first request will show up here with its
              status and any note we leave you.
            </CardContent>
          </Card>
        ) : (
          requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{request.title}</CardTitle>
                    <CardDescription>
                      {CATEGORY_LABELS[request.category]} · sent{" "}
                      {formatDate(request.createdAt)}
                    </CardDescription>
                  </div>
                  <RequestStatusBadge status={request.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{request.details}</p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_HELP[request.status]}
                </p>

                {request.updates
                  .filter((u) => u.note)
                  .map((update, i) => (
                    <div
                      key={i}
                      className="rounded-lg border bg-muted/40 p-3 text-sm"
                    >
                      <p className="text-xs font-medium text-muted-foreground">
                        Note from Renta-PH · {formatDate(update.createdAt)}
                      </p>
                      <p className="mt-1">{update.note}</p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}