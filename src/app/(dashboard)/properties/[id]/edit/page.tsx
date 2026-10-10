import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties } from "@/db/schema";
import { PropertyForm } from "@/components/properties/property-form";
import { isUuid } from "@/lib/utils";

interface EditPropertyPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPropertyPage({
  params,
}: EditPropertyPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null; // layout redirects unauthenticated visitors

  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .limit(1);
  if (!property) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={`/properties/${property.id}`}
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to {property.name}
      </Link>
      <PropertyForm
        property={{
          id: property.id,
          name: property.name,
          address: property.address ?? "",
          city: property.city ?? "",
          state: property.state ?? "",
          zipCode: property.zipCode ?? "",
          country: property.country ?? "",
          type: property.type,
          notes: property.notes ?? "",
        }}
      />
    </div>
  );
}
