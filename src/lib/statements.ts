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
import {
  buildBillingPeriods,
  formatBillingPeriod,
  isoDate,
  legacyMonthPeriodKey,
  periodKeyForDate,
  periodStartAt,
  resolveDueDay,
  utcDay,
  type BillingPeriod,
} from "@/lib/billing-periods";
import { todayInManila } from "@/lib/utils";

/**
 * A tenant's monthly statement of account — the missing "who owes what" view.
 *
 * The app used to be income-only and rent-only: a lease carried a single
 * `rentAmount` and payments were just recorded cash. A statement is computed
 * (never stored) from four sources so nothing can drift out of sync:
 *
 * - **Rent** — the lease's `rentAmount`, charged once per billing period.
 * - **Utilities** — `meterReadings` for the lease's unit (sub-metered
 *   consumption × rate), plus any manual `charges` typed electricity/water
 *   (for landlords who split the actual bill by proportion).
 * - **Other charges** — `charges` typed dues/penalty/other.
 * - **Payments** — `payments` for the lease, bucketed into the period their
 *   `paidDate` falls in. A GCash/card payment covers everything in one lump,
 *   so it simply reduces that period's balance.
 *
 * A period runs from one rent-due date to the next, so a tenant who moved in on
 * 14 February is billed "14 Feb – 14 Mar", not "February". That is both how
 * landlords talk and the only version that never bills days before the tenant
 * arrived.
 *
 * `outstanding` (total charged − total paid, over the shown range) is the
 * honest arrears figure; `amountDue` is the period balance, which is what the
 * portal offers to collect so a tenant is never asked for a runaway lump sum in
 * one go.
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
  /**
   * The billing period this row covers, as exact dates.
   *
   * `periodStart` is the day rent falls due for this period and `periodEnd` the
   * day it falls due for the next one — so a tenant sees "14 Feb – 14 Mar" and
   * knows precisely what a payment settles, rather than inferring it from a
   * month name.
   */
  periodStart: string;
  periodEnd: string;
  /** "Feb 14 – Mar 14, 2025", ready to display. */
  label: string;
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
  /** The day of the month rent falls due, anchoring every period below. */
  dueDay: number;
  /** Every period on the lease, newest first — for the add-charge picker. */
  chargePeriods: BillingPeriod[];
  propertyName: string;
  tenantName: string;
  rentAmount: number;
  status: LeaseStatus;
  months: MonthlyStatement[];
  totalCharges: number;
  totalPaid: number;
  outstanding: number;
  /** The period containing today, when the lease reaches it. */
  currentMonth: MonthlyStatement | null;
}

// ---------------------------------------------------------------------------
// How a tenant's balance is described in words
// ---------------------------------------------------------------------------

/**
 * What is actually in this tenant's balance, as words.
 *
 * Most house rentals in the Philippines are *not* sub-metered — the tenant has
 * their own Meralco or Maynilad account and pays it directly, so power they use
 * never touches the landlord at all. Telling those tenants their balance
 * "includes the electricity and water you've used" is simply false, and it
 * reads as though the landlord is billing them for utilities they already paid
 * someone else.
 *
 * So this is derived from the statement rather than asserted. A lease with no
 * meter readings and no utility charges says nothing about electricity, and the
 * copy says nothing about electricity either. Where they *are* sub-metered, the
 * meter language is correct and stays.
 *
 * Over the whole statement rather than the current month: this describes the
 * lease's arrangement, not one period's bill.
 */
export function balanceComposition(statement: LeaseStatement): {
  electricity: boolean;
  water: boolean;
  charges: boolean;
  /** Short, for "(rent, electricity and water)". */
  label: string;
  /** A full sentence fragment for body copy. */
  sentence: string;
} {
  const electricity = statement.months.some((m) => Number(m.electricity) > 0);
  const water = statement.months.some((m) => Number(m.water) > 0);
  const charges = statement.months.some((m) => Number(m.otherCharges) > 0);

  const utilities = [
    electricity ? "electricity" : null,
    water ? "water" : null,
  ].filter(Boolean);
  const utilityPhrase =
    utilities.length === 2
      ? "electricity and water"
      : (utilities[0] ?? "");

  const pieces = ["rent"];
  if (utilityPhrase) pieces.push(utilityPhrase);
  if (charges) pieces.push("other charges");

  const label =
    pieces.length === 1 ? "rent" : `rent, ${pieces.slice(1).join(" and ")}`;

  // "Your balance is rent" reads wrong: it equates a number to a category.
  // The possessive puts it back — the balance *is* the tenant's rent, not rent
  // in general. The rent-only case also says what is absent, because "is there
  // something I forgot about utilities?" is the question a tenant lands on here.
  const sentence = utilityPhrase
    ? `Your balance is your rent plus the ${utilityPhrase} your landlord has read from your meter${
        charges ? ", and any other charges added" : ""
      }.`
    : charges
      ? "Your balance is your rent plus any other charges your landlord has added."
      : "Your balance is your rent. No utilities or other charges have been added.";

  return { electricity, water, charges, label, sentence };
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
      rentDueDay: leases.rentDueDay,
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
        periodStart: charges.periodStart,
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

  const leaseStart = utcDay(lease.startDate);
  const leaseEnd = lease.endDate ? utcDay(lease.endDate) : null;
  const dueDay = resolveDueDay(leaseStart, lease.rentDueDay);
  const today = todayInManila();

  // The statement runs from the lease start to today — or to the end of the
  // lease when that has already passed — bounded to the most recent periods.
  const through =
    leaseEnd && leaseEnd.getTime() < today.getTime() ? leaseEnd : today;
  const maxMonths = options?.maxMonths ?? 12;
  const periods = buildBillingPeriods({
    leaseStart,
    dueDay,
    through,
    maxPeriods: maxMonths,
  });

  const rentAmount = Number(lease.rentAmount);
  // One row per billing period, keyed by the period's start date so anything
  // dated can be placed without guessing which "month" it belongs to.
  const rows = new Map<string, MonthlyStatement>(
    periods.map((period) => [
      period.key,
      {
        periodStart: period.start,
        periodEnd: period.end,
        label: period.label,
        rent: rentAmount,
        electricity: 0,
        water: 0,
        otherCharges: 0,
        chargesTotal: 0,
        paid: 0,
        balance: 0,
        utilityLines: [],
        chargeLines: [],
      },
    ]),
  );

  for (const r of readingRows) {
    // Readings are still keyed by calendar month; the period containing that
    // month's last day is the one the reading was taken for.
    const key = legacyMonthPeriodKey(r.periodMonth, leaseStart, dueDay);
    const row = key ? rows.get(key) : undefined;
    if (!row) continue;
    row.utilityLines.push({
      meterId: r.meterId,
      type: r.meterType,
      label: r.meterLabel,
      previousReading: Number(r.previousReading),
      currentReading: Number(r.currentReading),
      consumption: Number(r.consumption),
      rate: Number(r.rate),
      amount: Number(r.amount),
    });
  }

  for (const c of chargeRows) {
    // New charges carry exact period dates; older ones only a calendar month,
    // which is interpreted the same way as a reading above.
    const key = c.periodStart
      ? isoDate(utcDay(c.periodStart))
      : c.periodMonth
        ? legacyMonthPeriodKey(c.periodMonth, leaseStart, dueDay)
        : null;
    const row = key ? rows.get(key) : undefined;
    if (!row) continue;
    row.chargeLines.push({
      id: c.id,
      type: c.type,
      description: c.description,
      amount: Number(c.amount),
      manual: true,
    });
  }

  for (const p of paymentRows) {
    const key = periodKeyForDate(utcDay(p.paidDate), leaseStart, dueDay);
    const row = key ? rows.get(key) : undefined;
    if (row) row.paid += Number(p.amount);
  }

  const months = [...rows.values()];
  for (const row of months) {
    const manualUtilityLines = row.chargeLines.filter((c) =>
      utilityChargeTypes.includes(c.type),
    );
    const otherLines = row.chargeLines.filter(
      (c) => !utilityChargeTypes.includes(c.type),
    );

    row.electricity =
      row.utilityLines
        .filter((r) => r.type === "electric")
        .reduce((sum, r) => sum + r.amount, 0) +
      manualUtilityLines
        .filter((c) => c.type === "electricity")
        .reduce((sum, c) => sum + c.amount, 0);
    row.water =
      row.utilityLines
        .filter((r) => r.type === "water")
        .reduce((sum, r) => sum + r.amount, 0) +
      manualUtilityLines
        .filter((c) => c.type === "water")
        .reduce((sum, c) => sum + c.amount, 0);
    row.otherCharges = otherLines.reduce((sum, c) => sum + c.amount, 0);
    row.chargesTotal =
      row.rent + row.electricity + row.water + row.otherCharges;
    row.balance = row.chargesTotal - row.paid;
    row.chargeLines = [...manualUtilityLines, ...otherLines];
  }

  const totalCharges = months.reduce((s, m) => s + m.chargesTotal, 0);
  const totalPaid = months.reduce((s, m) => s + m.paid, 0);

  const currentKey = periodKeyForDate(today, leaseStart, dueDay);
  const currentMonth = (currentKey ? rows.get(currentKey) : undefined) ?? null;

  // Every period for the add-charge picker, including the one starting next —
  // landlords bill upcoming dues as often as they chase old ones.
  const chargeThrough =
    through.getTime() > leaseStart.getTime() ? through : leaseStart;
  const chargeHistory = buildBillingPeriods({
    leaseStart,
    dueDay,
    through: chargeThrough,
  });
  const nextIndex = chargeHistory.length;
  const nextStart = periodStartAt(nextIndex, leaseStart, dueDay);
  const nextEnd = periodStartAt(nextIndex + 1, leaseStart, dueDay);
  const upcoming: BillingPeriod[] =
    !leaseEnd || nextStart.getTime() <= leaseEnd.getTime()
      ? [
          {
            start: isoDate(nextStart),
            end: isoDate(nextEnd),
            label: formatBillingPeriod(nextStart, nextEnd),
            key: isoDate(nextStart),
          },
        ]
      : [];
  const chargePeriods = [...chargeHistory, ...upcoming]
    .slice(-24)
    .reverse();

  return {
    leaseId: lease.id,
    unitName: lease.unitName,
    dueDay,
    chargePeriods,
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
