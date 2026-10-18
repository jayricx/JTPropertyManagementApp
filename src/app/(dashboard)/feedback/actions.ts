"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { featureRequests, featureRequestUpdates, users } from "@/db/schema";
import { sendFeatureRequestUpdateEmail } from "@/lib/email";
import { awardXp } from "@/lib/gamification";
import {
  FEATURE_REQUEST_CATEGORIES,
  MAX_OPEN_REQUESTS,
  STATUS_LABELS,
  openRequestCount,
  type FeatureRequestCategory,
  type FeatureRequestStatus,
} from "@/lib/feature-requests";
import { activePortfolioId } from "@/lib/portfolios";
import { isUuid } from "@/lib/utils";

export type ActionState = { error?: string; ok?: boolean } | null;

const STATUSES: FeatureRequestStatus[] = [
  "submitted",
  "under_review",
  "planned",
  "shipped",
  "declined",
];

const requestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(8, "Give it a short title — at least 8 characters.")
    .max(200, "Keep the title under 200 characters."),
  details: z
    .string()
    .trim()
    .min(20, "Tell us a bit more — what were you trying to do?")
    .max(2000, "Keep it under 2000 characters."),
  category: z.enum(
    FEATURE_REQUEST_CATEGORIES.map((c) => c.value) as [
      FeatureRequestCategory,
      ...FeatureRequestCategory[],
    ],
  ),
});

/** Landlords only — this is the landlord product, and tenants can't act on it. */
async function landlord() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "landlord") return null;
  return session.user;
}

/**
 * The people who run RentBase-PH: they answer feature requests and decide what
 * goes on the public roadmap. A landlord's own portfolio is unaffected either
 * way — this flag unlocks triage, not their own records.
 */
export async function currentAdmin() {
  const user = await landlord();
  if (!user) return null;

  const [row] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return row?.isAdmin ? user : null;
}

/**
 * Submit a feature request. The plan and portfolio are snapshotted at
 * submission time: "who asked" and "how much rent does this touch" is the
 * triage signal, and it has to be recorded when the ask was made rather than
 * looked up later.
 */
export async function createFeatureRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await landlord();
  if (!user) return { error: "You must be signed in." };

  const parsed = requestSchema.safeParse({
    title: formData.get("title") ?? "",
    details: formData.get("details") ?? "",
    category: formData.get("category") ?? "other",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  // Keep the inbox honest: a handful of open asks each, not a hundred.
  const open = await openRequestCount(user.id);
  if (open >= MAX_OPEN_REQUESTS) {
    return {
      error: `You already have ${open} open requests. We'll reply to those first — closing one frees a slot.`,
    };
  }

  const [account] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [created] = await db
    .insert(featureRequests)
    .values({
      userId: user.id,
      portfolioId: await activePortfolioId(user.id),
      category: parsed.data.category,
      title: parsed.data.title,
      details: parsed.data.details,
      planAtSubmission: account?.plan ?? null,
    })
    .returning({ id: featureRequests.id });

  // The automatic first entry, so the history is never empty.
  await db.insert(featureRequestUpdates).values({
    requestId: created.id,
    status: "submitted",
    note: null,
  });

  await awardXp(user.id, "feature_requested");

  revalidatePath("/feedback");
  revalidatePath("/feedback/inbox");
  return { ok: true };
}

/**
 * Move a request to a new status and tell the submitter. The owner triages;
 * the note goes out in the same breath, because a status change nobody is told
 * about is the failure mode this whole feature exists to avoid.
 */
export async function updateFeatureRequestStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentAdmin();
  if (!user) return { error: "You must be signed in." };

  const id = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "") as FeatureRequestStatus;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!isUuid(id)) return { error: "Request not found." };
  if (!STATUSES.includes(status)) return { error: "Unknown status." };

  const [request] = await db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      status: featureRequests.status,
      userId: featureRequests.userId,
    })
    .from(featureRequests)
    .where(eq(featureRequests.id, id))
    .limit(1);
  if (!request) return { error: "Request not found." };

  const [account] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, request.userId))
    .limit(1);
  if (!account) return { error: "Request not found." };

  // Someone answering their own request would be "the app will do whatever you
  // say", which isn't a roadmap — admins can't triage their own asks.
  if (request.userId === user.id) {
    return { error: "You can only answer requests from other landlords." };
  }

  if (request.status === status && note === null) return { ok: true };

  await db
    .update(featureRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(featureRequests.id, id));

  await db.insert(featureRequestUpdates).values({
    requestId: id,
    status,
    note,
    createdBy: user.id,
  });

  if (account) {
    try {
      await sendFeatureRequestUpdateEmail({
        to: account.email,
        name: account.name,
        requestTitle: request.title,
        statusLabel: STATUS_LABELS[status],
        note,
      });
    } catch (error) {
      // The status change itself must stand even if the mail fails.
      console.error("[feedback] status email failed", error);
    }
  }

  revalidatePath("/feedback");
  revalidatePath("/feedback/inbox");
  revalidatePath("/roadmap");
  return { ok: true };
}

/**
 * Publish or unpublish a request on the public roadmap. Always the owner's
 * call — nothing a landlord writes is public until someone decides it is.
 */
export async function setFeatureRequestPublicAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentAdmin();
  if (!user) return { error: "You must be signed in." };

  const id = String(formData.get("requestId") ?? "");
  if (!isUuid(id)) return { error: "Request not found." };

  const [request] = await db
    .select({ id: featureRequests.id, userId: featureRequests.userId })
    .from(featureRequests)
    .where(eq(featureRequests.id, id))
    .limit(1);
  if (!request) return { error: "Request not found." };
  if (request.userId === user.id) {
    return { error: "You can only publish requests from other landlords." };
  }

  await db
    .update(featureRequests)
    .set({ isPublic: formData.get("public") === "true", updatedAt: new Date() })
    .where(and(eq(featureRequests.id, id)));

  revalidatePath("/feedback/inbox");
  revalidatePath("/roadmap");
  return { ok: true };
}