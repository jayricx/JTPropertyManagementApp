export const PLAN_TIERS = ["free", "pro", "business"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

// No plan is unlimited: Business caps at 100 units, and a portfolio offer for
// larger landlords is deliberately left for later — hence the `number | null`
// shape, ready for that tier to return one day. Every current tier is a number.
export const PLAN_UNIT_LIMITS: Record<PlanTier, number | null> = {
  free: 2,
  pro: 20,
  business: 100,
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export const PLAN_PRICES: Record<PlanTier, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 399, annual: 3990 },
  business: { monthly: 1299, annual: 12990 },
};

export function unitLimit(plan: string | null | undefined): number | null {
  if (!plan || !PLAN_TIERS.includes(plan as PlanTier)) {
    return PLAN_UNIT_LIMITS.free;
  }
  return PLAN_UNIT_LIMITS[plan as PlanTier];
}
