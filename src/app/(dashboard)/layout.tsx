import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { PortfolioSwitcher } from "@/components/dashboard/portfolio-switcher";
import { userHasTenantProfile } from "@/lib/portal-access";
import { activePortfolioId, listPortfolioSummaries } from "@/lib/portfolios";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Tenant accounts belong in the portal, not the landlord dashboard.
  if (session.user.role === "tenant") redirect("/portal");

  // An owner who also rents from another owner gets a portal switch link.
  const [hasPortal, portfolios, activeId] = await Promise.all([
    userHasTenantProfile(session.user.id),
    listPortfolioSummaries(session.user.id),
    activePortfolioId(session.user.id),
  ]);

  return (
    // Stacked on mobile (header above content), sidebar-left on desktop.
    <div className="flex min-h-svh flex-col md:flex-row">
      <DashboardNav hasPortal={hasPortal}>
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