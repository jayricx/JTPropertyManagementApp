"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { markPayoutPaid, updateProgram, voidPayout } from "@/lib/referral-payouts";

export type PayoutActionState = { error?: string; ok?: boolean } | null;

/**
 * Guard for every payout action. These write money out of the business, so an
 * operator check is not enough on its own — the check and the write live in the
 * same function to make the gate impossible to forget at a call site.
 */
async function assertOperator(): Promise<{ error: string } | null> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  const [row] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row?.isAdmin) return { error: "Only operators can settle payouts." };
  return null;
}

export async function markPayoutPaidAction(
  payoutId: string,
  method: string,
  reference: string,
): Promise<PayoutActionState> {
  const denied = await assertOperator();
  if (denied) return denied;

  const result = await markPayoutPaid(payoutId, method, reference);
  revalidatePath("/admin/referrals/payouts");
  revalidatePath("/referrals");
  return result.ok ? { ok: true } : { error: result.error };
}

export async function voidPayoutAction(
  payoutId: string,
  reason: string,
): Promise<PayoutActionState> {
  const denied = await assertOperator();
  if (denied) return denied;

  const result = await voidPayout(payoutId, reason);
  revalidatePath("/admin/referrals/payouts");
  revalidatePath("/referrals");
  return result.ok ? { ok: true } : { error: result.error };
}

export async function updateProgramAction(input: {
  enabled: boolean;
  bountyAmount: number;
  payoutDelayDays: number;
}): Promise<PayoutActionState & { settings?: unknown }> {
  const denied = await assertOperator();
  if (denied) return denied;

  if (!Number.isFinite(input.bountyAmount) || input.bountyAmount < 0) {
    return { error: "Enter a bounty of zero or more." };
  }
  if (!Number.isInteger(input.payoutDelayDays) || input.payoutDelayDays < 0) {
    return { error: "Enter a delay in whole days, zero or more." };
  }
  // 99 days is chosen as an upper bound nobody sensible needs; the guard is
  // really about a stray keystroke not parking money for a year.
  if (input.payoutDelayDays > 99) {
    return { error: "The delay can't be more than 99 days." };
  }

  const settings = await updateProgram({
    enabled: input.enabled,
    bountyAmount: input.bountyAmount,
    payoutDelayDays: input.payoutDelayDays,
  });
  revalidatePath("/admin/referrals/payouts");
  return { ok: true, settings };
}