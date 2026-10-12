import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PortalHeader } from "@/components/portal/portal-header";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Landlords belong in the dashboard; tenant accounts only see the portal.
  if (session.user.role !== "tenant") redirect("/dashboard");

  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
