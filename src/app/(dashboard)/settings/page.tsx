import { eq } from "drizzle-orm";
import { MailIcon, SmartphoneIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { emailDiagnostics } from "@/lib/email";
import { EmailTestForm } from "@/components/settings/email-test-form";
import { GcashSettingsForm } from "@/components/settings/gcash-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [user] = await db
    .select({
      gcashNumber: users.gcashNumber,
      gcashName: users.gcashName,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Payment details tenants see when paying rent, and your email delivery
          settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartphoneIcon className="size-5" /> GCash details
          </CardTitle>
          <CardDescription>
            Shown to tenants on the pay-rent page — they send rent to this
            wallet from their GCash app and submit the reference number for
            you to verify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GcashSettingsForm
            gcashNumber={user?.gcashNumber ?? ""}
            gcashName={user?.gcashName ?? ""}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-5" /> Email delivery
          </CardTitle>
          <CardDescription>
            Password resets and payment receipts go out through this account.
            Send yourself a test to confirm the sender, the key and the links
            inside each email are all right.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailTestForm {...emailDiagnostics()} />
        </CardContent>
      </Card>
    </div>
  );
}
