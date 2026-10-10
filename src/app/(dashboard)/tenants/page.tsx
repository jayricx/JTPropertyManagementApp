import { Users } from "lucide-react";
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder";

export default function TenantsPage() {
  return (
    <SectionPlaceholder
      icon={Users}
      title="Tenants"
      description="Manage tenant contact details and history."
    />
  );
}
