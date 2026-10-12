import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";
import { TenantForm } from "@/components/tenants/tenant-form";
import { PortalAccessCard } from "@/components/tenants/portal-access-card";
import { isUuid } from "@/lib/utils";

interface EditTenantPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTenantPage({ params }: EditTenantPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, id), eq(tenants.userId, userId)))
    .limit(1);
  if (!tenant) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/tenants"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to tenants
      </Link>
      <TenantForm
        tenant={{
          id: tenant.id,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          email: tenant.email ?? "",
          phone: tenant.phone ?? "",
          notes: tenant.notes ?? "",
        }}
      />
      <PortalAccessCard
        tenantId={tenant.id}
        tenantName={`${tenant.firstName} ${tenant.lastName}`}
        email={tenant.email ?? null}
        granted={tenant.accountId !== null}
      />
    </div>
  );
}
