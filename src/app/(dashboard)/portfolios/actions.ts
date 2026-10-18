"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { portfolioMembers, portfolios, users } from "@/db/schema";
import {
  ensurePortfolioForUser,
  isPortfolioOwner,
  setActivePortfolioId,
  type PortfolioRole,
} from "@/lib/portfolios";
import { isUuid } from "@/lib/utils";

export type ActionState = { error?: string; ok?: boolean } | null;

const ROLE_OPTIONS: PortfolioRole[] = ["co_owner", "viewer"];

/** Landlords only — the dashboard is where portfolios live. */
async function landlordContext() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "landlord") return null;
  return session.user;
}

/** Every dashboard page reads the portfolio, so revalidate the lot. */
function revalidateDashboard(): void {
  revalidatePath("/dashboard");
  revalidatePath("/properties");
  revalidatePath("/leases");
  revalidatePath("/tenants");
  revalidatePath("/finance");
  revalidatePath("/reports");
  revalidatePath("/maintenance");
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Switching and creating portfolios
// ---------------------------------------------------------------------------

/**
 * Switch the portfolio in context. Membership is re-checked here so a stale
 * cookie (or a crafted one) can't move someone into a portfolio they aren't in.
 */
export async function setActivePortfolioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await landlordContext();
  if (!user) return { error: "You must be signed in." };

  const portfolioId = String(formData.get("portfolioId") ?? "");
  if (!isUuid(portfolioId)) return { error: "Portfolio not found." };

  const [member] = await db
    .select({ id: portfolioMembers.id })
    .from(portfolioMembers)
    .where(
      and(
        eq(portfolioMembers.portfolioId, portfolioId),
        eq(portfolioMembers.userId, user.id),
      ),
    )
    .limit(1);
  if (!member) return { error: "You don't have access to that portfolio." };

  await setActivePortfolioId(portfolioId);
  revalidateDashboard();
  return { ok: true };
}

/**
 * Open a second portfolio. The first one was provisioned silently; this is the
 * deliberate act, and it's the only place the word "portfolio" is required.
 */
export async function createPortfolioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await landlordContext();
  if (!user) return { error: "You must be signed in." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give the portfolio a name." };
  if (name.length > 255) return { error: "That name is too long." };

  // Every landlord has one by now; this also keeps a landlord who somehow has
  // none from creating a second orphan bucket.
  await ensurePortfolioForUser(user.id);

  const [portfolio] = await db
    .insert(portfolios)
    .values({ name, ownerUserId: user.id })
    .returning({ id: portfolios.id });

  await db
    .insert(portfolioMembers)
    .values({ portfolioId: portfolio.id, userId: user.id, role: "owner" });

  await setActivePortfolioId(portfolio.id);
  revalidateDashboard();
  redirect("/properties");
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * Invite someone to the portfolio. Co-owners manage its properties, tenants,
 * leases and custom-field values; viewers read only. Field *definitions* stay
 * with the owner.
 *
 * The invitee needs an account already (same rule as the old per-property
 * co-owner invite). A tenant-role account is promoted to landlord, since
 * portfolio work happens in the dashboard.
 */
export async function invitePortfolioMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await landlordContext();
  if (!user) return { error: "You must be signed in." };

  const portfolioId = String(formData.get("portfolioId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = ROLE_OPTIONS.includes(formData.get("role") as PortfolioRole)
    ? (formData.get("role") as PortfolioRole)
    : "co_owner";

  if (!isUuid(portfolioId)) return { error: "Portfolio not found." };
  if (!email) return { error: "Enter an email address." };
  if (!(await isPortfolioOwner(user.id, portfolioId))) {
    return { error: "Only the portfolio owner can manage members." };
  }

  const [portfolio] = await db
    .select({
      id: portfolios.id,
      propertyCount: sql<number>`(select count(*)::int from properties p where p.portfolio_id = ${portfolios.id})`,
    })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!portfolio) return { error: "Portfolio not found." };

  const [target] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);
  if (!target) {
    return {
      error: "No account with that email. Ask them to register first.",
    };
  }
  if (target.id === user.id) {
    return { error: "You're already the owner of this portfolio." };
  }

  const existing = await db
    .select({ id: portfolioMembers.id })
    .from(portfolioMembers)
    .where(
      and(
        eq(portfolioMembers.portfolioId, portfolioId),
        eq(portfolioMembers.userId, target.id),
      ),
    )
    .limit(1);
  if (existing) {
    return { error: "That person is already a member of this portfolio." };
  }

  await db.insert(portfolioMembers).values({
    portfolioId,
    userId: target.id,
    role,
    addedBy: user.id,
  });

  // Portfolio work happens in the dashboard, which a tenant-role account is
  // redirected away from — promote them so the invite actually grants access.
  if (target.role === "tenant") {
    await db.update(users).set({ role: "landlord" }).where(eq(users.id, target.id));
  }

  revalidateDashboard();
  return { ok: true };
}

/** Change a member's role. The owner's own role cannot be changed here. */
export async function updatePortfolioMemberRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await landlordContext();
  if (!user) return { error: "You must be signed in." };

  const memberId = String(formData.get("memberId") ?? "");
  const role = formData.get("role");
  if (!isUuid(memberId) || !ROLE_OPTIONS.includes(role as PortfolioRole)) {
    return { error: "That role isn't available." };
  }

  const [member] = await db
    .select({
      id: portfolioMembers.id,
      userId: portfolioMembers.userId,
      portfolioId: portfolioMembers.portfolioId,
      role: portfolioMembers.role,
    })
    .from(portfolioMembers)
    .where(eq(portfolioMembers.id, memberId))
    .limit(1);
  if (!member) return { error: "Member not found." };
  if (!(await isPortfolioOwner(user.id, member.portfolioId))) {
    return { error: "Only the portfolio owner can manage members." };
  }
  if (member.role === "owner") {
    return { error: "The portfolio owner's role can't be changed." };
  }

  await db
    .update(portfolioMembers)
    .set({ role: role as PortfolioRole })
    .where(eq(portfolioMembers.id, memberId));

  revalidateDashboard();
  return { ok: true };
}

/**
 * Remove a member. The last owner can never be removed — transfer ownership or
 * delete the portfolio instead, so a portfolio can never be orphaned.
 */
export async function removePortfolioMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await landlordContext();
  if (!user) return { error: "You must be signed in." };

  const memberId = String(formData.get("memberId") ?? "");
  if (!isUuid(memberId)) return { error: "Member not found." };

  const [member] = await db
    .select({
      id: portfolioMembers.id,
      userId: portfolioMembers.userId,
      portfolioId: portfolioMembers.portfolioId,
      role: portfolioMembers.role,
    })
    .from(portfolioMembers)
    .where(eq(portfolioMembers.id, memberId))
    .limit(1);
  if (!member) return { error: "Member not found." };
  if (!(await isPortfolioOwner(user.id, member.portfolioId))) {
    return { error: "Only the portfolio owner can manage members." };
  }
  if (member.role === "owner") {
    return {
      error:
        "The portfolio must keep an owner — remove the properties first, or transfer ownership.",
    };
  }
  if (member.userId === user.id) {
    return { error: "You can't remove yourself." };
  }

  await db.delete(portfolioMembers).where(eq(portfolioMembers.id, memberId));

  revalidateDashboard();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Portfolio settings
// ---------------------------------------------------------------------------

export async function renamePortfolioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await landlordContext();
  if (!user) return { error: "You must be signed in." };

  const portfolioId = String(formData.get("portfolioId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!isUuid(portfolioId)) return { error: "Portfolio not found." };
  if (name.length < 2) return { error: "Give the portfolio a name." };
  if (name.length > 255) return { error: "That name is too long." };
  if (!(await isPortfolioOwner(user.id, portfolioId))) {
    return { error: "Only the portfolio owner can rename it." };
  }

  await db
    .update(portfolios)
    .set({ name, updatedAt: new Date() })
    .where(eq(portfolios.id, portfolioId));

  revalidateDashboard();
  return { ok: true };
}