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
