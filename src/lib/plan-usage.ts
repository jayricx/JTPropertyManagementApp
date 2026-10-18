"use server";

import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { portfolios, properties, units, users } from "@/db/schema";
import { PLAN_LABELS, type PlanTier, unitLimit } from "./plans";

export interface PlanUsage {
  plan: PlanTier;
  planLabel: string;
  used: number;
  limit: number | null;
  atLimit: boolean;
  remaining: number | null;
}

function usage(plan: PlanTier, used: number): PlanUsage {
  const limit = unitLimit(plan);
  return {
    plan,
    planLabel: PLAN_LABELS[plan] ?? plan,
    used,
    limit,
    atLimit: limit !== null && used >= limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

/**
 * Plan and unit usage for one portfolio.
 *
 * Billing stays on the account (`users.plan`) and a portfolio's plan is its
 * owner's — so a co-owner adding a unit is gated by the plan that actually
 * pays for it, instead of by their own (often unpaid) plan. This is what unit
 * creation checks.
 */
export async function getPortfolioUsage(portfolioId: string): Promise<PlanUsage> {
  const [portfolio] = await db
    .select({ ownerUserId: portfolios.ownerUserId })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!portfolio) return usage("free", 0);

  const [owner] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, portfolio.ownerUserId))
    .limit(1);

  const [row] = await db
    .select({ n: count() })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(eq(properties.portfolioId, portfolioId));

  return usage((owner?.plan as PlanTier | undefined) ?? "free", Number(row?.n ?? 0));
}

/**
 * Account-level usage for the Settings meter: the plan on the signed-in
 * account against the units in the portfolios they **own**. Co-owned
 * membership deliberately doesn't consume quota — otherwise a co-owner would
 * be blocked by, and charged for, someone else's portfolio.
 */
export async function getPlanUsage(userId: string): Promise<PlanUsage> {
  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const plan = (user?.plan as PlanTier | undefined) ?? "free";

  const owned = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.ownerUserId, userId));
  if (!owned.length) return usage(plan, 0);

  const [row] = await db
    .select({ n: count() })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(inArray(properties.portfolioId, owned.map((p) => p.id)));

  return usage(plan, Number(row?.n ?? 0));
}