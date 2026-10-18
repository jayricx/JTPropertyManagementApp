import { desc, eq } from "drizzle-orm";
import {
  BuildingIcon,
  KeyRoundIcon,
  LandmarkIcon,
  MailIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  UsersIcon,
} from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { bankAccounts, portfolioMembers, users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { emailDiagnostics } from "@/lib/email";
import { EmailTestForm } from "@/components/settings/email-test-form";
import { BusinessNameForm } from "@/components/settings/business-name-form";
import { GcashSettingsForm } from "@/components/settings/gcash-settings-form";
import {
  BankAccountsManager,
  type BankAccountRow,
} from "@/components/settings/bank-accounts-card";
import {
  PortfolioMembersCard,
  type MemberRow,
} from "@/components/settings/portfolio-members-card";
import { CustomFieldsOverview, type DefinitionRow } from "@/components/custom-fields/custom-fields-overview";
import { definitionsFor } from "@/lib/custom-fields";
import { getPlanUsage } from "@/lib/plan-usage";
import { activePortfolio } from "@/lib/portfolios";
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

  // Members and custom fields are portfolio-scoped; the portfolio is created
  // silently on signup, but a pre-portfolio account may not have one yet.
  const portfolio = await activePortfolio(session.user.id);
  const memberRecords = portfolio
    ? await db
        .select({
          id: portfolioMembers.id,
          name: users.name,
          email: users.email,
          role: portfolioMembers.role,
          createdAt: portfolioMembers.createdAt,
        })
        .from(portfolioMembers)
        .innerJoin(users, eq(users.id, portfolioMembers.userId))
        .where(eq(portfolioMembers.portfolioId, portfolio.id))
        .orderBy(desc(portfolioMembers.createdAt))
    : [];
  const memberRows: MemberRow[] = memberRecords.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
    isYou: m.email === session.user.email,
  }));

  const definitionRows: DefinitionRow[] = portfolio
    ? (
        await Promise.all(
          (["property", "lease", "tenant"] as const).map((entity) =>
            definitionsFor(portfolio.id, entity),
          ),
        )
      )
        .flat()
        .map((d) => ({
          id: d.id,
          entity: d.entity,
          key: d.key,
          label: d.label,
          type: d.type,
          required: d.required,
        }))
    : [];

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
            <BuildingIcon className="size-5" /> Business name
          </CardTitle>
          <CardDescription>
            Shown on lease contracts instead of your personal name, so the
            counterparty is the business rather than the account holder. Leave
            blank and contracts use your own name. Only the portfolio owner can
            change this, and contracts already sent keep the name they were
            signed with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portfolio && portfolio.role === "owner" ? (
            <BusinessNameForm businessName={portfolio.businessName ?? ""} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {portfolio
                ? "Ask the portfolio owner to set the business name."
                : "No portfolio yet — create one by adding a property."}
            </p>
          )}
        </CardContent>
      </Card>

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
            <UsersIcon className="size-5" /> Portfolio members
          </CardTitle>
          <CardDescription>
            {portfolio
              ? `People who can work in this portfolio. One invite covers all ${portfolio.propertyCount} propert${portfolio.propertyCount === 1 ? "y" : "ies"}, their tenants and leases, and the custom fields below.`
              : "People who can work in this portfolio."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portfolio && memberRows.length > 0 ? (
            <PortfolioMembersCard
              portfolioId={portfolio.id}
              propertyCount={portfolio.propertyCount}
              members={memberRows}
              canManage={portfolio.role === "owner"}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No portfolio yet — it&rsquo;s created the moment you add a
              property.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontalIcon className="size-5" /> Custom fields
          </CardTitle>
          <CardDescription>
            Extra details you keep on your properties, leases and tenants —
            gate codes, meter numbers, parking slots. Everyone in this portfolio
            uses the same fields; you can add or change them, a co-owner fills
            them in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portfolio && portfolio.role === "owner" ? (
            <CustomFieldsOverview definitions={definitionRows} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {portfolio && portfolio.propertyCount === 0
                ? "Add a property, tenant or lease first — fields are attached to those."
                : "Only the portfolio owner can add or change custom fields. You'll see each one on the property, lease and tenant pages."}
            </p>
          )}
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
