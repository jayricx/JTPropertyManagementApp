import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { PencilIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  leases,
  meterReadings,
  meters,
  properties,
  propertyCollaborators,
  tenants,
  units,
  users,
} from "@/db/schema";
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
import { CoOwnersCard } from "@/components/properties/co-owners-card";
import { DeletePropertyButton } from "@/components/properties/delete-property-button";
import { UnitFormDialog } from "@/components/properties/unit-form-dialog";
import { UnitRowActions } from "@/components/properties/unit-row-actions";
import { MeterFormDialog } from "@/components/properties/meter-form-dialog";
import { MeterRowActions } from "@/components/properties/meter-row-actions";
import { getPropertyAccess } from "@/lib/access";
import { formatCurrency, isUuid } from "@/lib/utils";
import {
  meterConsumptionUnits,
  meterTypeLabels,
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

  // Access = owned by this user, or shared with them (co_owner or viewer).
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  const access = await getPropertyAccess(userId, id);
  if (!property || !access) notFound();

  const isOwner = access === "owner";
  const canManage = access !== "viewer";

  // Collaborator roster, plus the owner's name when the viewer is a guest.
  const [coOwnerRows, ownerRows] = await Promise.all([
    db
      .select({
        id: propertyCollaborators.id,
        name: users.name,
        email: users.email,
        role: propertyCollaborators.role,
        createdAt: propertyCollaborators.createdAt,
      })
      .from(propertyCollaborators)
      .innerJoin(users, eq(propertyCollaborators.userId, users.id))
      .where(eq(propertyCollaborators.propertyId, id))
      .orderBy(asc(propertyCollaborators.createdAt)),
    isOwner
      ? Promise.resolve([])
      : db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, property.userId))
          .limit(1),
  ]);
  const ownerLabel = ownerRows[0]?.name ?? ownerRows[0]?.email ?? "the owner";

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.propertyId, id))
    .orderBy(asc(units.name));

  // Current tenant for each unit with an active lease.
  const activeLeaseRows = await db
    .select({
      unitId: leases.unitId,
      tenantName: sql<string>`concat(${tenants.firstName}, ' ', ${tenants.lastName})`,
    })
    .from(leases)
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .innerJoin(units, eq(leases.unitId, units.id))
    .where(and(eq(units.propertyId, id), eq(leases.status, "active")));
  const tenantByUnit = new Map(
    activeLeaseRows.map((r) => [r.unitId, r.tenantName]),
  );

  const unitIds = unitRows.map((u) => u.id);
  const meterRows = unitIds.length
    ? await db
        .select({
          id: meters.id,
          unitId: meters.unitId,
          type: meters.type,
          label: meters.label,
          rate: meters.rate,
        })
        .from(meters)
        .where(inArray(meters.unitId, unitIds))
        .orderBy(asc(meters.type))
    : [];
  const meterIds = meterRows.map((m) => m.id);
  const meterReadingRows = meterIds.length
    ? await db
        .select({ meterId: meterReadings.meterId })
        .from(meterReadings)
        .where(inArray(meterReadings.meterId, meterIds))
    : [];
  const metersWithReadings = new Set(meterReadingRows.map((r) => r.meterId));
  const unitNameById = new Map(unitRows.map((u) => [u.id, u.name]));
  const unitOptions = unitRows.map((u) => ({ id: u.id, label: u.name }));

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
            {!isOwner && (
              <Badge variant="outline">
                {access === "viewer" ? "Viewer" : "Co-owned"}
              </Badge>
            )}
            <Badge variant="secondary" className="capitalize">
              {propertyTypeLabels[property.type]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{addressLine}</p>
        </div>
        {canManage && (
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
            {isOwner && (
              <DeletePropertyButton
                propertyId={property.id}
                propertyName={property.name}
              />
            )}
          </div>
        )}
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
          {canManage && <UnitFormDialog propertyId={property.id} />}
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
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Beds</TableHead>
                  <TableHead className="text-right">Baths</TableHead>
                  <TableHead className="text-right">Sqft</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitRows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenantByUnit.get(u.id) ?? "—"}
                    </TableCell>
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
                    {canManage && (
                      <TableCell>
                        <UnitRowActions
                          propertyId={property.id}
                          unit={toFormValues(u)}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Utility meters</CardTitle>
            <CardDescription>
              {meterRows.length
                ? `${meterRows.length} meter${meterRows.length === 1 ? "" : "s"} · read monthly and billed on the tenant's statement`
                : "Sub-meter electricity and water so tenants pay for what they use"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              render={
                <Link href={`/properties/${property.id}/readings`}>
                  Readings
                </Link>
              }
            />
            {canManage && unitOptions.length > 0 && (
              <MeterFormDialog
                propertyId={property.id}
                unitOptions={unitOptions}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {unitRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a unit before setting up its meters.
            </p>
          ) : meterRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No meters yet. Add an electric or water meter to a unit to start
              billing utilities.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Meter</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {meterRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {unitNameById.get(m.unitId) ?? "—"}
                    </TableCell>
                    <TableCell>{meterTypeLabels[m.type]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.label ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(m.rate, { maximumFractionDigits: 4 })}/
                      {meterConsumptionUnits[m.type]}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <MeterRowActions
                          propertyId={property.id}
                          unitOptions={unitOptions}
                          meter={{
                            id: m.id,
                            unitId: m.unitId,
                            type: m.type,
                            label: m.label,
                            rate: Number(m.rate),
                            hasReadings: metersWithReadings.has(m.id),
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CoOwnersCard
        propertyId={property.id}
        isOwner={isOwner}
        ownerLabel={isOwner ? undefined : ownerLabel}
        coOwners={coOwnerRows}
      />

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
