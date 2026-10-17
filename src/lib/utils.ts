export { cn } from "cn";

/** App-wide display currency. */
export const CURRENCY = "PHP";

/** Matches a canonical UUID — guards DB queries against malformed route params. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function formatCurrency(
  value: number | string,
  options?: { maximumFractionDigits?: number },
): string {
  const amount = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(amount)) return `₱0`;
  return amount.toLocaleString("en-PH", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  });
}

/** Formats a date (or date-like value) as e.g. "Oct 11, 2026". */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Billing months ("YYYY-MM") — shared by the statement, meters, and the pay flow
// ---------------------------------------------------------------------------

/** The Philippine calendar month of a date, as "YYYY-MM". */
export function monthKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).format(date); // "YYYY-MM"
}

/** The current Philippine calendar month, as "YYYY-MM". */
export function currentMonthKey(): string {
  return monthKey(new Date());
}

/**
 * Today's calendar date in Philippine time, as UTC midnight — the same
 * representation the app's `date`-mode columns use, so a stored day always
 * reads back as the day it was entered.
 */
export function todayInManila(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD"
  return new Date(`${iso}T00:00:00Z`);
}

/** True for a well-formed "YYYY-MM" string (months 01–12). */
export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Shift a "YYYY-MM" key by `delta` months (negative goes back). */
export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (((total % 12) + 12) % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/** Every "YYYY-MM" from `start` to `end` inclusive (both "YYYY-MM"). */
export function listMonths(start: string, end: string): string[] {
  if (!isValidMonth(start) || !isValidMonth(end) || end < start) return [];
  const [startYear, startMon] = start.split("-").map(Number);
  const [endYear, endMon] = end.split("-").map(Number);
  const months: string[] = [];
  let year = startYear;
  let month = startMon;
  while (year < endYear || (year === endYear && month <= endMon)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** "2026-10" → "October 2026" for display. */
export function formatPeriodMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  if (!year || !month) return periodMonth;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}


/**
 * ISO dates (YYYY-MM-DD) for `day` in every month from `startMonth` to
 * `endMonth` inclusive (both "YYYY-MM"). Each date is clamped to its month's
 * length, so day 31 gives Jan 31, Feb 28/29, Apr 30, … Callers cap the range
 * (the payment dialog allows 36 months).
 */
export function monthRangeDates(
  startMonth: string,
  endMonth: string,
  day: number,
): string[] {
  const [startYear, startMon] = startMonth.split("-").map(Number);
  const [endYear, endMon] = endMonth.split("-").map(Number);
  const dates: string[] = [];
  let year = startYear;
  let month = startMon;
  while (year < endYear || (year === endYear && month <= endMon)) {
    // Day 0 of the next month is the last day of this month.
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dd = String(Math.min(day, lastDay)).padStart(2, "0");
    dates.push(`${year}-${String(month).padStart(2, "0")}-${dd}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}
