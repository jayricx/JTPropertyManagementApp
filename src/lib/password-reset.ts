import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";

/**
 * Password reset tokens.
 *
 * Only the SHA-256 hash is stored, so a leaked database row (or a backup)
 * cannot be replayed into a working reset link. Tokens are single-use and
 * expire; asking for a new one invalidates the account's older links.
 */

export const RESET_TOKEN_TTL_MINUTES = 60;
/**
 * Resend cooldown. A row-count check would never trip (minting a token
 * deletes the previous one), so this looks at the newest *unused* token:
 * asking twice in a row silently reuses the wait, and a completed reset
 * clears it because it marks every token used.
 */
const REQUEST_COOLDOWN_MINUTES = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a token, returning the raw value to put in the email link. */
export async function createResetToken(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

/** True when this account already has a fresh, unused reset link. */
export async function resetRequestThrottled(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - REQUEST_COOLDOWN_MINUTES * 60_000);
  const [row] = await db
    .select({ createdAt: passwordResetTokens.createdAt })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.createdAt, cutoff),
      ),
    )
    .orderBy(desc(passwordResetTokens.createdAt))
    .limit(1);
  return Boolean(row);
}

export interface ConsumedResetToken {
  userId: string;
}

/**
 * Validate and burn a token. Returns null for unknown, already-used, or
 * expired tokens — the caller shows one message for all three so a probe
 * can't tell them apart.
 */
export async function consumeResetToken(
  token: string,
): Promise<ConsumedResetToken | null> {
  if (!token || token.length < 20) return null;

  const [row] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  return { userId: row.userId };
}

/** Is this reset token currently valid? (form pre-check, no burn) */
export async function resetTokenValid(token: string): Promise<boolean> {
  if (!token || token.length < 20) return false;
  const [row] = await db
    .select({ expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Set a new password. `passwordChangedAt` is stamped here: the session
 * callback compares it against the copy inside each JWT, so every session
 * issued before this moment is signed out.
 */
export async function setUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .update(users)
    .set({ passwordHash, passwordChangedAt: new Date() })
    .where(eq(users.id, userId));

  // Burn any other outstanding links for this account.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)),
    );
}

/** Housekeeping: drop tokens that expired more than a day ago. */
export async function purgeExpiredResetTokens(): Promise<void> {
  await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, new Date(Date.now() - 86_400_000)));
}