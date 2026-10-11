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
