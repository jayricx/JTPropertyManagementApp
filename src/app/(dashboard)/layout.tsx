import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { userHasTenantProfile } from "@/lib/portal-access";

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
  const hasPortal = await userHasTenantProfile(session.user.id);

  return (
    // Stacked on mobile (header above content), sidebar-left on desktop.
    <div className="flex min-h-svh flex-col md:flex-row">
      <DashboardNav hasPortal={hasPortal} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
