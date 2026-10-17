import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  charges,
  leases,
  meterReadings,
  meters,
  payments,
  properties,
  tenants,
  units,
} from "@/db/schema";
import { utilityChargeTypes, type ChargeType, type LeaseStatus } from "@/lib/validations";
import { currentMonthKey, listMonths, monthKey } from "@/lib/utils";

/**
 * A tenant's monthly statement of account — the missing "who owes what" view.
 *
 * The app used to be income-only and rent-only: a lease carried a single
 * `rentAmount` and payments were just recorded cash. A statement is computed
 * (never stored) from four sources so nothing can drift out of sync:
 *
 * - **Rent** — the lease's `rentAmount`, charged for every month the lease
 *   covers in the range.
 * - **Utilities** — `meterReadings` for the lease's unit (sub-metered
 *   consumption × rate), plus any manual `charges` typed electricity/water
 *   (for landlords who split the actual bill by proportion).
 * - **Other charges** — `charges` typed dues/penalty/other.
 * - **Payments** — `payments` for the lease, bucketed by their `paidDate`
 *   month. A GCash/card payment covers everything in one lump, so it simply
 *   reduces the month's balance.
 *
 * `outstanding` (total charged − total paid, over the shown range) is the
 * honest arrears figure; `amountDue` is the current month's balance, which is
 * what the portal offers to collect so a tenant is never asked for a runaway
 * lump sum in one go.
 */

export interface UtilityLine {
  meterId: string;
  type: "electric" | "water";
  label: string | null;
  previousReading: number;
  currentReading: number;
  consumption: number;
  rate: number;
  amount: number;
}

export interface ChargeLine {
  id: string;
  type: ChargeType;
  description: string | null;
  amount: number;
  /** True when the charge came from a manual row (so it can be deleted). */
  manual: boolean;
}

export interface MonthlyStatement {
  /** "YYYY-MM" */
  periodMonth: string;
  rent: number;
  /** Sub-metered electricity, plus manual electricity charges. */
  electricity: number;
  /** Sub-metered water, plus manual water charges. */
  water: number;
  /** Dues, penalties, and other manual charges. */
  otherCharges: number;
  chargesTotal: number;
  paid: number;
  /** chargesTotal − paid (negative means a credit). */
  balance: number;
  utilityLines: UtilityLine[];
  chargeLines: ChargeLine[];
}

export interface LeaseStatement {
  leaseId: string;
  unitName: string;
  propertyName: string;
  tenantName: string;
  rentAmount: number;
  status: LeaseStatus;
  months: MonthlyStatement[];
  totalCharges: number;
  totalPaid: number;
  outstanding: number;
  /** The current calendar month's row, when the range reaches it. */
  currentMonth: MonthlyStatement | null;
}

export interface LeaseStatementOptions {
  /** Cap the number of months shown, keeping the most recent. Defaults to 12. */
  maxMonths?: number;
}

/**
 * Build the statement for a lease. Access control is the caller's job — this
 * only loads data for the id it is handed.
 */
export async function getLeaseStatement(
  leaseId: string,
  options?: LeaseStatementOptions,
): Promise<LeaseStatement | null> {
  const [lease] = await db
    .select({
      id: leases.id,
      unitId: leases.unitId,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentAmount: leases.rentAmount,
      status: leases.status,
      unitName: units.name,
      propertyName: properties.name,
      tenantFirst: tenants.firstName,
      tenantLast: tenants.lastName,
    })
    .from(leases)
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .where(eq(leases.id, leaseId))
    .limit(1);
  if (!lease) return null;

  const [readingRows, chargeRows, paymentRows] = await Promise.all([
    db
      .select({
        meterId: meters.id,
        meterType: meters.type,
        meterLabel: meters.label,
        periodMonth: meterReadings.periodMonth,
        previousReading: meterReadings.previousReading,
        currentReading: meterReadings.currentReading,
        consumption: meterReadings.consumption,
        rate: meterReadings.rate,
        amount: meterReadings.amount,
      })
      .from(meterReadings)
      .innerJoin(meters, eq(meterReadings.meterId, meters.id))
      .where(eq(meters.unitId, lease.unitId))
      .orderBy(asc(meterReadings.periodMonth)),
    db
      .select({
        id: charges.id,
        periodMonth: charges.periodMonth,
        type: charges.type,
        description: charges.description,
        amount: charges.amount,
      })
      .from(charges)
      .where(eq(charges.leaseId, leaseId)),
    db
      .select({
        amount: payments.amount,
        paidDate: payments.paidDate,
      })
      .from(payments)
      // Only payments the landlord verified count toward the balance — a
      // pending GCash submission must not quiet the charge it claims to pay.
      .where(and(eq(payments.leaseId, leaseId), eq(payments.status, "paid"))),
  ]);

  const startMonth = monthKey(lease.startDate);
  const nowMonth = currentMonthKey();
  const leaseEndMonth = lease.endDate ? monthKey(lease.endDate) : null;
  // Show up to the current month, or the lease's end month if it already ended.
  let endMonth = leaseEndMonth && leaseEndMonth < nowMonth ? leaseEndMonth : nowMonth;
  if (endMonth < startMonth) endMonth = startMonth;

  let range = listMonths(startMonth, endMonth);
  const maxMonths = options?.maxMonths ?? 12;
  if (range.length > maxMonths) range = range.slice(range.length - maxMonths);

  const readingsByMonth = new Map<string, UtilityLine[]>();
  for (const r of readingRows) {
    const list = readingsByMonth.get(r.periodMonth) ?? [];
    list.push({
      meterId: r.meterId,
      type: r.meterType,
      label: r.meterLabel,
      previousReading: Number(r.previousReading),
      currentReading: Number(r.currentReading),
      consumption: Number(r.consumption),
      rate: Number(r.rate),
      amount: Number(r.amount),
    });
    readingsByMonth.set(r.periodMonth, list);
  }

  const chargesByMonth = new Map<string, ChargeLine[]>();
  for (const c of chargeRows) {
    const list = chargesByMonth.get(c.periodMonth) ?? [];
    list.push({
      id: c.id,
      type: c.type,
      description: c.description,
      amount: Number(c.amount),
      manual: true,
    });
    chargesByMonth.set(c.periodMonth, list);
  }

  const paidByMonth = new Map<string, number>();
  for (const p of paymentRows) {
    const key = monthKey(p.paidDate);
    paidByMonth.set(key, (paidByMonth.get(key) ?? 0) + Number(p.amount));
  }

  const rentAmount = Number(lease.rentAmount);

  const months: MonthlyStatement[] = range.map((periodMonth) => {
    const utilityLines = readingsByMonth.get(periodMonth) ?? [];
    const manualLines = chargesByMonth.get(periodMonth) ?? [];

    const manualUtilityLines = manualLines.filter((c) =>
      utilityChargeTypes.includes(c.type),
    );
    const otherLines = manualLines.filter(
      (c) => !utilityChargeTypes.includes(c.type),
    );

    const electricity =
      utilityLines
        .filter((r) => r.type === "electric")
        .reduce((sum, r) => sum + r.amount, 0) +
      manualUtilityLines
        .filter((c) => c.type === "electricity")
        .reduce((sum, c) => sum + c.amount, 0);
    const water =
      utilityLines
        .filter((r) => r.type === "water")
        .reduce((sum, r) => sum + r.amount, 0) +
      manualUtilityLines
        .filter((c) => c.type === "water")
        .reduce((sum, c) => sum + c.amount, 0);
    const otherCharges = otherLines.reduce((sum, c) => sum + c.amount, 0);
    const rent = rentAmount;
    const chargesTotal = rent + electricity + water + otherCharges;
    const paid = paidByMonth.get(periodMonth) ?? 0;

    return {
      periodMonth,
      rent,
      electricity,
      water,
      otherCharges,
      chargesTotal,
      paid,
      balance: chargesTotal - paid,
      utilityLines,
      chargeLines: [...manualUtilityLines, ...otherLines],
    };
  });

  const totalCharges = months.reduce((s, m) => s + m.chargesTotal, 0);
  const totalPaid = months.reduce((s, m) => s + m.paid, 0);
  const currentMonth =
    months.find((m) => m.periodMonth === nowMonth) ?? null;

  return {
    leaseId: lease.id,
    unitName: lease.unitName,
    propertyName: lease.propertyName,
    tenantName: `${lease.tenantFirst} ${lease.tenantLast}`.trim(),
    rentAmount,
    status: lease.status,
    months,
    totalCharges,
    totalPaid,
    outstanding: totalCharges - totalPaid,
    currentMonth,
  };
}
