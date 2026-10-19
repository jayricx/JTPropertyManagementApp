"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { bankAccounts, portfolios, users } from "@/db/schema";
import { bankDisplayName, isKnownBankCode } from "@/lib/banks";
import { emailDiagnostics, emailShell, sendEmail } from "@/lib/email";
import { bankAccountSchema } from "@/lib/validations";
import { isUuid } from "@/lib/utils";

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

const businessNameSchema = z.object({
  businessName: z.string().trim().max(200, "That name is too long."),
});

/**
 * The trading name this landlord contracts under. It replaces the personal
 * name on lease contracts, which is why only the portfolio *owner* may set it:
 * this names who is entering the agreement, and a co-owner shouldn't be able
 * to rewrite that on contracts they help prepare.
 *
 * Existing contracts are untouched — their terms are frozen at issue, so
 * changing this only affects contracts issued from now on.
 */
export async function saveBusinessNameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };

  const parsed = businessNameSchema.safeParse({
    businessName: formData.get("businessName") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }

  const owned = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.ownerUserId, session.user.id))
    .limit(1);
  if (!owned.length) {
    return { error: "Only the portfolio owner can set a business name." };
  }

  await db
    .update(portfolios)
    .set({
      businessName: parsed.data.businessName || null,
      updatedAt: new Date(),
    })
    .where(eq(portfolios.id, owned[0].id));

  revalidatePath("/settings");
  revalidatePath("/leases");
  return { ok: true };
}

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
 * Add a bank account tenants can transfer rent to. The bank's catalog name
 * is stored for known banks; "other" stores the landlord's own text so the
 * tenant always sees a plain bank name. Accounts appear on the bank-transfer
 * pay-rent page immediately.
 */
export async function createBankAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (session.user.role !== "landlord") {
    return { error: "Only landlord accounts have settings." };
  }

  const parsed = bankAccountSchema.safeParse({
    bankCode: formData.get("bankCode") ?? "",
    otherBankName: formData.get("otherBankName") ?? "",
    accountNumber: formData.get("accountNumber") ?? "",
    accountName: formData.get("accountName") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid bank account." };
  }
  // Reject a bank code that's neither in the catalog nor the Other sentinel —
  // otherwise a forged value would be stored verbatim as the bank name.
  if (!isKnownBankCode(parsed.data.bankCode)) {
    return { error: "Choose a bank from the list." };
  }

  await db.insert(bankAccounts).values({
    userId: session.user.id,
    bankCode: parsed.data.bankCode,
    bankName: bankDisplayName(parsed.data.bankCode, parsed.data.otherBankName),
    accountNumber: parsed.data.accountNumber,
    accountName: parsed.data.accountName,
  });

  revalidatePath("/settings");
  // The tenant pay-rent pages read these accounts.
  revalidatePath("/portal");
  return { ok: true };
}

/**
 * Remove one of the landlord's own bank accounts (scoped to the signed-in
 * user, so an id from another landlord's account can never match). The
 * account disappears from the tenant's bank-transfer page immediately; any
 * payment already submitted keeps its record of where the money went.
 */
export async function deleteBankAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be signed in." };
  if (session.user.role !== "landlord") {
    return { error: "Only landlord accounts have settings." };
  }

  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { error: "Bank account not found." };

  await db
    .delete(bankAccounts)
    .where(
      and(eq(bankAccounts.id, id), eq(bankAccounts.userId, session.user.id)),
    );

  revalidatePath("/settings");
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
    subject: "Renta-PH.net — email test",
    text: `This is a test message to confirm that ${to} can receive email from your app.

If you are reading it, sending works.`,
    html: emailShell(
      "Email is working",
      `<p>This is a test message to confirm that <strong>${to}</strong> can receive email from your app.</p>
       <p>If you are reading it, sending works.</p>`,
    ),
  });

  const transport = emailDiagnostics().transport;
  const provider =
    transport === "gmail" ? "Gmail" : transport === "resend" ? "Resend" : null;

  return result.delivered
    ? {
        status: "sent",
        detail: `${provider ?? "The provider"} accepted the message for ${to}. Check the inbox, then spam.`,
      }
    : {
        status: "failed",
        detail: result.reason ?? "The provider refused the message for an unknown reason.",
      };
}
