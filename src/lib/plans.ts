export const PLAN_TIERS = ["free", "starter", "pro", "business"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

// The ladder: Free 5 → Starter 12 → Pro 25 → Business (unlimited).
//
// Business remains unlimited, which is why the `number | null` shape still
// stands: `null` means "no cap", and `atLimit`/`remaining` already handle it.
export const PLAN_UNIT_LIMITS: Record<PlanTier, number | null> = {
  free: 5,
  starter: 12,
  pro: 25,
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