import Link from "next/link";
import { headers } from "next/headers";
import { PropertyForm } from "@/components/properties/property-form";
import { resolveCountryName } from "@/lib/countries";

export default async function NewPropertyPage() {
  // Vercel (and most reverse proxies) expose the visitor's country — this
  // pre-selects the right country in the form. Absent in local dev, where
  // the client falls back to the browser's time zone.
  const headerStore = await headers();
  const detectedCountry = resolveCountryName(
    headerStore.get("x-vercel-ip-country"),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/properties"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to properties
      </Link>
      <PropertyForm defaultCountry={detectedCountry} />
    </div>
  );
}
