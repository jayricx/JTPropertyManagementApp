import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { pendingRegistrations } from "@/db/schema";

/**
 * Email code verification for registration.
 *
 * A signup is held in `pending_registrations` until the emailed code comes
 * back, and only then does the account exist — so an address nobody has proven
 * they control can never hold a working login, and abandoned signups can't lock
 * an address out either (they expire).
 *
 * Only an HMAC of the code is stored. A plain hash of six digits would fall to
 * an offline sweep of the million possible values, so the digest is keyed with
 * AUTH_SECRET.
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 15;
/** Minimum gap between two emails to the same address. */
export const RESEND_COOLDOWN_SECONDS = 60;
/** Wrong guesses allowed before the pending row is destroyed. */
export const MAX_ATTEMPTS = 5;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SECRET is not set — it is required to sign verification codes.",
    );
  }
  return value;
}

/** Keyed digest, bound to the address so a code can't be replayed elsewhere. */
function hashCode(email: string, code: string): string {
  return createHmac("sha256", secret())
    .update(`${email.toLowerCase()}:${code}`)
    .digest("hex");
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(CODE_LENGTH, "0");
}

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface StartRegistrationInput {
  email: string;
  name: string | null;
  passwordHash: string;
  /** Referral offered at signup, carried to `verifyRegistrationCode`. */
  referralCode?: string | null;
}

export type StartResult =
  | { ok: true; code: string }
  | { ok: false; retryInSeconds: number };

/**
 * Hold a signup and email its code. Re-registering replaces any earlier
 * pending row, so a second attempt always works with the newest password.
 * Returns a cooldown instead of emailing when the previous code went out very
 * recently, which keeps the form from being usable as a mail cannon.
 */
export async function beginRegistration(
  input: StartRegistrationInput,
): Promise<StartResult> {
  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ lastSentAt: pendingRegistrations.lastSentAt })
    .from(pendingRegistrations)
    .where(eq(pendingRegistrations.email, email))
    .limit(1);

  const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
  if (existing?.lastSentAt && Date.now() - existing.lastSentAt.getTime() < cooldownMs) {
    return {
      ok: false,
      retryInSeconds: Math.ceil(
        (existing.lastSentAt.getTime() + cooldownMs - Date.now()) / 1000,
      ),
    };
  }

  const code = generateCode();
  const now = new Date();
  const values = {
    email,
    name: input.name,
    passwordHash: input.passwordHash,
    codeHash: hashCode(email, code),
    attempts: 0,
    lastSentAt: now,
    expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
    // Carried, not applied: the affiliate is resolved at verification time so a
    // code that was paused or never existed costs the signup nothing.
    referralCode: input.referralCode ?? null,
  };

  await db
    .insert(pendingRegistrations)
    .values(values)
    .onConflictDoUpdate({ target: pendingRegistrations.email, set: values });

  return { ok: true, code };
}

/** Mail a fresh code for a signup that is already waiting. */
export async function resendRegistrationCode(
  email: string,
): Promise<
  | { ok: true; code: string; name: string | null }
  | { ok: false; reason: "none"; retryInSeconds: 0 }
  | { ok: false; reason: "throttled"; retryInSeconds: number }
> {
  const normalized = email.toLowerCase();
  const [row] = await db
    .select({
      id: pendingRegistrations.id,
      name: pendingRegistrations.name,
      lastSentAt: pendingRegistrations.lastSentAt,
    })
    .from(pendingRegistrations)
    .where(eq(pendingRegistrations.email, normalized))
    .limit(1);
  if (!row) return { ok: false, reason: "none", retryInSeconds: 0 };

  const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
  if (row.lastSentAt && Date.now() - row.lastSentAt.getTime() < cooldownMs) {
    return {
      ok: false,
      reason: "throttled",
      retryInSeconds: Math.ceil(
        (row.lastSentAt.getTime() + cooldownMs - Date.now()) / 1000,
      ),
    };
  }

  const code = generateCode();
  await db
    .update(pendingRegistrations)
    .set({
      codeHash: hashCode(normalized, code),
      attempts: 0,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
    })
    .where(eq(pendingRegistrations.id, row.id));

  return { ok: true, code, name: row.name };
}

export type VerifyResult =
  | {
      ok: true;
      registration: {
        email: string;
        name: string | null;
        passwordHash: string;
        /** Whatever referral was carried on the claimed row, if any. */
        referralCode: string | null;
      };
    }
  | { ok: false; reason: "not_found" | "expired" | "locked" | "mismatch" };

/**
 * Check a submitted code and claim the pending row in the same statement, so
 * two parallel submissions cannot both spend the same code.
 */
export async function verifyRegistrationCode(
  email: string,
  code: string,
): Promise<VerifyResult> {
  const normalized = email.toLowerCase();
  const [row] = await db
    .select({
      id: pendingRegistrations.id,
      email: pendingRegistrations.email,
      name: pendingRegistrations.name,
      passwordHash: pendingRegistrations.passwordHash,
      codeHash: pendingRegistrations.codeHash,
      attempts: pendingRegistrations.attempts,
      expiresAt: pendingRegistrations.expiresAt,
      referralCode: pendingRegistrations.referralCode,
    })
    .from(pendingRegistrations)
    .where(eq(pendingRegistrations.email, normalized))
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(pendingRegistrations).where(eq(pendingRegistrations.id, row.id));
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.delete(pendingRegistrations).where(eq(pendingRegistrations.id, row.id));
    return { ok: false, reason: "locked" };
  }

  if (!sameCode(row.codeHash, hashCode(normalized, code))) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.delete(pendingRegistrations).where(eq(pendingRegistrations.id, row.id));
      return { ok: false, reason: "locked" };
    }
    await db
      .update(pendingRegistrations)
      .set({ attempts })
      .where(eq(pendingRegistrations.id, row.id));
    return { ok: false, reason: "mismatch" };
  }

  // Atomic claim: the delete only lands if the row still holds this code.
  const [claimed] = await db
    .delete(pendingRegistrations)
    .where(
      and(
        eq(pendingRegistrations.id, row.id),
        eq(pendingRegistrations.codeHash, row.codeHash),
      ),
    )
    .returning({
      email: pendingRegistrations.email,
      name: pendingRegistrations.name,
      passwordHash: pendingRegistrations.passwordHash,
      // Handed back so the caller can attribute the new account. It came off
      // the row that was just claimed, not from the request.
      referralCode: pendingRegistrations.referralCode,
    });

  if (!claimed?.passwordHash) return { ok: false, reason: "mismatch" };
  return { ok: true, registration: claimed };
}

/** Housekeeping: drop signups nobody came back for. */
export async function purgeExpiredPendingRegistrations(): Promise<void> {
  await db
    .delete(pendingRegistrations)
    .where(lt(pendingRegistrations.expiresAt, new Date(Date.now() - 86_400_000)));
}