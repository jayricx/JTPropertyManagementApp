/**
 * Lease calendar events.
 *
 * Aggregates the dates a landlord wants to see on one month grid: rent due
 * dates (projected from the lease's billing periods), move-ins, and lease
 * ends. Everything here is a read — no events are stored; the calendar is a
 * projection of data that already lives on the lease row.
 *
 * All dates are UTC midnight, matching the app's `date`-mode columns and
 * `billing-periods.ts`.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { leases, payments, properties, tenants, units } from "@/db/schema";
import { accessiblePropertyIds } from "@/lib/access";
import {
  isoDate,
  periodIndexForDate,
  periodStartAt,
  resolveDueDay,
  utcDay,
} from "@/lib/billing-periods";

export type CalendarEventType = "rent_due" | "move_in" | "lease_end";

export interface CalendarEvent {
  type: CalendarEventType;
  /** UTC midnight of the day the event falls on. */
  date: Date;
  tenantName: string;
  unitName: string;
  propertyName: string;
  propertyId: string;
  leaseId: string;
  /** Rent due only: the rent the period asks for. */
  amount?: number;
  /**
   * Rent due only: paid rent payments bucketed into that billing period
   * (same bucketing the statements use). Rent due for a *future* period is
   * typically 0 until the tenant pays.
   */
  paidAmount?: number;
}

export const CALENDAR_EVENT_META: Record<
  CalendarEventType,
  { label: string; dotClass: string; chipClass: string }
> = {
  rent_due: {
    label: "Rent due",
    dotClass: "bg-sky-500 dark:bg-sky-400",
    chipClass:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-400",
  },
  move_in: {
    label: "Move-in",
    dotClass: "bg-emerald-500 dark:bg-emerald-400",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  },
  lease_end: {
    label: "Lease end",
    dotClass: "bg-amber-500 dark:bg-amber-400",
    chipClass:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
  },
};

/** First day (inclusive) and the day after the last (exclusive) of "YYYY-MM". */
export function monthBounds(month: string): { start: Date; end: Date } {
  const [year, monthIndex] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthIndex - 1, 1)),
    end: new Date(Date.UTC(year, monthIndex, 1)),
  };
}

/**
 * The month grid: six rows of seven cells, Sunday first. Cells outside the
 * month are null — the grid always renders a full rectangle, and the page
 * shows them muted and empty.
 */
export function buildMonthGrid(month: string): (Date | null)[] {
  const { start } = monthBounds(month);
  const daysInMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const leading = start.getUTCDay(); // 0 = Sunday
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 0; day < daysInMonth; day += 1) {
    cells.push(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day + 1)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Every calendar event on the active portfolio's leases for one month.
 *
 * Ended leases are excluded — the calendar is for what is happening or about
 * to happen. Rent due dates are the real billing-period boundaries, so a lease
 * due on the 31st simply has no event in months without a 31st... except the
 * clamped February due date, which IS a real boundary and shows on the 28th.
 */
export async function getCalendarEvents(
  userId: string,
  month: string,
): Promise<CalendarEvent[]> {
  const propertyIds = await accessiblePropertyIds(userId);
  if (propertyIds.length === 0) return [];

  const { start, end } = monthBounds(month);

  const rows = await db
    .select({
      leaseId: leases.id,
      propertyId: properties.id,
      status: leases.status,
      startDate: leases.startDate,
      endDate: leases.endDate,
      rentDueDay: leases.rentDueDay,
      rentAmount: leases.rentAmount,
      tenantFirst: tenants.firstName,
      tenantLast: tenants.lastName,
      unitName: units.name,
      propertyName: properties.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(leases.tenantId, tenants.id))
    .innerJoin(units, eq(leases.unitId, units.id))
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(
      and(
        inArray(properties.id, propertyIds),
        inArray(leases.status, ["upcoming", "active"]),
      ),
    );

  // Paid rent for these leases in a window wide enough to catch payments made
  // early or late for a period that starts inside the month. Bucketed per
  // period like the statements are, so coverage matches what the ledger says.
  const leaseIds = rows.map((r) => r.leaseId);
  const windowFrom = new Date(start.getTime() - 35 * 24 * 60 * 60 * 1000);
  const windowTo = new Date(end.getTime() + 35 * 24 * 60 * 60 * 1000);
  const paidRows = leaseIds.length
    ? await db
        .select({
          leaseId: payments.leaseId,
          amount: payments.amount,
          paidDate: payments.paidDate,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.leaseId, leaseIds),
            eq(payments.status, "paid"),
            eq(payments.type, "rent"),
            gte(payments.paidDate, windowFrom),
            lte(payments.paidDate, windowTo),
          ),
        )
    : [];

  // leaseId → (periodStartKey → collected amount)
  const collected = new Map<string, Map<string, number>>();
  for (const p of paidRows) {
    if (!p.leaseId) continue;
    const row = rows.find((r) => r.leaseId === p.leaseId);
    if (!row) continue;
    const leaseStart = utcDay(row.startDate);
    const dueDay = resolveDueDay(leaseStart, row.rentDueDay);
    const index = periodIndexForDate(utcDay(p.paidDate), leaseStart, dueDay);
    if (index < 0) continue;
    const key = isoDate(periodStartAt(index, leaseStart, dueDay));
    const perLease = collected.get(p.leaseId) ?? new Map<string, number>();
    perLease.set(key, (perLease.get(key) ?? 0) + Number(p.amount));
    collected.set(p.leaseId, perLease);
  }

  const events: CalendarEvent[] = [];

  for (const r of rows) {
    const leaseStart = utcDay(r.startDate);
    const leaseEnd = r.endDate ? utcDay(r.endDate) : null;
    const tenantName = `${r.tenantFirst} ${r.tenantLast}`.trim();
    const base = {
      tenantName,
      unitName: r.unitName,
      propertyName: r.propertyName,
      propertyId: r.propertyId,
      leaseId: r.leaseId,
    };

    // Move-in: the lease's own start day. Applies to upcoming leases too —
    // seeing tomorrow's move-ins is one of the calendar's main jobs.
    if (leaseStart >= start && leaseStart < end) {
      events.push({ ...base, type: "move_in", date: leaseStart });
    }

    // Lease end: an active lease whose term ends inside the month.
    if (r.status === "active" && leaseEnd && leaseEnd >= start && leaseEnd < end) {
      events.push({ ...base, type: "lease_end", date: leaseEnd });
    }

    // Rent due: walk the real billing-period boundaries across the month.
    if (r.status === "active") {
      const dueDay = resolveDueDay(leaseStart, r.rentDueDay);
      let index = periodIndexForDate(start, leaseStart, dueDay);
      if (index < 0) index = 0;
      // Boundaries strictly increase, so this always terminates.
      for (;; index += 1) {
        const due = periodStartAt(index, leaseStart, dueDay);
        if (due >= end) break;
        // Index 0 is the move-in day itself — already shown as a move-in;
        // duplicating it as a due date would double-book the day.
        if (index > 0 && due >= start) {
          // A term that ends mid-month has no rent due after it ends.
          if (!leaseEnd || due <= leaseEnd) {
            const paidAmount = collected.get(r.leaseId)?.get(isoDate(due)) ?? 0;
            events.push({
              ...base,
              type: "rent_due",
              date: due,
              amount: Number(r.rentAmount),
              paidAmount,
            });
          }
        }
      }
    }
  }

  return events;
}

/** Sort order within one day: money first, then arrivals, then departures. */
const TYPE_ORDER: Record<CalendarEventType, number> = {
  rent_due: 0,
  move_in: 1,
  lease_end: 2,
};

/** Group events by "YYYY-MM-DD", each day's list in stable display order. */
export function groupEventsByDay(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = isoDate(event.date);
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        a.tenantName.localeCompare(b.tenantName),
    );
  }
  return byDay;
}
