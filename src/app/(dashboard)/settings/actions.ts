"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { emailShell, sendEmail } from "@/lib/email";

/** `ok` lets the form show a saved state after a successful update. */
export type ActionState = { error?: string; ok?: boolean } | null;

/**
 * Result of a delivery self-test. Unlike the real email flows, this reports the
 * provider's verdict verbatim: those flows must stay silent about whether an
 * address exists, but when debugging configuration you need the actual error.
 */
export type TestEmailState =
  | {
      status: "sent" | "failed";
      /** The provider's own message, safe to show to the account owner. */
      detail: string;
    }
  | null;

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

/**
 * Send a real email to the signed-in landlord so they can confirm delivery
 * without digging through server logs. Reports the provider's response either
 * way — this is a self-test, not an account-recovery flow, so there is no
 * enumeration concern.
 */
export async function sendTestEmailAction(
  _prev: TestEmailState,
  formData: FormData,
): Promise<TestEmailState> {
  // Bind the action to this one form.
  if (formData.get("intent") !== "test-email") {
    return { status: "failed", detail: "Unexpected request." };
  }

  const session = await auth();
  if (!session?.user) return { status: "failed", detail: "You must be signed in." };

  // Read the address from the record rather than the session: the token can
  // still carry the address the account had at sign-in.
  const [account] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const to = account?.email;
  if (!to) {
    return { status: "failed", detail: "Your account has no email address on file." };
  }

  const result = await sendEmail({
    to,
    subject: "JT Property Management — email test",
    text: `This is a test message to confirm that ${to} can receive email from your app.

If you are reading it, sending works.`,
    html: emailShell(
      "Email is working",
      `<p>This is a test message to confirm that <strong>${to}</strong> can receive email from your app.</p>
       <p>If you are reading it, sending works.</p>`,
    ),
  });

  return result.delivered
    ? {
        status: "sent",
        detail: `Resend accepted the message for ${to}. Check the inbox, then spam.`,
      }
    : {
        status: "failed",
        detail: result.reason ?? "The provider refused the message for an unknown reason.",
      };
}
