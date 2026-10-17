"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { meterReadings, meters, units } from "@/db/schema";
import { canManageProperty } from "@/lib/access";
import { isUuid, isValidMonth, todayInManila } from "@/lib/utils";
import { meterSchema, meterTypeLabels } from "@/lib/validations";

export type UtilityActionState = { error?: string; ok?: boolean } | null;

function toFormDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") record[key] = value;
  });
  return record;
}

// ---------------------------------------------------------------------------
// Meters
// ---------------------------------------------------------------------------

/**
 * Create or update a unit's electricity/water meter. `meterId` present means
 * update. The unit must belong to a property this user can manage (owner or
 * co-owner — viewers are read-only).
 */
export async function saveMeterAction(
  _prev: UtilityActionState,
  formData: FormData,
): Promise<UtilityActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const meterId = String(formData.get("meterId") ?? "");
  const parsed = meterSchema.safeParse(toFormDataRecord(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid meter." };
  }
  const data = parsed.data;

  const [unit] = await db
    .select({ id: units.id, propertyId: units.propertyId })
    .from(units)
    .where(eq(units.id, data.unitId))
    .limit(1);
  if (!unit || !(await canManageProperty(session.user.id, unit.propertyId))) {
    return { error: "Unit not found." };
  }

  const rate = String(data.rate ?? 0);

  if (meterId) {
    if (!isUuid(meterId)) return { error: "Meter not found." };
    const [existing] = await db
      .select({ id: meters.id })
      .from(meters)
      .where(eq(meters.id, meterId))
      .limit(1);
    if (!existing) return { error: "Meter not found." };

    const [duplicate] = await db
      .select({ id: meters.id })
      .from(meters)
      .where(and(eq(meters.unitId, data.unitId), eq(meters.type, data.type)))
      .limit(1);
    if (duplicate && duplicate.id !== meterId) {
      return {
        error: `That unit already has a ${meterTypeLabels[data.type].toLowerCase()} meter.`,
      };
    }

    await db
      .update(meters)
      .set({
        unitId: data.unitId,
        type: data.type,
        label: data.label,
        rate,
        updatedAt: new Date(),
      })
      .where(eq(meters.id, meterId));
  } else {
    const [duplicate] = await db
      .select({ id: meters.id })
      .from(meters)
      .where(and(eq(meters.unitId, data.unitId), eq(meters.type, data.type)))
      .limit(1);
    if (duplicate) {
      return {
        error: `That unit already has a ${meterTypeLabels[data.type].toLowerCase()} meter.`,
      };
    }
    await db.insert(meters).values({
      unitId: data.unitId,
      type: data.type,
      label: data.label,
      rate,
    });
  }

  revalidatePath(`/properties/${unit.propertyId}`);
  revalidatePath(`/properties/${unit.propertyId}/readings`);
  return { ok: true };
}

/**
 * Delete a meter. Refused while readings exist so billing history is never
 * silently destroyed — retire the meter by simply not reading it again.
 */
export async function deleteMeterAction(
  meterId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (!isUuid(meterId)) return { error: "Meter not found." };

  const [meter] = await db
    .select({ id: meters.id, propertyId: units.propertyId })
    .from(meters)
    .innerJoin(units, eq(meters.unitId, units.id))
    .where(eq(meters.id, meterId))
    .limit(1);
  if (!meter || !(await canManageProperty(session.user.id, meter.propertyId))) {
    return { error: "Meter not found." };
  }

  const [reading] = await db
    .select({ id: meterReadings.id })
    .from(meterReadings)
    .where(eq(meterReadings.meterId, meterId))
    .limit(1);
  if (reading) {
    return {
      error:
        "This meter has readings on file. Keep it so past bills stay intact.",
    };
  }

  await db.delete(meters).where(eq(meters.id, meterId));
  revalidatePath(`/properties/${meter.propertyId}`);
  revalidatePath(`/properties/${meter.propertyId}/readings`);
  return {};
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

interface ReadingInsert {
  meterId: string;
  periodMonth: string;
  readingDate: Date;
  previousReading: string;
  currentReading: string;
  consumption: string;
  rate: string;
  amount: string;
}

/**
 * Batch-entry a property's meter readings for one month. Every meter of the
 * property is offered; blank `curr_<meterId>` rows are skipped, and a filled
 * row is upserted on (meter, month) so re-saving a month corrects it rather
 * than duplicating it. Consumption is `current − previous`; the amount is
 * `consumption × rate`, both snapshotted against the rate entered now.
 */
export async function saveReadingsAction(
  _prev: UtilityActionState,
  formData: FormData,
): Promise<UtilityActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const propertyId = String(formData.get("propertyId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!isUuid(propertyId)) return { error: "Missing property." };
  if (!isValidMonth(month)) return { error: "Pick a valid month." };
  if (!(await canManageProperty(session.user.id, propertyId))) {
    return { error: "Property not found." };
  }

  const meterRows = await db
    .select({
      id: meters.id,
      type: meters.type,
      rate: meters.rate,
      unitName: units.name,
    })
    .from(meters)
    .innerJoin(units, eq(meters.unitId, units.id))
    .where(eq(units.propertyId, propertyId))
    .orderBy(asc(units.name));

  // Newest reading per meter, used as the fallback previous/rate when the form
  // left them blank (the form normally pre-fills both).
  const lastByMeter = new Map<string, { currentReading: number; rate: number }>();
  if (meterRows.length) {
    const rows = await db
      .select({
        meterId: meterReadings.meterId,
        periodMonth: meterReadings.periodMonth,
        currentReading: meterReadings.currentReading,
        rate: meterReadings.rate,
      })
      .from(meterReadings)
      .where(
        inArray(
          meterReadings.meterId,
          meterRows.map((m) => m.id),
        ),
      )
      .orderBy(asc(meterReadings.periodMonth));
    for (const row of rows) {
      lastByMeter.set(row.meterId, {
        currentReading: Number(row.currentReading),
        rate: Number(row.rate),
      });
    }
  }

  const readings: ReadingInsert[] = [];
  for (const meter of meterRows) {
    const currentRaw = String(formData.get(`curr_${meter.id}`) ?? "").trim();
    if (!currentRaw) continue; // blank row — nothing entered for this meter

    const current = Number(currentRaw);
    if (!Number.isFinite(current) || current < 0) {
      return { error: `Enter a valid current reading for ${meter.unitName}.` };
    }

    const previousRaw = String(formData.get(`prev_${meter.id}`) ?? "").trim();
    const previous = previousRaw
      ? Number(previousRaw)
      : (lastByMeter.get(meter.id)?.currentReading ?? 0);
    if (!Number.isFinite(previous) || previous < 0) {
      return { error: `Enter a valid previous reading for ${meter.unitName}.` };
    }

    const rateRaw = String(formData.get(`rate_${meter.id}`) ?? "").trim();
    const rate = rateRaw
      ? Number(rateRaw)
      : (lastByMeter.get(meter.id)?.rate ?? Number(meter.rate));
    if (!Number.isFinite(rate) || rate < 0) {
      return { error: `Enter a valid rate for ${meter.unitName}.` };
    }

    const consumption = current - previous;
    if (consumption < 0) {
      return {
        error: `The current reading can't be lower than the previous one for ${meter.unitName}.`,
      };
    }

    const amount = Math.round(consumption * rate * 100) / 100;
    readings.push({
      meterId: meter.id,
      periodMonth: month,
      readingDate: todayInManila(),
      previousReading: previous.toFixed(2),
      currentReading: current.toFixed(2),
      consumption: consumption.toFixed(2),
      rate: rate.toString(),
      amount: amount.toFixed(2),
    });
  }

  if (!readings.length) {
    return { error: "Enter at least one current reading." };
  }

  for (const reading of readings) {
    await db
      .insert(meterReadings)
      .values(reading)
      .onConflictDoUpdate({
        target: [meterReadings.meterId, meterReadings.periodMonth],
        set: {
          readingDate: reading.readingDate,
          previousReading: reading.previousReading,
          currentReading: reading.currentReading,
          consumption: reading.consumption,
          rate: reading.rate,
          amount: reading.amount,
        },
      });
  }

  revalidatePath(`/properties/${propertyId}/readings`);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/finance");
  return { ok: true };
}

/** Remove a single reading, e.g. one entered against the wrong month. */
export async function deleteReadingAction(
  readingId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (!isUuid(readingId)) return { error: "Reading not found." };

  const [reading] = await db
    .select({ id: meterReadings.id, propertyId: units.propertyId })
    .from(meterReadings)
    .innerJoin(meters, eq(meterReadings.meterId, meters.id))
    .innerJoin(units, eq(meters.unitId, units.id))
    .where(eq(meterReadings.id, readingId))
    .limit(1);
  if (
    !reading ||
    !(await canManageProperty(session.user.id, reading.propertyId))
  ) {
    return { error: "Reading not found." };
  }

  await db.delete(meterReadings).where(eq(meterReadings.id, readingId));
  revalidatePath(`/properties/${reading.propertyId}/readings`);
  revalidatePath(`/properties/${reading.propertyId}`);
  return {};
}
