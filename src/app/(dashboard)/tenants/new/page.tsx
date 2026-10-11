import Link from "next/link";
import { TenantForm } from "@/components/tenants/tenant-form";

export default function NewTenantPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/tenants"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to tenants
      </Link>
      <TenantForm />
    </div>
  );
}
