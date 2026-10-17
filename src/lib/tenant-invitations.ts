import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { properties, tenantInvitations, tenants, users } from "@/db/schema";

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

/** Resolve a roster row into the shape the invite endpoints return. */
async function loadAcceptedInvite(
  tenantId: string,
): Promise<AcceptedInvite | null> {
  const [tenant] = await db
    .select({
      userId: tenants.userId,
      accountId: tenants.accountId,
      email: tenants.email,
      firstName: tenants.firstName,
      lastName: tenants.lastName,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.email) return null;

  return {
    tenantId,
    landlordId: tenant.userId,
    email: tenant.email.toLowerCase(),
    tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
    alreadyActive: tenant.accountId !== null,
  };
}

/**
 * Read a live invite *without* spending it. The Google path uses this so a
 * visitor signed in as the wrong address is turned away before the single-use
 * token is consumed — otherwise a wrong-account click would burn the link and
 * force the landlord to resend.
 */
export async function previewTenantInvitation(
  token: string,
): Promise<AcceptedInvite | null> {
  if (!token || token.length < 20) return null;

  const [row] = await db
    .select({ tenantId: tenantInvitations.tenantId })
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.tokenHash, hashToken(token)),
        isNull(tenantInvitations.usedAt),
        gt(tenantInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  return loadAcceptedInvite(row.tenantId);
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
  return loadAcceptedInvite(claimed.tenantId);
}

/**
 * Link the roster row to the account and tidy the account's role.
 *
 * Auth.js creates a fresh Google user as a `landlord`; when that account owns
 * nothing and has never set a password, claiming a tenancy means it is really a
 * tenant account — the same result the email/password invite path reaches by
 * inserting `role: 'tenant'` directly. An existing landlord who rents from
 * another owner keeps their role and simply gains the portal link.
 */
async function linkInviteToAccount(
  accountId: string,
  tenantId: string,
): Promise<void> {
  const [account] = await db
    .select({
      role: users.role,
      passwordHash: users.passwordHash,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, accountId))
    .limit(1);

  const updates: { role?: "tenant"; emailVerified?: Date } = {};
  // The landlord vouched for the address and Google verified it; mirror the
  // password path, which stores a verification date on the fresh account.
  if (account && !account.emailVerified) updates.emailVerified = new Date();
  if (account && account.role !== "tenant" && account.passwordHash === null) {
    const [owned] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.userId, accountId))
      .limit(1);
    if (!owned) updates.role = "tenant";
  }
  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, accountId));
  }

  await db
    .update(tenants)
    .set({ accountId })
    .where(eq(tenants.id, tenantId));
}

export type ClaimInviteOutcome =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string };

/**
 * The Google front door for a tenant invite. The visitor is already signed in —
 * Auth.js created or linked their account on the way back from Google — so this
 * only attaches the roster row after confirming the account's email is the one
 * the landlord invited. The token is previewed first so a mismatch never spends
 * it, then claimed atomically.
 */
export async function claimInvitationForAccount(
  token: string,
  accountId: string,
  accountEmail: string,
): Promise<ClaimInviteOutcome> {
  const preview = await previewTenantInvitation(token);
  if (!preview) {
    return {
      ok: false,
      status: 400,
      error: "That invite is invalid or has expired.",
    };
  }
  if (preview.alreadyActive) {
    return {
      ok: false,
      status: 409,
      error: "This portal is already set up. Sign in instead.",
    };
  }
  if (preview.email !== accountEmail.trim().toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: `This invite was sent to ${preview.email}. Sign in with that address, or set a password instead.`,
    };
  }

  // One profile per account: the portal resolves a signed-in user's tenancy
  // with a single row, so refuse a second link (only a race between two
  // landlords inviting the same address can create one).
  const [otherLink] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.accountId, accountId), ne(tenants.id, preview.tenantId)))
    .limit(1);
  if (otherLink) {
    return {
      ok: false,
      status: 409,
      error: "That account is already linked to another tenancy.",
    };
  }

  // Re-claim atomically; the preview above was only a read.
  const accepted = await acceptTenantInvitation(token);
  if (!accepted) {
    return {
      ok: false,
      status: 400,
      error: "That invite is invalid or has expired.",
    };
  }
  if (accepted.alreadyActive) {
    return {
      ok: false,
      status: 409,
      error: "This portal is already set up. Sign in instead.",
    };
  }

  await linkInviteToAccount(accountId, accepted.tenantId);

  return { ok: true, email: accepted.email };
}

/** Housekeeping: drop invites that expired over a day ago. */
export async function purgeExpiredTenantInvitations(): Promise<void> {
  await db
    .delete(tenantInvitations)
    .where(lt(tenantInvitations.expiresAt, new Date(Date.now() - 86_400_000)));
}