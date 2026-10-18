import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";
import { TenantForm } from "@/components/tenants/tenant-form";
import { PortalAccessCard } from "@/components/tenants/portal-access-card";
import { isUuid } from "@/lib/utils";
import {
  canManagePortfolio,
  roleInPortfolio,
} from "@/lib/portfolios";
import {
  definitionsFor,
  parseCustomFields,
} from "@/lib/custom-fields";
import { CustomFieldsCard } from "@/components/custom-fields/custom-fields-card";

interface EditTenantPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTenantPage({ params }: EditTenantPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  // The roster belongs to the portfolio, so "the landlord who created this
  // tenant" is no longer the gate — any owner/co-owner in that portfolio may
  // edit, and a viewer still may not.
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!tenant) notFound();
  if (!(await canManagePortfolio(userId, tenant.portfolioId))) notFound();

  // Fields come from the portfolio so the whole team sees the same ones.
  const role = await roleInPortfolio(userId, tenant.portfolioId);
  const canManage = role === "owner" || role === "co_owner";
  const canDefine = role === "owner";
  const [tenantFieldDefs, tenantFieldValues] = await Promise.all([
    definitionsFor(tenant.portfolioId, "tenant"),
    Promise.resolve(parseCustomFields(tenant.customFields)),
  ]);

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
      <CustomFieldsCard
        entity="tenant"
        targetId={tenant.id}
        definitions={tenantFieldDefs}
        values={tenantFieldValues}
        canEdit={canManage}
        canDefine={canDefine}
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
