import { randomInt } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { affiliates, users } from "@/db/schema";

/**
 * Referrals.
 *
 * Every landlord gets a code and can share a link; signups carrying that code
 * are attributed to them. Three decisions shape everything here:
 *
 *  - **First-touch, once.** `users.referred_by` is written exactly once, at
 *    account creation. Later clicks on someone else's link change nothing, so
 *    the person who actually introduced the landlord keeps the credit.
 *  - **Nothing is rewarded.** Attribution only. A discount or a commission would
 *    turn every code into something worth faking, and there are no paying
 *    customers to pay against yet.
 *  - **A bad code never blocks a signup.** A mistyped or unknown code records no
 *    attribution and is logged; the account is still created. Making somebody
 *    retype their password because of someone else's typo is not acceptable.
 */

export const REFERRAL_CODE_LENGTH = 8;

/**
 * Unambiguous alphabet: no O/0, I/1/L. Codes get read aloud in messages and
 * typed on a phone, where those pairs are the ones people get wrong.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const REFERRAL_COOKIE = "rb_ref";
/** Long enough for someone who bookmarked a link and only registers next week. */
export const REFERRAL_COOKIE_DAYS = 30;

/** Uppercase, trimmed, and stripped of the punctuation people add when pasting. */
export function normalizeCode(input: string | null | undefined): string {
  return (input ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateCode(): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

/** True when a code looks like one we could have issued. */
export function looksLikeCode(input: string): boolean {
  const code = normalizeCode(input);
  return code.length >= 4 && code.length <= 16;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface AffiliateRow {
  id: string;
  code: string;
  name: string;
  userId: string;
  status: "active" | "paused";
  pausedReason: string | null;
  createdAt: Date;
  /** How many accounts this code has brought in. */
  signups: number;
}

/** What every code read has in common, whichever query produced it. */
interface AffiliateSource {
  id: string;
  code: string;
  name: string;
  userId: string;
  status: "active" | "paused";
  pausedReason: string | null;
  createdAt: Date;
  signups: number;
}

/**
 * Fully qualified affiliate id for use inside a correlated subquery.
 *
 * Drizzle renders a column reference unqualified, so `${affiliates.id}` inside
 * `select ... from users u` becomes `"id"` — which Postgres resolves to the
 * *user's* id, quietly counting users who referred themselves (always zero)
 * instead of the affiliate's. Qualifying it by hand is the fix.
 */
const AFFILIATE_ID = sql.raw('"affiliates"."id"');

/**
 * How many accounts arrived through this code. Used by every read of a code, so
 * it lives in one place rather than being re-spelled per query.
 */
function signupsCount() {
  return sql<number>`(
    select count(*)::int from users u where u.referred_by = ${AFFILIATE_ID}
  )`;
}

function toAffiliate(row: AffiliateSource): AffiliateRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    userId: row.userId,
    status: row.status,
    pausedReason: row.pausedReason,
    createdAt: row.createdAt,
    signups: Number(row.signups),
  };
}

/** The code for an account, or null if it doesn't have one yet. */
export async function affiliateForUser(
  userId: string,
): Promise<AffiliateRow | null> {
  const [row] = await db
    .select({
      id: affiliates.id,
      code: affiliates.code,
      name: affiliates.name,
      userId: affiliates.userId,
      status: affiliates.status,
      pausedReason: affiliates.pausedReason,
      createdAt: affiliates.createdAt,
      signups: signupsCount(),
    })
    .from(affiliates)
    .where(eq(affiliates.userId, userId))
    .limit(1);
  return row ? toAffiliate(row) : null;
}

/**
 * Resolve a code someone typed or clicked. Unknown and paused codes both come
 * back null — to the signup page they are the same thing, and distinguishing
 * them would let anyone probe which codes exist.
 */
export async function resolveCode(
  raw: string | null | undefined,
): Promise<AffiliateRow | null> {
  const code = normalizeCode(raw);
  if (!looksLikeCode(code)) return null;

  const [row] = await db
    .select({
      id: affiliates.id,
      code: affiliates.code,
      name: affiliates.name,
      userId: affiliates.userId,
      status: affiliates.status,
      pausedReason: affiliates.pausedReason,
      createdAt: affiliates.createdAt,
      signups: signupsCount(),
    })
    .from(affiliates)
    .where(and(eq(affiliates.code, code), eq(affiliates.status, "active")))
    .limit(1);
  return row ? toAffiliate(row) : null;
}

/** The account behind a code, for a courtesy "invited by X" line. */
export async function affiliateName(affiliateId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: affiliates.name })
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);
  return row?.name ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Give an account a referral code, if it doesn't have one.
 *
 * Runs on landlord account creation, because the whole point of a self-serve
 * referral link is that there is no extra step between signing up and being
 * able to share. Tenants are skipped: their account is created by a landlord's
 * invite, which is a different relationship and not an acquisition.
 */
export async function ensureReferralCode(
  userId: string,
  name: string | null,
): Promise<AffiliateRow | null> {
  const existing = await affiliateForUser(userId);
  if (existing) return existing;

  // A handful of collisions is expected over millions of codes; retry a few
  // times rather than failing someone's account creation over it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const [row] = await db
        .insert(affiliates)
        .values({ code, name: name?.trim() || "Landlord", userId })
        .onConflictDoNothing({ target: affiliates.code })
        .returning();
      if (row) return toAffiliate({ ...row, signups: 0 });
    } catch (error) {
      console.error("[referrals] could not mint a code:", error);
      return null;
    }
  }
  console.error("[referrals] exhausted code attempts for user", userId);
  return null;
}

/**
 * How a signup was (or wasn't) attributed. Every outcome is non-fatal.
 */
export type AttributionResult =
  | { ok: true; affiliateId: string; code: string }
  | { ok: false; reason: "none" | "unknown" | "self" | "domain" | "too_new" };

/**
 * A referrer younger than a day is the signature of someone farming their own
 * link: you cannot have introduced a landlord from an account created twenty
 * minutes ago. Catching that here is cheaper than noticing it in the numbers.
 */
const REFERRER_MIN_AGE_HOURS = 24;

/**
 * How recently an account may have been created and still count as "just
 * arrived" for the cookie-based path.
 *
 * The Google sign-up flow never creates a pending registration, so there is
 * nowhere to carry a code from the register form to account creation — the
 * cookie is the only state that survives. Rather than fight Auth.js's callbacks
 * for access to it, a brand-new account claims it on its first dashboard
 * render. Fifteen minutes is far longer than the round trip takes and far too
 * short for this to fire on someone who has had their account for months.
 */
const JUST_ARRIVED_MS = 15 * 60 * 1000;

/**
 * Claim a pending referral for an account that was just created — the Google
 * path's counterpart to `attributeSignup`.
 *
 * The "just arrived" window is checked here rather than in the caller so the
 * timestamp never has to be taken during a React render, which is both
 * non-deterministic and not this function's business.
 */
export async function attributeJustArrivedSignup(input: {
  userId: string;
  email: string;
  createdAt: Date;
  rawCode: string | null | undefined;
  now?: Date;
}): Promise<AttributionResult> {
  const now = input.now ?? new Date();
  if (now.getTime() - input.createdAt.getTime() > JUST_ARRIVED_MS) {
    return { ok: false, reason: "none" };
  }
  return attributeSignup({
    userId: input.userId,
    email: input.email,
    rawCode: input.rawCode,
    now,
  });
}

/**
 * Attribute a freshly created account to whoever referred it.
 *
 * Refuses — rather than throwing — on every failure mode. The account exists
 * either way; only the attribution is lost, and a lost attribution is a far
 * smaller problem than a landlord who can't register.
 */
export async function attributeSignup(input: {
  userId: string;
  email: string;
  rawCode: string | null | undefined;
  now?: Date;
}): Promise<AttributionResult> {
  const code = normalizeCode(input.rawCode);
  if (!looksLikeCode(code)) return { ok: false, reason: "none" };

  const affiliate = await resolveCode(code);
  if (!affiliate) return { ok: false, reason: "unknown" };

  // Signing up with your own code.
  if (affiliate.userId === input.userId) {
    return { ok: false, reason: "self" };
  }

  const [referrer] = await db
    .select({ email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, affiliate.userId))
    .limit(1);
  if (!referrer) return { ok: false, reason: "unknown" };

  // Same mailbox domain: almost always one person or one household registering
  // a second time to inflate a number.
  const domain = (value: string) => value.split("@")[1]?.toLowerCase() ?? "";
  if (domain(referrer.email) && domain(referrer.email) === domain(input.email)) {
    return { ok: false, reason: "domain" };
  }

  const now = input.now ?? new Date();
  const ageHours = (now.getTime() - referrer.createdAt.getTime()) / 3_600_000;
  if (ageHours < REFERRER_MIN_AGE_HOURS) {
    return { ok: false, reason: "too_new" };
  }

  // First-touch: only ever fills a gap, never overwrites a decision already
  // made. The WHERE clause makes that true even if two paths race.
  const updated = await db
    .update(users)
    .set({ referredBy: affiliate.id })
    .where(
      and(
        eq(users.id, input.userId),
        isNull(users.referredBy),
        eq(users.role, "landlord"),
      ),
    )
    .returning({ id: users.id });

  if (updated.length === 0) {
    // Already attributed, or not a landlord. Either way, not an error.
    return { ok: false, reason: "self" };
  }

  return { ok: true, affiliateId: affiliate.id, code: affiliate.code };
}

// ---------------------------------------------------------------------------
// The referral list
// ---------------------------------------------------------------------------

export interface ReferralSignup {
  userId: string;
  name: string | null;
  email: string;
  createdAt: Date;
  plan: string;
  /** First unit added — the signal that distinguishes a real signup from a name. */
  units: number;
}

/**
 * The accounts this code brought in. Strictly scoped to the holder's own code:
 * there is no query in this file that can return anyone else's referrals, which
 * is the privacy boundary the feature depends on.
 */
export async function referralsFor(
  affiliateId: string,
): Promise<ReferralSignup[]> {
  // Fully qualified: once `units` and `properties` are joined inside this
  // subquery a bare "id" resolves to theirs, not to the outer user's.
  const ownerId = sql.raw('"users"."id"');

  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      plan: users.plan,
      units: sql<number>`(
        select count(*)::int
        from units un
        join properties pr on pr.id = un.property_id
        join portfolios pf on pf.id = pr.portfolio_id
        where pf.owner_user_id = ${ownerId}
      )`,
    })
    .from(users)
    .where(eq(users.referredBy, affiliateId))
    .orderBy(desc(users.createdAt));
}

/** Every code and its count, for the operator view. */
export async function allAffiliates(): Promise<
  Array<AffiliateRow & { ownerEmail: string }>
> {
  const rows = await db
    .select({
      id: affiliates.id,
      code: affiliates.code,
      name: affiliates.name,
      userId: affiliates.userId,
      status: affiliates.status,
      pausedReason: affiliates.pausedReason,
      createdAt: affiliates.createdAt,
      ownerEmail: users.email,
      signups: signupsCount(),
    })
    .from(affiliates)
    .innerJoin(users, eq(users.id, affiliates.userId))
    // Ordered by the same expression rather than a bare aggregate: there is no
    // GROUP BY here, so Postgres rejects `count(...)` in the ORDER BY.
    .orderBy(desc(sql`(
      select count(*)::int from users u2 where u2.referred_by = ${AFFILIATE_ID}
    )`));

  return rows.map((row) => ({ ...toAffiliate(row), ownerEmail: row.ownerEmail }));
}

/** Overall sign-up numbers, for the header of the operator view. */
export async function referralTotals(): Promise<{
  codes: number;
  active: number;
  paused: number;
  referred: number;
  accounts: number;
}> {
  const [row] = await db
    .select({
      codes: sql<number>`(select count(*)::int from affiliates)`,
      active: sql<number>`(select count(*)::int from affiliates where status = 'active')`,
      paused: sql<number>`(select count(*)::int from affiliates where status = 'paused')`,
      referred: sql<number>`(select count(*)::int from users where referred_by is not null)`,
      accounts: sql<number>`(select count(*)::int from users)`,
    })
    .from(users)
    .limit(1);
  return {
    codes: Number(row?.codes ?? 0),
    active: Number(row?.active ?? 0),
    paused: Number(row?.paused ?? 0),
    referred: Number(row?.referred ?? 0),
    accounts: Number(row?.accounts ?? 0),
  };
}

/** CSV of one code's signups — the same shape as the reports export. */
export function referralsCsv(rows: ReferralSignup[]): string {
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const header = "name,email,signed up,plan,units";
  const body = rows.map((r) =>
    [
      escape(r.name ?? ""),
      escape(r.email),
      r.createdAt.toISOString().slice(0, 10),
      escape(r.plan),
      r.units,
    ].join(","),
  );
  return [header, ...body].join("\n");
}

/** The share link. The code is the only thing in it worth obfuscating, and it isn't. */
export function referralSignupUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/register?ref=${encodeURIComponent(code)}`;
}