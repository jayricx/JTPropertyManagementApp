import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { InboxIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { contactMessages, users } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { markContactRepliedAction } from "@/app/(dashboard)/admin/contact/actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Contact messages — Renta-PH.net" };

export default async function AdminContactPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [account] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account?.isAdmin) notFound();

  const messages = await db
    .select()
    .from(contactMessages)
    .orderBy(desc(contactMessages.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <InboxIcon className="size-6 text-primary" />
          Contact messages
        </h1>
        <p className="text-muted-foreground">
          Public contact form submissions. {messages.length} total.
        </p>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No messages yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{m.subject}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {formatDate(m.createdAt)}
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {m.name} · {m.email}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm">{m.message}</p>
                <div className="flex items-center gap-2">
                  {m.status === "open" ? (
                    <form
                      action={async () => {
                        "use server";
                        await markContactRepliedAction(m.id);
                      }}
                    >
                      <Button size="sm" variant="outline" type="submit">
                        Mark replied
                      </Button>
                    </form>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Replied {m.repliedAt ? formatDate(m.repliedAt) : ""}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}