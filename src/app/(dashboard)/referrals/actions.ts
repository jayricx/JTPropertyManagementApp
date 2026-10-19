"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { affiliates, users } from "@/db/schema";

export type PauseState = { error?: string; ok?: boolean } | null;

/**
 * Pause or restore a referral code.
 *
 * Operator-only, and deliberately narrow: it changes whether new sign-ups are
 * *counted*, never who already was. Restoring puts the code back exactly as it
 * was. Pausing records why, because a bare pause in six months is a mystery.
 */
export async function setAffiliatePausedAction(
  affiliateId: string,
  paused: boolean,
  reason: string,
): Promise<PauseState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const [account] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!account?.isAdmin) {
    return { error: "Only operators can change referral codes." };
  }

  // A paused code must carry a reason; a restored one must not keep a stale one.
  const trimmed = reason.trim().slice(0, 500);
  if (paused && !trimmed) {
    return { error: "Say why this code is being paused." };
  }

  const [row] = await db
    .update(affiliates)
    .set({
      status: paused ? "paused" : "active",
      pausedReason: paused ? trimmed : null,
    })
    .where(and(eq(affiliates.id, affiliateId), eq(affiliates.status, paused ? "active" : "paused")))
    .returning({ id: affiliates.id });

  if (!row) {
    // Already in the requested state — not an error, just nothing to do.
    return { ok: true };
  }

  revalidatePath("/admin/referrals");
  revalidatePath("/referrals");
  return { ok: true };
}