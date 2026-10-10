import { FileText } from "lucide-react";
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder";

export default function LeasesPage() {
  return (
    <SectionPlaceholder
      icon={FileText}
      title="Leases"
      description="Track lease terms, deposits, and renewal dates."
    />
  );
}
