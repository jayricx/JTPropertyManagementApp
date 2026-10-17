import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import {
  leases,
  meterReadings,
  meters,
  properties,
  tenants,
  units,
} from "@/db/schema";
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
import { MeterFormDialog } from "@/components/properties/meter-form-dialog";
import { DeleteReadingButton } from "@/components/properties/delete-reading-button";
import { ReadingsForm, type ReadingRow } from "@/components/properties/readings-form";
import { getPropertyAccess } from "@/lib/access";
import {
  currentMonthKey,
  formatCurrency,
  formatDate,
  formatPeriodMonth,
  isUuid,
  isValidMonth,
  listMonths,
  shiftMonth,
} from "@/lib/utils";
import { meterConsumptionUnits } from "@/lib/validations";

interface ReadingsPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function ReadingsPage({
  params,
  searchParams,
}: ReadingsPageProps) {
  const { id } = await params;
  const { month: monthRaw } = await searchParams;
  if (!isUuid(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  const access = await getPropertyAccess(userId, id);
  // Viewers may browse the property but not enter readings.
  if (!property || !access || access === "viewer") notFound();

  const currentMonth = currentMonthKey();
  const month =
    monthRaw && isValidMonth(monthRaw) ? monthRaw : currentMonth;

  const unitRows = await db
    .select({ id: units.id, name: units.name })
    .from(units)
    .where(eq(units.propertyId, id))
    .orderBy(asc(units.name));
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
  const readingRows = meterIds.length
    ? await db
        .select({
          id: meterReadings.id,
          meterId: meterReadings.meterId,
          periodMonth: meterReadings.periodMonth,
          readingDate: meterReadings.readingDate,
          previousReading: meterReadings.previousReading,
          currentReading: meterReadings.currentReading,
          consumption: meterReadings.consumption,
          rate: meterReadings.rate,
          amount: meterReadings.amount,
        })
        .from(meterReadings)
        .where(inArray(meterReadings.meterId, meterIds))
        .orderBy(desc(meterReadings.periodMonth), asc(meterReadings.createdAt))
    : [];

  // Current tenant per unit, for context in the entry table.
  const activeLeaseRows = await db
    .select({
      unitId: leases.unitId,
      tenantName: tenants.lastName,
    })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .where(and(eq(units.propertyId, id), eq(leases.status, "active")));
  const tenantByUnit = new Map(activeLeaseRows.map((r) => [r.unitId, r.tenantName]));

  const unitNameById = new Map(unitRows.map((u) => [u.id, u.name]));

  // Per meter: the reading saved for the selected month, and the newest one
  // before it (used to pre-fill previous + rate).
  const existingByMeter = new Map<string, (typeof readingRows)[number]>();
  const priorByMeter = new Map<string, (typeof readingRows)[number]>();
  for (const reading of readingRows) {
    if (reading.periodMonth === month) {
      existingByMeter.set(reading.meterId, reading);
    } else if (
      reading.periodMonth < month &&
      (!priorByMeter.has(reading.meterId) ||
        reading.periodMonth > priorByMeter.get(reading.meterId)!.periodMonth)
    ) {
      priorByMeter.set(reading.meterId, reading);
    }
  }

  const rows: ReadingRow[] = meterRows.map((meter) => {
    const existing = existingByMeter.get(meter.id);
    const prior = priorByMeter.get(meter.id);
    return {
      meterId: meter.id,
      unitName: unitNameById.get(meter.unitId) ?? "Unit",
      tenantName: tenantByUnit.get(meter.unitId) ?? null,
      type: meter.type,
      label: meter.label,
      rate: String(existing?.rate ?? prior?.rate ?? Number(meter.rate)),
      previous: String(
        existing?.previousReading ?? prior?.currentReading ?? 0,
      ),
      current: existing ? String(existing.currentReading) : "",
    };
  });

  // Month picker: the last 12 months, plus whatever month is selected.
  const monthSet = new Set(
    listMonths(shiftMonth(currentMonth, -11), currentMonth),
  );
  monthSet.add(month);
  const monthOptions = [...monthSet].sort((a, b) => (a < b ? 1 : -1));

  // Meters that have no unit assigned readings yet — needed for "Add meter"
  // even when a unit already has one of the two types.
  const unitOptions = unitRows.map((u) => ({
    id: u.id,
    label: u.name,
  }));

  const historyRows = readingRows.slice(0, 30);
  const meterById = new Map(meterRows.map((m) => [m.id, m]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/properties/${property.id}`}
            className="inline-block text-sm text-muted-foreground hover:text-foreground"
          >
            ← {property.name}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Utility readings
          </h1>
          <p className="text-muted-foreground">
            Read each sub-meter, then save — the amounts roll into every
            tenant&apos;s monthly statement.
          </p>
        </div>
        {unitOptions.length > 0 && (
          <MeterFormDialog propertyId={property.id} unitOptions={unitOptions} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enter readings</CardTitle>
          <CardDescription>
            {formatPeriodMonth(month)} · blank rows are skipped
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReadingsForm
            key={month}
            propertyId={property.id}
            month={month}
            rows={rows}
            monthOptions={monthOptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent readings</CardTitle>
          <CardDescription>
            {readingRows.length
              ? `${readingRows.length} reading${readingRows.length === 1 ? "" : "s"} on file`
              : "No readings recorded yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Readings you save show up here and on each tenant&apos;s statement.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Meter</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Consumption</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((reading) => {
                    const meter = meterById.get(reading.meterId);
                    return (
                      <TableRow key={reading.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatPeriodMonth(reading.periodMonth)}
                        </TableCell>
                        <TableCell>
                          {meter
                            ? (unitNameById.get(meter.unitId) ?? "—")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {meter
                            ? meter.type === "electric"
                              ? "Electric"
                              : "Water"
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {Number(reading.previousReading).toLocaleString(
                            "en-PH",
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {Number(reading.currentReading).toLocaleString(
                            "en-PH",
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(reading.consumption).toLocaleString("en-PH")}{" "}
                          {meter ? meterConsumptionUnits[meter.type] : ""}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(reading.amount)}
                        </TableCell>
                        <TableCell>
                          <DeleteReadingButton
                            readingId={reading.id}
                            label={`${formatPeriodMonth(
                              reading.periodMonth,
                            )} ${meter ? (meter.type === "electric" ? "electric" : "water") : ""}`.trim()}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {readingRows.length > historyRows.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the {historyRows.length} most recent readings.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Reading entered {formatDate(new Date())} · rates are snapshotted per
        reading, so changing a meter&apos;s default never rewrites past bills.
      </p>
    </div>
  );
}
