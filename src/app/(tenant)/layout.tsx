import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PortalHeader } from "@/components/portal/portal-header";
import { userHasTenantProfile } from "@/lib/portal-access";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Access follows a linked tenant profile, not the account's primary role, so
  // an owner who rents from another owner can use the portal too. A tenant
  // account with no profile still lands here so it can see the "access
  // revoked" message; a landlord with no profile belongs in the dashboard.
  const linked = await userHasTenantProfile(session.user.id);
  if (!linked && session.user.role !== "tenant") redirect("/dashboard");

  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader showDashboardLink={session.user.role === "landlord"} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
