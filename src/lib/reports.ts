import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, leases, payments, properties, units } from "@/db/schema";
import { accessiblePropertyIds } from "@/lib/access";

/**
 * Report engine shared by the `/reports` page and the CSV download route.
 * Everything is scoped to properties the user can access (owned + co-owned)
 * and bucketed into calendar months (UTC) so on-screen numbers and exports
 * always match.
 */

export const REPORT_MONTH_OPTIONS = [3, 6, 12, 24] as const;
export const DEFAULT_REPORT_MONTHS = 12;
const MAX_REPORT_MONTHS = 60;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Parse a `?months=` value into a safe bucket count. */
export function normalizeMonths(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REPORT_MONTHS;
  return Math.min(MAX_REPORT_MONTHS, Math.trunc(n));
}

const MAX_REPORT_PROPERTIES = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a `?properties=` value (comma-separated ids) into a filter list.
 * Returns null when nothing usable is present — meaning "no filter".
 */
export function normalizePropertyFilter(
  raw: string | null | undefined,
): string[] | null {
  if (!raw) return null;
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s)),
    ),
  ];
  return ids.length ? ids.slice(0, MAX_REPORT_PROPERTIES) : null;
}

export interface MonthBucket {
  key: string; // "2026-01"
  label: string; // "Jan 2026"
  shortLabel: string; // "Jan"
  start: Date; // first instant of the month (UTC)
  end: Date; // last instant of the month (UTC)
}

/** Calendar month buckets for the last `months` months, oldest first. */
export function monthBuckets(months: number, now = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const baseYear = now.getUTCFullYear();
  const baseMonth = now.getUTCMonth() - (months - 1);

  for (let i = 0; i < months; i++) {
    const first = new Date(Date.UTC(baseYear, baseMonth + i, 1));
    const nextFirst = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1),
    );
    buckets.push({
      key: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_SHORT[first.getUTCMonth()]} ${first.getUTCFullYear()}`,
      shortLabel: MONTH_SHORT[first.getUTCMonth()],
      start: first,
      end: new Date(nextFirst.getTime() - 1),
    });
  }
  return buckets;
}

function bucketIndexFor(buckets: MonthBucket[], date: Date): number {
  const t = date.getTime();
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < buckets[mid].start.getTime()) hi = mid - 1;
    else if (t > buckets[mid].end.getTime()) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export interface CashFlowRow {
  key: string;
  label: string;
  shortLabel: string;
  income: number;
  expenses: number;
  net: number;
}

export interface PnlRow {
  /** property id, or "unassigned" for records booked to no property. */
  key: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface OccupancyRow {
  key: string;
  label: string;
  shortLabel: string;
  /** Units with a lease covering at least one day of the month. */
  occupied: number;
  /** Units that existed at any point of the month. */
  total: number;
  /** Percentage (0–100); 0 when there were no units. */
  rate: number;
}

export interface ReportData {
  months: number;
  buckets: MonthBucket[];
  cashFlow: CashFlowRow[];
  pnl: PnlRow[];
  occupancy: OccupancyRow[];
  totals: {
    income: number;
    expenses: number;
    net: number;
    /** Average monthly occupancy across months that had units. */
    avgOccupancy: number;
  };
}

function finalizePnl(pnlMap: Map<string, PnlRow>): PnlRow[] {
  const rows = [...pnlMap.values()].map((r) => ({ ...r, net: r.income - r.expenses }));
  // Biggest net first, unassigned last.
  return rows.sort((a, b) => {
    if (a.key === "unassigned") return 1;
    if (b.key === "unassigned") return -1;
    return b.net - a.net;
  });
}

/**
 * Build every report for the accessible portfolio over the last `months`
 * calendar months. One function feeds both the page and the CSV route so
 * the numbers can never drift apart.
 *
 * `propertyFilter` narrows every figure to the given properties (records
 * with no property — "unassigned" — drop out while a filter is active).
 * It is intersected with the user's accessible properties here, so a
 * crafted id list can never widen access.
 */
export async function getReportData(
  userId: string,
  months: number,
  propertyFilter: string[] | null = null,
): Promise<ReportData> {
  const buckets = monthBuckets(months);
  const from = buckets[0].start;
  const to = buckets[buckets.length - 1].end;
  const now = new Date();
  const accessibleIds = await accessiblePropertyIds(userId);
  const accessibleSet = new Set(accessibleIds);
  const requested = propertyFilter?.filter((id) => accessibleSet.has(id));
  const filtered = !!requested?.length;
  // With no filter (or nothing usable requested), keep the full scope.
  const scopeIds = requested?.length ? requested : accessibleIds;

  const [propertyRows, paymentRows, expenseRows, leaseRows, unitRows] =
    await Promise.all([
      db
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(inArray(properties.id, scopeIds)),
      db
        .select({
          amount: payments.amount,
          paidDate: payments.paidDate,
          // Already joined: payments → leases → units → properties.
          propertyId: properties.id,
        })
        .from(payments)
        .leftJoin(leases, eq(payments.leaseId, leases.id))
        .leftJoin(units, eq(leases.unitId, units.id))
        .leftJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(
            gte(payments.paidDate, from),
            lte(payments.paidDate, to),
            // A property filter counts only those properties (payments with
            // no lease/property drop out). Otherwise: own records (incl.
            // unassigned) plus accessible properties.
            filtered
              ? inArray(properties.id, scopeIds)
              : or(
                  eq(payments.userId, userId),
                  inArray(properties.id, scopeIds),
                ),
          ),
        ),
      db
        .select({
          amount: expenses.amount,
          expenseDate: expenses.expenseDate,
          propertyId: expenses.propertyId,
        })
        .from(expenses)
        .where(
          and(
            gte(expenses.expenseDate, from),
            lte(expenses.expenseDate, to),
            filtered
              ? inArray(expenses.propertyId, scopeIds)
              : or(
                  eq(expenses.userId, userId),
                  inArray(expenses.propertyId, scopeIds),
                ),
          ),
        ),
      db
        .select({
          unitId: leases.unitId,
          startDate: leases.startDate,
          endDate: leases.endDate,
        })
        .from(leases)
        .innerJoin(units, eq(leases.unitId, units.id))
        .where(
          and(
            inArray(units.propertyId, scopeIds),
            // Leases starting after the period can never affect it.
            lte(leases.startDate, to),
          ),
        )
        .orderBy(asc(leases.startDate)),
      db
        .select({ id: units.id, createdAt: units.createdAt })
        .from(units)
        .where(inArray(units.propertyId, scopeIds)),
    ]);

  const propertyName = new Map(propertyRows.map((p) => [p.id, p.name]));

  // --- Cash flow: bucketed by transaction date ---------------------------
  const cashFlow: CashFlowRow[] = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    shortLabel: b.shortLabel,
    income: 0,
    expenses: 0,
    net: 0,
  }));
  for (const p of paymentRows) {
    const i = bucketIndexFor(buckets, p.paidDate);
    if (i >= 0) cashFlow[i].income += Number(p.amount);
  }
  for (const e of expenseRows) {
    const i = bucketIndexFor(buckets, e.expenseDate);
    if (i >= 0) cashFlow[i].expenses += Number(e.amount);
  }
  for (const row of cashFlow) row.net = row.income - row.expenses;

  // --- P&L by property over the whole period -----------------------------
  const pnlMap = new Map<string, PnlRow>();
  const pnlRow = (key: string, label: string): PnlRow => {
    let row = pnlMap.get(key);
    if (!row) {
      row = { key, label, income: 0, expenses: 0, net: 0 };
      pnlMap.set(key, row);
    }
    return row;
  };
  for (const p of paymentRows) {
    const key = p.propertyId ?? "unassigned";
    pnlRow(key, propertyName.get(key) ?? "Unassigned").income += Number(p.amount);
  }
  for (const e of expenseRows) {
    const key = e.propertyId ?? "unassigned";
    pnlRow(key, propertyName.get(key) ?? "Unassigned").expenses += Number(e.amount);
  }
  const pnl = finalizePnl(pnlMap);

  // --- Occupancy history -------------------------------------------------
  // A unit counts as occupied in a month when any of its leases covered at
  // least one day of that month (leases that had not started by the end of
  // the observation window are ignored). Units count toward a month only
  // when they existed by then. Deleted units drop out of history — an
  // acceptable approximation without an event log.
  const leasesByUnit = new Map<string, { start: Date; end: Date | null }[]>();
  for (const l of leaseRows) {
    const list = leasesByUnit.get(l.unitId) ?? [];
    list.push({ start: l.startDate, end: l.endDate });
    leasesByUnit.set(l.unitId, list);
  }

  const occupancy: OccupancyRow[] = buckets.map((b) => {
    // For the current month, only count time up to "now".
    const windowEnd =
      b.end.getTime() > now.getTime() ? now : b.end;
    const existing = unitRows.filter((u) => u.createdAt.getTime() <= windowEnd.getTime());
    let occupied = 0;
    for (const u of existing) {
      const unitLeases = leasesByUnit.get(u.id) ?? [];
      const hit = unitLeases.some((l) => {
        if (l.start.getTime() > windowEnd.getTime()) return false;
        if (l.end && l.end.getTime() < b.start.getTime()) return false;
        return true;
      });
      if (hit) occupied++;
    }
    const total = existing.length;
    return {
      key: b.key,
      label: b.label,
      shortLabel: b.shortLabel,
      occupied,
      total,
      rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
    };
  });

  const totalIncome = cashFlow.reduce((s, r) => s + r.income, 0);
  const totalExpenses = cashFlow.reduce((s, r) => s + r.expenses, 0);
  const rated = occupancy.filter((r) => r.total > 0);
  const avgOccupancy = rated.length
    ? Math.round(rated.reduce((s, r) => s + r.rate, 0) / rated.length)
    : 0;

  return {
    months,
    buckets,
    cashFlow,
    pnl,
    occupancy,
    totals: {
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      avgOccupancy,
    },
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Escape one CSV field (RFC 4180: quote when needed, double the quotes). */
function csvField(value: string | number): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Render a CSV document with a header row (CRLF line endings for Excel). */
export function toCsv(
  headers: string[],
  rows: (string | number)[][],
): string {
  const lines = [
    headers.map(csvField).join(","),
    ...rows.map((row) => row.map(csvField).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
