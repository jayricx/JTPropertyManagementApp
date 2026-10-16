import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { tenantInvitations, tenants } from "@/db/schema";

/**
 * Portal invitations for tenants.
 *
 * The landlord never picks the tenant's password — they email a link, and the
 * tenant chooses their own from a single page. That keeps shared passwords out
 * of chat threads and text messages.
 *
 * The token is 32 random bytes with only its SHA-256 hash stored, so a leaked
 * database row can't be replayed into a working setup link. It is single-use and
 * expires.
 */

export const INVITE_TTL_HOURS = 72;
/** Minimum gap between two invites for the same tenant. */
export const INVITE_COOLDOWN_MINUTES = 5;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; retryInMinutes: number };

/**
 * Mint an invite, replacing any earlier one for this tenant so only the newest
 * link works. Honours the cooldown so the landlord can't turn the card into a
 * mail cannon.
 */
export async function createTenantInvitation(
  tenantId: string,
): Promise<InviteResult> {
  const [existing] = await db
    .select({ lastSentAt: tenantInvitations.lastSentAt })
    .from(tenantInvitations)
    .where(
      and(eq(tenantInvitations.tenantId, tenantId), isNull(tenantInvitations.usedAt)),
    )
    .orderBy(desc(tenantInvitations.createdAt))
    .limit(1);

  if (
    existing?.lastSentAt &&
    Date.now() - existing.lastSentAt.getTime() < INVITE_COOLDOWN_MINUTES * 60_000
  ) {
    return { ok: false, retryInMinutes: 1 };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000);

  // Drop superseded links first so only one can ever be live.
  await db
    .delete(tenantInvitations)
    .where(
      and(eq(tenantInvitations.tenantId, tenantId), isNull(tenantInvitations.usedAt)),
    );

  await db.insert(tenantInvitations).values({
    tenantId,
    tokenHash: hashToken(token),
    expiresAt,
    lastSentAt: new Date(),
  });

  return { ok: true, token, expiresAt };
}

export interface AcceptedInvite {
  tenantId: string;
  /** The landlord who owns this tenant — XP and tenancy hang off them. */
  landlordId: string;
  email: string;
  tenantName: string;
  /** Set when the tenant already set a password, so the link is spent. */
  alreadyActive: boolean;
}

/**
 * Claim an invite. The conditional update *is* the claim: two clicks at once can
 * only ever spend the token once. The row is kept rather than deleted so a
 * second click reports "already used" instead of "unknown link".
 */
export async function acceptTenantInvitation(
  token: string,
): Promise<AcceptedInvite | null> {
  if (!token || token.length < 20) return null;

  const [claimed] = await db
    .update(tenantInvitations)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(tenantInvitations.tokenHash, hashToken(token)),
        isNull(tenantInvitations.usedAt),
        gt(tenantInvitations.expiresAt, new Date()),
      ),
    )
    .returning({ tenantId: tenantInvitations.tenantId });

  if (!claimed) return null;

  const [tenant] = await db
    .select({
      userId: tenants.userId,
      accountId: tenants.accountId,
      email: tenants.email,
      firstName: tenants.firstName,
      lastName: tenants.lastName,
    })
    .from(tenants)
    .where(eq(tenants.id, claimed.tenantId))
    .limit(1);

  if (!tenant?.email) return null;

  return {
    tenantId: claimed.tenantId,
    landlordId: tenant.userId,
    email: tenant.email.toLowerCase(),
    tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
    alreadyActive: tenant.accountId !== null,
  };
}

/** Housekeeping: drop invites that expired over a day ago. */
export async function purgeExpiredTenantInvitations(): Promise<void> {
  await db
    .delete(tenantInvitations)
    .where(lt(tenantInvitations.expiresAt, new Date(Date.now() - 86_400_000)));
}