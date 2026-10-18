import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portfolios, users } from "@/db/schema";
import {
  PLAN_LABELS,
  PLAN_TIERS,
  PLAN_UNIT_LIMITS,
  type PlanTier,
} from "@/lib/plans";

/**
 * Operator view of landlord accounts.
 *
 * There is no subscription table: `users.plan` is the whole truth, set by
 * hand while billing is off. So this reports the plan *and* the usage that
 * makes it interesting — how many units a landlord actually runs against the
 * cap, which is what tells you who is one upgrade away.
 */

export interface LandlordAccount {
  id: string;
  name: string | null;
  email: string;
  plan: PlanTier;
  isAdmin: boolean;
  createdAt: Date;
  /** Portfolios they own. */
  portfolioCount: number;
  /** Properties across those portfolios. */
  propertyCount: number;
  /** People they've invited into them. */
  memberCount: number;
  /** Units counted against their plan. */
  unitCount: number;
  unitLimit: number | null;
  /** 0–1; 1 means they're at (or over) their cap. */
  usageRatio: number;
  atLimit: boolean;
}

export async function landlordAccounts(): Promise<LandlordAccount[]> {
  // Fully qualified: inside these subqueries a bare "id" would resolve to the
  // joined table's id (portfolio_members, portfolios) rather than the user.
  const userId = sql.raw('"users"."id"');

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      plan: users.plan,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      portfolioCount: sql<number>`(
        select count(*)::int from portfolios p where p.owner_user_id = ${userId}
      )`,
      propertyCount: sql<number>`(
        select count(*)::int from properties pr
        where pr.portfolio_id in (select pf.id from portfolios pf where pf.owner_user_id = ${userId})
      )`,
      memberCount: sql<number>`(
        select count(distinct pm.user_id)::int from portfolio_members pm
        join portfolios p on p.id = pm.portfolio_id
        where p.owner_user_id = ${userId}
      )`,
      unitCount: sql<number>`(
        select count(*)::int from units un
        join properties pr on pr.id = un.property_id
        where pr.portfolio_id in (select pf.id from portfolios pf where pf.owner_user_id = ${userId})
      )`,
    })
    .from(users)
    .where(eq(users.role, "landlord"))
    .orderBy(desc(users.createdAt));

  return rows.map((row) => {
    const plan = (row.plan ?? "free") as PlanTier;
    const limit = PLAN_UNIT_LIMITS[plan] ?? null;
    return {
      ...row,
      plan,
      unitLimit: limit,
      usageRatio: limit ? Math.min(1, row.unitCount / limit) : 0,
      atLimit: limit !== null && row.unitCount >= limit,
    };
  });
}

/** How many accounts sit on each tier — the first thing an operator asks. */
export async function planBreakdown(): Promise<{
  plan: PlanTier;
  label: string;
  accounts: number;
}[]> {
  const rows = await db
    .select({ plan: users.plan, accounts: count() })
    .from(users)
    .where(eq(users.role, "landlord"))
    .groupBy(users.plan);

  const byPlan = new Map(rows.map((r) => [r.plan as PlanTier, Number(r.accounts)]));
  return PLAN_TIERS.map((plan) => ({
    plan,
    label: PLAN_LABELS[plan],
    accounts: byPlan.get(plan) ?? 0,
  }));
}

/** Tenant-role accounts, kept separate — they never carry a plan. */
export async function tenantAccountCount(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "tenant"));
  return Number(row?.n ?? 0);
}

/** Shared with the inbox page so a new admin tool is one link away. */
export async function portfolioOwnerLabel(
  portfolioId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(portfolios)
    .innerJoin(users, eq(users.id, portfolios.ownerUserId))
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  return row ? (row.name ?? row.email) : null;
}