import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    // Stacked on mobile (header above content), sidebar-left on desktop.
    <div className="flex min-h-svh flex-col md:flex-row">
      <DashboardNav />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
