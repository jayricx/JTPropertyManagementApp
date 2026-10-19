import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { PortfolioSwitcher } from "@/components/dashboard/portfolio-switcher";
import { userHasTenantProfile } from "@/lib/portal-access";
import { activePortfolioId, listPortfolioSummaries } from "@/lib/portfolios";
import {
  affiliateForUser,
  attributeJustArrivedSignup,
  ensureReferralCode,
  looksLikeCode,
  REFERRAL_COOKIE,
} from "@/lib/referrals";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Tenant accounts belong in the portal, not the landlord dashboard.
  if (session.user.role === "tenant") redirect("/portal");

  const [hasPortal, portfolios, activeId, account] = await Promise.all([
    userHasTenantProfile(session.user.id),
    listPortfolioSummaries(session.user.id),
    activePortfolioId(session.user.id),
    db
      .select({
        isAdmin: users.isAdmin,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
        referredBy: users.referredBy,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  // Referral follow-up for the Google sign-up path, and the code every landlord
  // shares from. Both are idempotent, so this runs safely on every dashboard
  // render and settles after the first one.
  if (account) {
    if (!account.referredBy) {
      const ref = (await cookies()).get(REFERRAL_COOKIE)?.value;
      if (ref && looksLikeCode(ref)) {
        const attribution = await attributeJustArrivedSignup({
          userId: session.user.id,
          email: account.email,
          createdAt: account.createdAt,
          rawCode: ref,
        }).catch(() => null);
        if (attribution?.ok) {
          console.log(`[referrals] Google signup attributed to ${attribution.code}`);
        }
      }

      await ensureReferralCode(session.user.id, account.name).catch(() => null);
    }
  }

  // Whether this account has a code to share — read after the mint above, so a
  // landlord who got one for the first time on this render sees the nav entry.
  const affiliate = account ? await affiliateForUser(session.user.id) : null;

  return (
    // Stacked on mobile (header above content), sidebar-left on desktop.
    <div className="flex min-h-svh flex-col md:flex-row">
      <DashboardNav
        hasPortal={hasPortal}
        isAdmin={account?.isAdmin ?? false}
        canRefer={Boolean(affiliate)}
      >
        {/* Renders only when the account belongs to more than one
            portfolio — a solo owner never sees the concept. */}
        <PortfolioSwitcher portfolios={portfolios} activeId={activeId} />
      </DashboardNav>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}