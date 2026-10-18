import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { InboxIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { RequestStatusBadge } from "@/components/feedback/request-status-badge";
import { RequestTriage } from "@/components/feedback/request-triage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CATEGORY_LABELS, requestInbox } from "@/lib/feature-requests";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Request inbox — RentBase-PH" };

/**
 * The triage view. Admin-only, and it deliberately never shows a request's
 * author next to a publish control — promoting something is a separate,
 * explicit act from answering it.
 */
export default async function FeedbackInboxPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  const [account] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account?.isAdmin) notFound();

  const requests = await requestInbox();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <InboxIcon className="size-6 text-primary" />
          Request inbox
        </h1>
        <p className="text-muted-foreground">
          Answering a request emails the landlord. Publishing one puts it on the
          public roadmap under its title alone — never with a name attached.
        </p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No requests yet. When a landlord sends one it lands here with their
            plan and how many units they run.
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
                    {request.submitterName || request.submitterEmail} ·{" "}
                    {CATEGORY_LABELS[request.category]} ·{" "}
                    {request.planAtSubmission ?? "free"} plan ·{" "}
                    {request.requestCount}{" "}
                    {request.requestCount === 1 ? "request" : "requests"}{" "}
                    sent · {formatDate(request.createdAt)}
                  </CardDescription>
                </div>
                <RequestStatusBadge status={request.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{request.details}</p>
              {/* You can't answer your own request — that would be a promise. */}
              {request.userId === userId ? (
                <p className="text-xs text-muted-foreground">
                  This is your own request, so it&apos;s yours to follow rather
                  than answer.
                </p>
              ) : (
                <RequestTriage
                  requestId={request.id}
                  status={request.status}
                  isPublic={request.isPublic}
                />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}