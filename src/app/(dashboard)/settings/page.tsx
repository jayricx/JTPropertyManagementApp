import { desc, eq } from "drizzle-orm";
import { KeyRoundIcon, LandmarkIcon, MailIcon, SmartphoneIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { bankAccounts, users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { emailDiagnostics } from "@/lib/email";
import { EmailTestForm } from "@/components/settings/email-test-form";
import { GcashSettingsForm } from "@/components/settings/gcash-settings-form";
import {
  BankAccountsManager,
  type BankAccountRow,
} from "@/components/settings/bank-accounts-card";
import { getPlanUsage } from "@/lib/plan-usage";
import { PlanUsageMeter } from "@/components/plans/plan-usage-meter";
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

  const bankRows = await db
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      accountNumber: bankAccounts.accountNumber,
      accountName: bankAccounts.accountName,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, session.user.id))
    .orderBy(desc(bankAccounts.createdAt));

  const usage = await getPlanUsage(session.user.id);

  const googleEnabled = googleSignInEnabled();
  const googleRedirectUrl = `${appUrl()}/api/auth/callback/google`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Payment details tenants see when paying rent, your sign-in methods,
          and your email delivery settings.
        </p>
        {usage.limit !== null ? (
          <PlanUsageMeter
            planLabel={usage.planLabel}
            used={usage.used}
            limit={usage.limit}
            atLimit={usage.atLimit}
            className="mt-1"
          />
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {usage.planLabel} plan · unlimited units
          </p>
        )}
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
            <LandmarkIcon className="size-5" /> Bank accounts
          </CardTitle>
          <CardDescription>
            Shown to tenants who pay by bank transfer — they send rent to one
            of these accounts from their own bank app and submit the reference
            number for you to verify, just like GCash.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BankAccountsManager accounts={bankRows as BankAccountRow[]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-5" /> Email delivery
          </CardTitle>
          <CardDescription>
            Password resets, tenant invites and payment receipts go out through
            this sender — Gmail SMTP or Resend. Send yourself a test to confirm
            the transport, the sender and the links inside each email are all
            right.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailTestForm {...emailDiagnostics()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-5" /> Sign-in
          </CardTitle>
          <CardDescription>
            Email and password always work.
            {googleEnabled
              ? " Google sign-in is live on the sign-in and register pages."
              : " Add a Google OAuth client to offer one-tap sign-in."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {googleEnabled ? (
            <>
              <p className="text-muted-foreground">
                Your Google OAuth client (APIs &amp; Services → Credentials → the
                Web application client) must list this authorized redirect URI:
              </p>
              <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">
                {googleRedirectUrl}
              </code>
            </>
          ) : (
            <p className="text-muted-foreground">
              Create a <strong>Web application</strong> OAuth client in Google
              Cloud Console, then set <code>AUTH_GOOGLE_ID</code> and{" "}
              <code>AUTH_GOOGLE_SECRET</code>. The button stays hidden until
              both are present.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Google verifies the address, and an account with the same email is
            linked to it — so a tenant you invited by email can sign in either
            way and still reach the same portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
