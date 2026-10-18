import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portfolioMembers, portfolios, users } from "@/db/schema";

/**
 * Portfolios — the bucket that owns properties, tenants and custom-field
 * definitions. An account reaches one through `portfolio_members` with a role:
 *
 * - `owner`     full control: field definitions, members, payout details
 * - `co_owner`  manages properties/tenants/leases and custom-field *values*
 * - `viewer`    read-only
 *
 * Every user is provisioned one portfolio silently, so a solo owner never
 * sees this concept unless they invite a co-owner or open a second one.
 */

export type PortfolioRole = "owner" | "co_owner" | "viewer";

/** Cookie holding the portfolio the user is currently looking at. */
const ACTIVE_COOKIE = "rb_active_portfolio";

export interface PortfolioSummary {
  id: string;
  name: string;
  role: PortfolioRole;
  propertyCount: number;
}

/**
 * Every portfolio the account belongs to, oldest first. Single-portfolio
 * users never need the switcher, so this usually returns one row.
 */
export const portfoliosForUser = cache(async (userId: string) => {
  return db
    .select({
      id: portfolios.id,
      name: portfolios.name,
      role: portfolioMembers.role,
      createdAt: portfolios.createdAt,
    })
    .from(portfolioMembers)
    .innerJoin(portfolios, eq(portfolios.id, portfolioMembers.portfolioId))
    .where(eq(portfolioMembers.userId, userId))
    .orderBy(asc(portfolios.createdAt));
});

/** Portfolio ids the account is a member of. */
export async function portfolioIdsFor(userId: string): Promise<string[]> {
  const rows = await portfoliosForUser(userId);
  return rows.map((r) => r.id);
}

/** The member's role in a portfolio, or null when they aren't a member. */
export async function roleInPortfolio(
  userId: string,
  portfolioId: string,
): Promise<PortfolioRole | null> {
  const [row] = await db
    .select({ role: portfolioMembers.role })
    .from(portfolioMembers)
    .where(
      and(
        eq(portfolioMembers.portfolioId, portfolioId),
        eq(portfolioMembers.userId, userId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

/**
 * The portfolio in context: the one in the cookie when the user still has
 * access to it, otherwise their earliest membership. Cached per request so the
 * several access helpers that need it cost one query between them.
 */
export const activePortfolioId = cache(async (userId: string) => {
  const rows = await portfoliosForUser(userId);
  if (rows.length === 0) return null;
  // Outside a request scope (scripts, tests) there are no cookies — fall back
  // to the earliest membership rather than throwing.
  let wanted: string | undefined;
  try {
    wanted = (await cookies()).get(ACTIVE_COOKIE)?.value;
  } catch {
    wanted = undefined;
  }
  return rows.some((r) => r.id === wanted) ? (wanted as string) : rows[0].id;
});

/** The active portfolio with the member's role and size, or null. */
export async function activePortfolio(userId: string) {
  const id = await activePortfolioId(userId);
  if (!id) return null;
  const summaries = await listPortfolioSummaries(userId);
  const match = summaries.find((r) => r.id === id);
  return match ? { id, name: match.name, role: match.role, propertyCount: match.propertyCount } : null;
}

/** Manage tier: owners and co-owners (viewers excluded). */
export async function canManagePortfolio(
  userId: string,
  portfolioId: string,
): Promise<boolean> {
  const role = await roleInPortfolio(userId, portfolioId);
  return role === "owner" || role === "co_owner";
}

/** Owner-only powers: deleting a portfolio's properties, members, fields. */
export async function isPortfolioOwner(
  userId: string,
  portfolioId: string,
): Promise<boolean> {
  return (await roleInPortfolio(userId, portfolioId)) === "owner";
}

/**
 * Custom-field *definitions* are owner-only (co-owners edit the values on
 * records, not the shape of the portfolio).
 */
export async function canDefineCustomFields(
  userId: string,
  portfolioId: string,
): Promise<boolean> {
  return isPortfolioOwner(userId, portfolioId);
}

/** The portfolios with enough context for the switcher (name, role, size). */
export async function listPortfolioSummaries(
  userId: string,
): Promise<PortfolioSummary[]> {
  return db
    .select({
      id: portfolios.id,
      name: portfolios.name,
      role: portfolioMembers.role,
      propertyCount:
        sql<number>`(select count(*)::int from properties pr where pr.portfolio_id = ${portfolios.id})`,
    })
    .from(portfolioMembers)
    .innerJoin(portfolios, eq(portfolios.id, portfolioMembers.portfolioId))
    .where(eq(portfolioMembers.userId, userId))
    .orderBy(asc(portfolios.createdAt));
}

/**
 * Guarantee the account has a portfolio, creating the first one (named after
 * them) when it doesn't. Called from the write paths that need a bucket —
 * property creation, settings, member invites — so the concept stays invisible
 * to a solo owner.
 */
export async function ensurePortfolioForUser(userId: string): Promise<string> {
  const existing = await portfolioIdsFor(userId);
  if (existing.length > 0) return existing[0];

  const [account] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const name =
    account?.name?.trim() || account?.email?.split("@")[0] || "My portfolio";

  const [portfolio] = await db
    .insert(portfolios)
    .values({ name, ownerUserId: userId })
    .returning({ id: portfolios.id });

  // The owner always holds an `owner` membership row — ownership resolves two
  // ways (role for RBAC, owner for billing/payout) and they must agree.
  await db
    .insert(portfolioMembers)
    .values({ portfolioId: portfolio.id, userId, role: "owner" });

  return portfolio.id;
}

/** Read-modify-write guard for the active-portfolio cookie. */
export async function setActivePortfolioId(portfolioId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_COOKIE, portfolioId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}