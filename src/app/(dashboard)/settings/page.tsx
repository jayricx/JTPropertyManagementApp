import { eq } from "drizzle-orm";
import { CreditCardIcon, MailIcon, SmartphoneIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { emailDiagnostics } from "@/lib/email";
import { cardCheckoutEnabled } from "@/lib/payments/provider";
import { paymongoWebhookConfigured } from "@/lib/payments/paymongo";
import { EmailTestForm } from "@/components/settings/email-test-form";
import { GcashSettingsForm } from "@/components/settings/gcash-settings-form";
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
  const usage = await getPlanUsage(session.user.id);

  const cardEnabled = cardCheckoutEnabled();
  const webhookConfigured = paymongoWebhookConfigured();
  const webhookUrl = `${appUrl()}/api/payments/paymongo/webhook`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Payment details tenants see when paying rent, and your email delivery
          settings.
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
            <CreditCardIcon className="size-5" /> Card payments
          </CardTitle>
          <CardDescription>
            Let tenants pay rent by credit or debit card on PayMongo&apos;s
            secure page.
            {cardEnabled
              ? " Card checkout is live."
              : " Add a PayMongo secret key to turn this on."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {cardEnabled ? (
            <>
              <p className="text-muted-foreground">
                Register this webhook URL in your PayMongo dashboard (Developers
                → Webhooks) so payments are confirmed and recorded
                automatically:
              </p>
              <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">
                {webhookUrl}
              </code>
              {!webhookConfigured && (
                <p className="text-amber-600 dark:text-amber-500">
                  Set <code>PAYMONGO_WEBHOOK_SECRET</code> to the signing secret
                  from that webhook, or confirmation events will be rejected.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              Set <code>PAYMONGO_SECRET_KEY</code> in your environment to enable
              card checkout. The GCash flow keeps working either way.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Charges settle to your PayMongo account; each one appears in Finance
            as a card rent payment.
          </p>
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
    </div>
  );
}
