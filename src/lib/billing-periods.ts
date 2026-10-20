/**
 * Billing periods.
 *
 * A lease is billed in periods running from one rent-due date to the next, not
 * in calendar months. A tenant who moved in on 14 February is billed
 * "14 Feb – 14 Mar", then "14 Mar – 14 Apr" — which is both how landlords
 * actually talk and the only version with no gap and no overlap.
 *
 * Calendar months are wrong at the edges: a tenant starting on 14 February was
 * previously charged a *full* month's rent for "February", a period beginning
 * 13 days before they moved in. Anchoring to the move-in day means the first
 * period starts on the day the tenant actually arrived, and every later period
 * starts on the day rent is due.
 *
 * All dates here are UTC midnight, matching the app's `date`-mode columns.
 */

/** "YYYY-MM-DD" — the storage form used for period boundaries. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" back to UTC midnight. */
export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/**
 * Normalize a stored `date` column to UTC midnight of the calendar day it
 * represents.
 *
 * The driver parses a date-only column into a JS Date at *local* midnight, so
 * on a server east of UTC the instant lands on the previous day in UTC (and
 * west of it, the next). The local calendar parts are still the day the
 * landlord picked, so rebuilding from those recovers it regardless of the
 * server's timezone.
 */
export function utcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  );
}

/**
 * The day rent falls due each period.
 *
 * Falls back to the lease's start day, which is what every existing lease does
 * and what the overwhelming majority of PH leases do anyway — you move in, and
 * you pay on the same date each month.
 */
export function resolveDueDay(
  startDate: Date,
  rentDueDay: number | null | undefined,
): number {
  if (rentDueDay && rentDueDay >= 1 && rentDueDay <= 31) return rentDueDay;
  return startDate.getUTCDate();
}

/**
 * The due date inside a given month, clamped to that month's length.
 *
 * Clamping is not an edge case to shrug at: a lease due on the 31st still has
 * to bill *something* in February, and skipping the period would leave a month
 * unbilled.
 */
export function dueDayInMonth(
  year: number,
  monthIndex: number,
  dueDay: number,
): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(dueDay, lastDay)));
}

/**
 * The start of period `index`: the lease start date for the first period, and
 * the due date in the matching month for every one after it.
 */
export function periodStartAt(
  index: number,
  leaseStart: Date,
  dueDay: number,
): Date {
  if (index <= 0) return leaseStart;
  return dueDayInMonth(
    leaseStart.getUTCFullYear(),
    leaseStart.getUTCMonth() + index,
    dueDay,
  );
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

/**
 * The period a date falls in, as its start key, or null if it predates the
 * lease.
 */
export function periodKeyForDate(
  date: Date,
  leaseStart: Date,
  dueDay: number,
): string | null {
  const index = periodIndexForDate(date, leaseStart, dueDay);
  return index < 0 ? null : isoDate(periodStartAt(index, leaseStart, dueDay));
}

/**
 * Which period a date falls in, or -1 if it predates the lease.
 *
 * The month count is only a starting guess: it is then walked onto real
 * boundaries. Arithmetic alone gets this wrong whenever the due day is clamped
 * — a lease due on the 31st has no 31st in February, so "two months after
 * December" is not February 31st, and guessing lands the date in the wrong
 * period.
 */
export function periodIndexForDate(
  date: Date,
  leaseStart: Date,
  dueDay: number,
): number {
  if (date.getTime() < leaseStart.getTime()) return -1;
  let index = monthsBetween(leaseStart, date);
  while (index > 0 && date.getTime() < periodStartAt(index, leaseStart, dueDay).getTime()) {
    index -= 1;
  }
  while (date.getTime() >= periodStartAt(index + 1, leaseStart, dueDay).getTime()) {
    index += 1;
  }
  return index;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export interface BillingPeriod {
  /** "YYYY-MM-DD" — the day this period begins. */
  start: string;
  /**
   * "YYYY-MM-DD" — the day the *next* period begins. This is the boundary, not
   * a last-day: the next period's rent is due on this date.
   */
  end: string;
  /** "Feb 14 – Mar 14, 2025", for display. */
  label: string;
  /** Stable bucket key — the period's start date. */
  key: string;
}

/**
 * Every billing period for a lease, oldest first, through `through`.
 *
 * The final period is returned in full, so its end boundary runs past `through`
 * — a statement captured mid-period still shows where that period ends.
 */
export function buildBillingPeriods(options: {
  leaseStart: Date;
  dueDay: number;
  through?: Date;
  /** Keeps only the most recent N periods. */
  maxPeriods?: number;
}): BillingPeriod[] {
  const { leaseStart, dueDay } = options;
  const through = options.through ?? new Date();
  if (through.getTime() < leaseStart.getTime()) return [];

  const periods: BillingPeriod[] = [];
  // Bounded so a corrupt far-future start date cannot spin here forever.
  for (let index = 0; index < 600; index += 1) {
    const start = periodStartAt(index, leaseStart, dueDay);
    if (start.getTime() > through.getTime()) break;
    const end = periodStartAt(index + 1, leaseStart, dueDay);
    periods.push({
      start: isoDate(start),
      end: isoDate(end),
      label: formatBillingPeriod(start, end),
      key: isoDate(start),
    });
  }
  return options.maxPeriods ? periods.slice(-options.maxPeriods) : periods;
}

/**
 * "Feb 14 – Mar 14, 2025".
 *
 * The year rides on the end date, and a cross-year period carries both:
 * "Dec 14, 2024 – Jan 14, 2025". A single year would apply to neither boundary
 * and be worse than no year at all.
 */
export function formatBillingPeriod(start: Date, end: Date): string {
  const short = (d: Date) =>
    d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return start.getUTCFullYear() === end.getUTCFullYear()
    ? `${short(start)} – ${short(end)}, ${end.getUTCFullYear()}`
    : `${short(start)}, ${start.getUTCFullYear()} – ${short(end)}, ${end.getUTCFullYear()}`;
}

/**
 * Where a legacy calendar-month charge belongs now.
 *
 * Charges recorded before billing periods existed carry a bare "YYYY-MM" and no
 * dates, so they have to be interpreted. The period containing the *last* day of
 * that month is the one a landlord meant: for a lease due on the 1st it is
 * exactly that calendar month, and for one due on the 14th it is the period
 * covering the bulk of it.
 */
export function legacyMonthPeriodIndex(
  legacyMonth: string,
  leaseStart: Date,
  dueDay: number,
): number {
  const [year, month] = legacyMonth.split("-").map(Number);
  if (!year || !month) return 0;
  return periodIndexForDate(new Date(Date.UTC(year, month, 0)), leaseStart, dueDay);
}

/** The start key of the period a legacy "YYYY-MM" charge/reading belongs to. */
export function legacyMonthPeriodKey(
  legacyMonth: string,
  leaseStart: Date,
  dueDay: number,
): string | null {
  const index = legacyMonthPeriodIndex(legacyMonth, leaseStart, dueDay);
  return index < 0 ? null : isoDate(periodStartAt(index, leaseStart, dueDay));
}