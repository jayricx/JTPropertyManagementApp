export const PLAN_TIERS = ["free", "starter", "pro", "business"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

// The ladder: Free 2 → Starter 10 → Pro 20 → Business 100 units.
//
// No plan is unlimited: Business caps at 100 units, and a portfolio offer for
// larger landlords is deliberately left for later — hence the `number | null`
// shape, ready for that tier to return one day. Every current tier is a number.
export const PLAN_UNIT_LIMITS: Record<PlanTier, number | null> = {
  free: 2,
  starter: 10,
  pro: 20,
  business: null,
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

// Annual is ten months' price — two months free, consistent across paid tiers.
export const PLAN_PRICES: Record<PlanTier, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 199, annual: 1990 },
  pro: { monthly: 399, annual: 3990 },
  business: { monthly: 1299, annual: 12990 },
};

export function unitLimit(plan: string | null | undefined): number | null {
  if (!plan || !PLAN_TIERS.includes(plan as PlanTier)) {
    return PLAN_UNIT_LIMITS.free;
  }
  return PLAN_UNIT_LIMITS[plan as PlanTier];
}