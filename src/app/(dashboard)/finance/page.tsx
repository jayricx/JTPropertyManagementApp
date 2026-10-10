import { Wallet } from "lucide-react";
import { SectionPlaceholder } from "@/components/dashboard/section-placeholder";

export default function FinancePage() {
  return (
    <SectionPlaceholder
      icon={Wallet}
      title="Finance"
      description="Record income and expenses, and view per-property reports."
    />
  );
}
