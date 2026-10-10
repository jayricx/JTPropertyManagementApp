import Link from "next/link";
import { PropertyForm } from "@/components/properties/property-form";

export default function NewPropertyPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/properties"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to properties
      </Link>
      <PropertyForm />
    </div>
  );
}
