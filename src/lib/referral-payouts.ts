import { and, desc, eq, gt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  affiliates,
  leases,
  payments,
  portfolios,
  properties,
  referralPayouts,
  referralProgram,
  units,
  users,
} from "@/db/schema";

/**
 * Referral payouts.
 *
 * A referred landlord earns their referrer a fixed bounty the first time a
 * rent payment on one of their leases is *verified*. Three properties this file
 * is built to guarantee:
 *
 *  - **Once per referred account, ever.** The UNIQUE constraint on
 *    `referred_user_id` is the real guard. Two separate code paths can verify a
 *    payment, so an application-level check would eventually be wrong in the
 *    direction that costs money.
 *  - **Never immediately.** `payableAt` is stored, not computed by a job, so
 *    "what is owed today" is a comparison rather than a question about whether
 *    a cron ran. Rent gets refunded; thirty days of paying is what a customer
 *    looks like.
 *  - **Never blocks a payment.** Verification succeeds whether or not a payout
 *    is created. A bug in here must not cost a landlord their rent record.
 */

export interface ProgramSettings {
  enabled: boolean;
  bountyAmount: number;
  payoutDelayDays: number;
}

export async function programSettings(): Promise<ProgramSettings> {
  const [row] = await db.select().from(referralProgram).where(eq(referralProgram.id, 1)).limit(1);
  return {
    // A missing row means a database that predates this migration. Defaulting
    // to disabled means the safe direction: no accruing liability by surprise.
    enabled: row?.enabled ?? false,
    bountyAmount: Number(row?.bountyAmount ?? 0),
    payoutDelayDays: Number(row?.payoutDelayDays ?? 30),
  };
}

export interface TriggerOutcome {
  created: boolean;
  reason?: "disabled" | "not_referred" | "already_paid_once" | "no_programme";
  amount?: number;
}

/**
 * Called when a rent payment becomes verified. Idempotent and non-throwing:
 * this runs inside payment verification, which must not fail because of the
 * referral programme.
 */
export async function onPaymentVerified(
  paymentId: string,
): Promise<TriggerOutcome> {
  try {
    const settings = await programSettings();
    if (!settings.enabled || settings.bountyAmount <= 0) {
      return { created: false, reason: "disabled" };
    }

    const landlord = await landlordForPayment(paymentId);
    if (!landlord) return { created: false, reason: "not_referred" };
    if (!landlord.referredBy) return { created: false, reason: "not_referred" };

    const now = new Date();
    const [row] = await db
      .insert(referralPayouts)
      .values({
        affiliateId: landlord.referredBy,
        referredUserId: landlord.id,
        amount: settings.bountyAmount.toFixed(2),
        triggeredByPaymentId: paymentId,
        triggeredAt: now,
        payableAt: new Date(
          now.getTime() + settings.payoutDelayDays * 24 * 60 * 60 * 1000,
        ),
      })
      // The unique index does the work: a second verified payment from the
      // same referred landlord loses the race here instead of double-paying.
      .onConflictDoNothing({ target: referralPayouts.referredUserId })
      .returning({ id: referralPayouts.id });

    if (!row) return { created: false, reason: "already_paid_once" };

    console.log(
      `[referrals] bounty of ₱${settings.bountyAmount.toFixed(2)} earned by ${landlord.referredBy} for ${landlord.id}`,
    );
    return { created: true, amount: settings.bountyAmount };
  } catch (error) {
    // Deliberately swallowed: the payment is already verified and that is not
    // in question. A payout can be created by hand from the admin view.
    console.error("[referrals] payout trigger failed:", error);
    return { created: false, reason: "no_programme" };
  }
}

/**
 * The landlord behind a payment, and who referred them.
 *
 * A payment belongs to a lease, the lease to a tenant, and the tenant to a
 * portfolio whose owner is the landlord — the same resolution the rest of the
 * app uses, so a co-owner collecting rent still credits the portfolio owner.
 */
async function landlordForPayment(
  paymentId: string,
): Promise<{ id: string; referredBy: string | null } | null> {
  const [row] = await db
    .select({
      id: users.id,
      referredBy: users.referredBy,
    })
    .from(payments)
    .innerJoin(leases, eq(leases.id, payments.leaseId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(portfolios, eq(portfolios.id, properties.portfolioId))
    .innerJoin(users, eq(users.id, portfolios.ownerUserId))
    .where(eq(payments.id, paymentId))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface PayoutRow {
  id: string;
  amount: number;
  status: "pending" | "paid" | "voided";
  triggeredAt: Date;
  payableAt: Date;
  /** True once the delay has elapsed and it is owed. */
  isPayable: boolean;
  daysUntilPayable: number;
  paidAt: Date | null;
  payoutMethod: string | null;
  payoutReference: string | null;
  voidedReason: string | null;
  affiliateCode: string;
  affiliateName: string;
  referredName: string | null;
  referredEmail: string;
}

const DAY = 24 * 60 * 60 * 1000;

function toRow(
  r: {
    id: string;
    amount: string;
    status: "pending" | "paid" | "voided";
    triggeredAt: Date;
    payableAt: Date;
    paidAt: Date | null;
    payoutMethod: string | null;
    payoutReference: string | null;
    voidedReason: string | null;
    affiliateCode: string;
    affiliateName: string;
    referredName: string | null;
    referredEmail: string;
  },
  now = new Date(),
): PayoutRow {
  const remaining = r.payableAt.getTime() - now.getTime();
  return {
    id: r.id,
    amount: Number(r.amount),
    status: r.status,
    triggeredAt: r.triggeredAt,
    payableAt: r.payableAt,
    isPayable: r.status === "pending" && remaining <= 0,
    daysUntilPayable: Math.max(0, Math.ceil(remaining / DAY)),
    paidAt: r.paidAt,
    payoutMethod: r.payoutMethod,
    payoutReference: r.payoutReference,
    voidedReason: r.voidedReason,
    affiliateCode: r.affiliateCode,
    affiliateName: r.affiliateName,
    referredName: r.referredName,
    referredEmail: r.referredEmail,
  };
}

function selectPayoutRows(where?: SQL | undefined) {
  return db
    .select({
      id: referralPayouts.id,
      amount: referralPayouts.amount,
      status: referralPayouts.status,
      triggeredAt: referralPayouts.triggeredAt,
      payableAt: referralPayouts.payableAt,
      paidAt: referralPayouts.paidAt,
      payoutMethod: referralPayouts.payoutMethod,
      payoutReference: referralPayouts.payoutReference,
      voidedReason: referralPayouts.voidedReason,
      affiliateCode: affiliates.code,
      affiliateName: affiliates.name,
      referredName: users.name,
      referredEmail: users.email,
    })
    .from(referralPayouts)
    .innerJoin(affiliates, eq(affiliates.id, referralPayouts.affiliateId))
    .innerJoin(users, eq(users.id, referralPayouts.referredUserId))
    .where(where)
    .orderBy(desc(referralPayouts.triggeredAt));
}

/** Everything owed, waiting, or already disbursed. */
export async function allPayouts(): Promise<PayoutRow[]> {
  return (await selectPayoutRows()).map((r) => toRow(r));
}

/** One affiliate's own payouts — the same holder-scoped rule as referrals. */
export async function payoutsFor(affiliateId: string): Promise<PayoutRow[]> {
  return (
    await selectPayoutRows(eq(referralPayouts.affiliateId, affiliateId))
  ).map((r) => toRow(r));
}

export interface PayoutTotals {
  earned: number;
  /** Passed the delay, still unpaid. */
  owed: number;
  /** Within the delay — not owed yet. */
  waiting: number;
  paid: number;
  voided: number;
}

export function totalsFor(rows: PayoutRow[]): PayoutTotals {
  const sum = (list: PayoutRow[]) =>
    Math.round(list.reduce((n, r) => n + r.amount, 0) * 100) / 100;
  return {
    earned: sum(rows.filter((r) => r.status !== "voided")),
    owed: sum(rows.filter((r) => r.isPayable)),
    waiting: sum(rows.filter((r) => r.status === "pending" && !r.isPayable)),
    paid: sum(rows.filter((r) => r.status === "paid")),
    voided: sum(rows.filter((r) => r.status === "voided")),
  };
}

export async function allPayoutTotals(): Promise<PayoutTotals> {
  return totalsFor(await allPayouts());
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Record a disbursement. Method and reference are kept, never inferred. */
export async function markPayoutPaid(
  payoutId: string,
  method: string,
  reference: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmedMethod = method.trim().slice(0, 64);
  if (!trimmedMethod) return { ok: false, error: "Say how it was paid." };
  const trimmedRef = reference.trim().slice(0, 255);

  const [row] = await db
    .update(referralPayouts)
    .set({
      status: "paid",
      paidAt: new Date(),
      payoutMethod: trimmedMethod,
      payoutReference: trimmedRef || null,
    })
    .where(
      and(
        eq(referralPayouts.id, payoutId),
        eq(referralPayouts.status, "pending"),
      ),
    )
    .returning({ id: referralPayouts.id });

  // Already paid or voided — the conditional claim made a double-click
  // harmless, so this is a no-op rather than an error.
  return row ? { ok: true } : { ok: false, error: "That payout is already settled." };
}

/**
 * Void a pending payout. Only possible before the delay elapses, which is the
 * point: after it is owed, cancelling it is a decision someone should notice.
 */
export async function voidPayout(
  payoutId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = reason.trim().slice(0, 500);
  if (!trimmed) return { ok: false, error: "Say why this is being voided." };

  const [row] = await db
    .update(referralPayouts)
    .set({ status: "voided", voidedReason: trimmed })
    .where(
      and(
        eq(referralPayouts.id, payoutId),
        eq(referralPayouts.status, "pending"),
        // Only while it is still *waiting*. `payable_at > now()` is the point:
        // once the delay has passed the bounty is owed, and cancelling something
        // owed is a decision that should leave a trail rather than be allowed to
        // disappear quietly.
        gt(referralPayouts.payableAt, sql`now()`),
      ),
    )
    .returning({ id: referralPayouts.id });

  return row
    ? { ok: true }
    : { ok: false, error: "That payout is already owed, paid, or voided." };
}

/** Pause or resume the programme, and set the bounty and delay. */
export async function updateProgram(input: {
  enabled: boolean;
  bountyAmount: number;
  payoutDelayDays: number;
}): Promise<ProgramSettings> {
  await db
    .insert(referralProgram)
    .values({
      id: 1,
      enabled: input.enabled,
      bountyAmount: input.bountyAmount.toFixed(2),
      payoutDelayDays: input.payoutDelayDays,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: referralProgram.id,
      set: {
        enabled: input.enabled,
        bountyAmount: input.bountyAmount.toFixed(2),
        payoutDelayDays: input.payoutDelayDays,
        updatedAt: new Date(),
      },
    });
  return programSettings();
}