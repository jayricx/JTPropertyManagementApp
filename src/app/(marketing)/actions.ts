"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  consumeResetToken,
  createResetToken,
  RESET_TOKEN_TTL_MINUTES,
  resetRequestThrottled,
  setUserPassword,
} from "@/lib/password-reset";

export type PasswordActionState =
  | { error?: string; sent?: boolean; ok?: boolean }
  | null;

const requestSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const resetSchema = z.object({
  token: z.string().min(20, "This reset link is invalid."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200, "That password is too long."),
  confirmPassword: z.string(),
});

function appUrl(): string {
  // AUTH_URL is the deployment's canonical origin; the forwarded host is
  // correct behind Vercel once `trustHost` is on.
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/**
 * Start a password reset.
 *
 * Always reports success, whether or not the address belongs to an account:
 * a different reply for unknown addresses would turn this form into an
 * account-enumeration oracle. Delivery failures and the per-account
 * throttle are both silent for the same reason.
 */
export async function requestPasswordResetAction(
  _prev: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const parsed = requestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter your email." };
  }

  const email = parsed.data.email.toLowerCase();
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    // Password accounts only — the row must be able to sign in at all.
    .limit(1);

  if (user) {
    const throttled = await resetRequestThrottled(user.id);
    if (!throttled) {
      const { token } = await createResetToken(user.id);
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      });
    }
  }

  return { sent: true };
}

/** Consume a reset link and set the new password. */
export async function resetPasswordAction(
  _prev: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "Those passwords don't match." };
  }

  const consumed = await consumeResetToken(parsed.data.token);
  if (!consumed) {
    return {
      error:
        "This reset link is invalid or has expired. Request a new one to continue.",
    };
  }

  await setUserPassword(consumed.userId, parsed.data.password);
  return { ok: true };
}