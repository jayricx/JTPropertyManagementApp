import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { PencilIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties, units } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeletePropertyButton } from "@/components/properties/delete-property-button";
import { UnitFormDialog } from "@/components/properties/unit-form-dialog";
import { UnitRowActions } from "@/components/properties/unit-row-actions";
import { formatCurrency, isUuid } from "@/lib/utils";
import {
  propertyTypeLabels,
  unitStatusLabels,
  type UnitFormValues,
  type UnitStatus,
} from "@/lib/validations";

interface PropertyDetailPageProps {
  params: Promise<{ id: string }>;
}

const unitStatusClass: Record<UnitStatus, string> = {
  occupied:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  vacant: "border-border bg-muted text-muted-foreground",
  maintenance:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
};

export default async function PropertyDetailPage({
  params,
}: PropertyDetailPageProps) {
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

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.propertyId, id))
    .orderBy(asc(units.name));

  const occupied = unitRows.filter((u) => u.status === "occupied").length;
  const occupancyRate =
    unitRows.length > 0 ? Math.round((occupied / unitRows.length) * 100) : 0;
  const rentRoll = unitRows.reduce(
    (sum, u) => sum + Number(u.rentAmount ?? 0),
    0,
  );
  const addressLine =
    [property.address, property.city, property.state, property.country]
      .filter(Boolean)
      .join(", ") || "No address on file";

  const toFormValues = (
    u: (typeof unitRows)[number],
  ): UnitFormValues & { id: string } => ({
    id: u.id,
    name: u.name,
    bedrooms: u.bedrooms ?? "",
    bathrooms: u.bathrooms === null ? "" : Number(u.bathrooms),
    rentAmount: u.rentAmount === null ? "" : Number(u.rentAmount),
    sqft: u.sqft ?? "",
    status: u.status,
    notes: u.notes ?? "",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/properties"
            className="inline-block text-sm text-muted-foreground hover:text-foreground"
          >
            ← Properties
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {property.name}
            </h1>
            <Badge variant="secondary" className="capitalize">
              {propertyTypeLabels[property.type]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{addressLine}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={
              <Link href={`/properties/${property.id}/edit`}>
                <PencilIcon />
                Edit
              </Link>
            }
          />
          <DeletePropertyButton
            propertyId={property.id}
            propertyName={property.name}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Units</CardTitle>
            <CardDescription>
              {unitRows.length} unit{unitRows.length === 1 ? "" : "s"} ·{" "}
              {occupancyRate}% occupied · {formatCurrency(rentRoll)}/mo rent
              roll
            </CardDescription>
          </div>
          <UnitFormDialog propertyId={property.id} />
        </CardHeader>
        <CardContent>
          {unitRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No units yet. Add the first unit for this property.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Beds</TableHead>
                  <TableHead className="text-right">Baths</TableHead>
                  <TableHead className="text-right">Sqft</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitRows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-right">
                      {u.bedrooms ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.bathrooms ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.sqft ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.rentAmount ? formatCurrency(u.rentAmount) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={unitStatusClass[u.status]}
                      >
                        {unitStatusLabels[u.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <UnitRowActions
                        propertyId={property.id}
                        unit={toFormValues(u)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {property.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
            {property.notes}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
