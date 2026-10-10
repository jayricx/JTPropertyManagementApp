import { Wrench } from "lucide-react";
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder";

export default function MaintenancePage() {
  return (
    <SectionPlaceholder
      icon={Wrench}
      title="Maintenance"
      description="Track repair requests from new to resolved."
    />
  );
}
