"use server";

import { count, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { properties, units, users } from "@/db/schema";
import {
  PLAN_LABELS,
  PLAN_UNIT_LIMITS,
  type PlanTier,
  unitLimit,
} from "./plans";

export interface PlanUsage {
  plan: PlanTier;
  planLabel: string;
  used: number;
  limit: number | null;
  atLimit: boolean;
  remaining: number | null;
}

export async function getPlanUsage(userId: string): Promise<PlanUsage> {
  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const plan = (user?.plan as PlanTier | undefined) ?? "free";
  const limit = unitLimit(plan);
  const [row] = await db
    .select({ n: count() })
    .from(units)
    .innerJoin(properties, eq(units.propertyId, properties.id))
    .where(eq(properties.userId, userId));

  const used = Number(row?.n ?? 0);
  const atLimit = limit !== null && used >= limit;
  const remaining = limit === null ? null : Math.max(0, limit - used);

  return {
    plan,
    planLabel: PLAN_LABELS[plan] ?? plan,
    used,
    limit,
    atLimit,
    remaining,
  };
}

export async function requireCurrentUserUsage(): Promise<PlanUsage> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }
  return getPlanUsage(session.user.id);
}
