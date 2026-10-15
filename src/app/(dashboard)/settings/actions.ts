"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/** `ok` lets the form show a saved state after a successful update. */
export type ActionState = { error?: string; ok?: boolean } | null;

const gcashSettingsSchema = z.object({
  gcashNumber: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^[0-9+ ]{7,20}$/.test(v),
      "Enter a valid GCash number (digits, + or spaces).",
    ),
  gcashName: z.string().trim().max(255),
});

/**
 * Save the landlord's GCash wallet details — the destination tenants are
 * shown on the portal's pay-rent page. Empty values remove the details.
 */
export async function saveGcashSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (session.user.role !== "landlord") {
    return { error: "Only landlord accounts have settings." };
  }

  const parsed = gcashSettingsSchema.safeParse({
    gcashNumber: formData.get("gcashNumber") ?? "",
    gcashName: formData.get("gcashName") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }

  await db
    .update(users)
    .set({
      gcashNumber: parsed.data.gcashNumber || null,
      gcashName: parsed.data.gcashName || null,
    })
    .where(eq(users.id, session.user.id));

  revalidatePath("/settings");
  // The tenant pay-rent page reads these details.
  revalidatePath("/portal");
  return { ok: true };
}
