/**
 * Money helpers shared by the payment code. Kept dependency-free so it can be
 * unit-tested in isolation.
 */

/** Convert a peso amount (number, or numeric-as-string from the DB) to integer centavos. */
export function pesosToCentavos(amount: number | string): number {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}
