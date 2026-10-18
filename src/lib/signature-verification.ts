import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { contractSignatureChallenges } from "@/db/schema";
import { sendSignatureCodeEmail } from "@/lib/email";
import type { SignatureVerifiedBy } from "@/lib/signatures";
import type { SignatureRole } from "@/lib/validations";

/**
 * Proving who is signing.
 *
 * A typed name proves nothing on its own. Every contract signature now records
 * how the signer was identified:
 *
 *  - `account`   — they were signed in to an account that owns the role.
 *  - `email_code` — they proved they control the address the contract was sent
 *                    to by entering a code mailed to it.
 *  - `link_only` — possession of the emailed link was the only evidence. Used
 *                   for signatures taken before verification existed; it is
 *                   never assigned to a new signature.
 *
 * The codes follow the same rules as registration codes: six digits, an HMAC
 * keyed with AUTH_SECRET (so six digits can't be swept offline), a short life,
 * a resend cooldown, and a cap on wrong guesses. The digest is bound to the
 * contract and role, so a code for one document can't be replayed on another.
 */

export const SIGNATURE_CODE_LENGTH = 6;
export const SIGNATURE_CODE_TTL_MINUTES = 15;
/** Minimum gap between two code emails for the same contract and party. */
export const SIGNATURE_RESEND_COOLDOWN_SECONDS = 60;
/** Wrong guesses allowed before the challenge is destroyed. */
export const SIGNATURE_MAX_ATTEMPTS = 5;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SECRET is not set — it is required to sign verification codes.",
    );
  }
  return value;
}

/** Keyed digest, bound to the contract and role so it can't be replayed. */
function hashCode(contractId: string, role: SignatureRole, code: string): string {
  return createHmac("sha256", secret())
    .update(`${contractId}:${role}:${code}`)
    .digest("hex");
}

function generateCode(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(SIGNATURE_CODE_LENGTH, "0");
}

function sameCode(stored: string, submitted: string): boolean {
  const left = Buffer.from(stored, "hex");
  const right = Buffer.from(submitted, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** `juan.dela@example.com` → `j•••@example.com` — enough to recognise, not to leak. */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!domain) return email;
  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

/**
 * Where the signing request came from. Best-effort: proxies strip or rewrite
 * these, so they are recorded as evidence, never treated as authentication.
 * Values are clamped to the column widths so a hostile header can't fail the
 * insert.
 */
export async function signingEvidence(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for") ?? "";
  const ip = (forwarded.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "").trim();
  const agent = (requestHeaders.get("user-agent") ?? "").trim();

  return {
    ipAddress: ip ? ip.slice(0, 64) : null,
    userAgent: agent ? agent.slice(0, 500) : null,
  };
}

/**
 * The verification attached to a signature. `verifiedAt` is captured here, at
 * the moment the identity check succeeds, not when a row is eventually written.
 */
export interface SignatureVerification {
  verifiedBy: SignatureVerifiedBy;
  verifiedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function accountVerification(): Promise<SignatureVerification> {
  return {
    verifiedBy: "account",
    verifiedAt: new Date(),
    ...(await signingEvidence()),
  };
}

export async function emailCodeVerification(): Promise<SignatureVerification> {
  return {
    verifiedBy: "email_code",
    verifiedAt: new Date(),
    ...(await signingEvidence()),
  };
}

// ---------------------------------------------------------------------------
// Requesting a code
// ---------------------------------------------------------------------------

export interface SignatureCodeRequest {
  contractId: string;
  role: SignatureRole;
  /** The frozen terms' address for this party. */
  email: string;
  signerName: string;
  /** Trading name or person, used only to make the email recognisable. */
  landlordLabel: string;
  propertyLine: string;
}

export type SignatureCodeResult =
  | { ok: true; delivered: boolean; retryInSeconds: 0 }
  | { ok: false; reason: "no_email" | "throttled"; retryInSeconds: number };

/**
 * Mint and mail a fresh code, replacing any previous one. A new code makes the
 * old one dead — the behaviour someone expects when they ask for another
 * because the first never arrived.
 */
export async function requestSignatureCode(
  input: SignatureCodeRequest,
): Promise<SignatureCodeResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no_email", retryInSeconds: 0 };

  const [existing] = await db
    .select({
      id: contractSignatureChallenges.id,
      lastSentAt: contractSignatureChallenges.lastSentAt,
      consumedAt: contractSignatureChallenges.consumedAt,
    })
    .from(contractSignatureChallenges)
    .where(
      and(
        eq(contractSignatureChallenges.contractId, input.contractId),
        eq(contractSignatureChallenges.role, input.role),
      ),
    )
    .limit(1);

  const cooldownMs = SIGNATURE_RESEND_COOLDOWN_SECONDS * 1000;
  if (
    existing &&
    !existing.consumedAt &&
    Date.now() - existing.lastSentAt.getTime() < cooldownMs
  ) {
    return {
      ok: false,
      reason: "throttled",
      retryInSeconds: Math.ceil(
        (existing.lastSentAt.getTime() + cooldownMs - Date.now()) / 1000,
      ),
    };
  }

  const code = generateCode();
  const now = new Date();
  const values = {
    contractId: input.contractId,
    role: input.role,
    email,
    codeHash: hashCode(input.contractId, input.role, code),
    attempts: 0,
    lastSentAt: now,
    expiresAt: new Date(now.getTime() + SIGNATURE_CODE_TTL_MINUTES * 60_000),
    consumedAt: null,
  };

  await db
    .insert(contractSignatureChallenges)
    .values(values)
    .onConflictDoUpdate({
      target: [
        contractSignatureChallenges.contractId,
        contractSignatureChallenges.role,
      ],
      set: values,
    });

  // Housekeeping: challenges nobody came back for, and spent ones. The
  // signature carries the evidence, so a day-old challenge is just residue.
  // A failure here must not stop the code from going out.
  try {
    const stale = new Date(Date.now() - 86_400_000);
    await db
      .delete(contractSignatureChallenges)
      .where(
        or(
          lt(contractSignatureChallenges.expiresAt, stale),
          lt(contractSignatureChallenges.consumedAt, stale),
        ),
      );
  } catch {
    // ignore
  }

  const result = await sendSignatureCodeEmail({
    to: email,
    name: input.signerName,
    code,
    expiresInMinutes: SIGNATURE_CODE_TTL_MINUTES,
    landlordLabel: input.landlordLabel,
    propertyLine: input.propertyLine,
  });

  // The challenge exists either way; `delivered: false` lets the UI say the
  // email didn't go out instead of claiming it did.
  return { ok: true, delivered: result.delivered, retryInSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Checking a code
// ---------------------------------------------------------------------------

export type VerifyCodeResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "expired" | "locked" | "mismatch" | "used";
    };

/**
 * Check a code and spend it in the same operation, so two submissions can't
 * both sign with one email.
 */
export async function verifySignatureChallenge(
  contractId: string,
  role: SignatureRole,
  code: string,
): Promise<VerifyCodeResult> {
  const submitted = code.trim();
  if (!new RegExp(`^\\d{${SIGNATURE_CODE_LENGTH}}$`).test(submitted)) {
    return { ok: false, reason: "mismatch" };
  }

  const [row] = await db
    .select({
      id: contractSignatureChallenges.id,
      codeHash: contractSignatureChallenges.codeHash,
      attempts: contractSignatureChallenges.attempts,
      expiresAt: contractSignatureChallenges.expiresAt,
      consumedAt: contractSignatureChallenges.consumedAt,
    })
    .from(contractSignatureChallenges)
    .where(
      and(
        eq(contractSignatureChallenges.contractId, contractId),
        eq(contractSignatureChallenges.role, role),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) {
    await db
      .delete(contractSignatureChallenges)
      .where(eq(contractSignatureChallenges.id, row.id));
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= SIGNATURE_MAX_ATTEMPTS) {
    await db
      .delete(contractSignatureChallenges)
      .where(eq(contractSignatureChallenges.id, row.id));
    return { ok: false, reason: "locked" };
  }

  if (!sameCode(row.codeHash, hashCode(contractId, role, submitted))) {
    const attempts = row.attempts + 1;
    if (attempts >= SIGNATURE_MAX_ATTEMPTS) {
      await db
        .delete(contractSignatureChallenges)
        .where(eq(contractSignatureChallenges.id, row.id));
      return { ok: false, reason: "locked" };
    }
    await db
      .update(contractSignatureChallenges)
      .set({ attempts })
      .where(eq(contractSignatureChallenges.id, row.id));
    return { ok: false, reason: "mismatch" };
  }

  // Atomic spend: only one request can flip consumed_at for this code.
  const [claimed] = await db
    .update(contractSignatureChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(contractSignatureChallenges.id, row.id),
        eq(contractSignatureChallenges.codeHash, row.codeHash),
      ),
    )
    .returning({ id: contractSignatureChallenges.id });

  return claimed ? { ok: true } : { ok: false, reason: "used" };
}

/** Feedback for the signing dialog's "email me a code" control. */
export type SignatureCodeState =
  | {
      ok: true;
      delivered: boolean;
      /** Masked address, so the signer knows where to look. */
      email: string;
      retryInSeconds: number;
    }
  | { ok: false; error: string; retryInSeconds: number };

/** What to tell a signer whose code didn't work. */
export const verifyCodeMessages = {
  not_found: "Ask us to email you a code first.",
  expired: "That code has expired. Ask for a new one.",
  locked: "Too many wrong codes. Ask for a new one.",
  mismatch: "That code isn't right. Check the email and try again.",
  used: "That code has already been used. Ask for a new one.",
} as const satisfies Record<
  Extract<VerifyCodeResult, { ok: false }>["reason"],
  string
>;
