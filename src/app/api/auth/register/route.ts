import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { sendVerificationCodeEmail } from "@/lib/email";
import {
  beginRegistration,
  CODE_TTL_MINUTES,
  purgeExpiredPendingRegistrations,
} from "@/lib/email-verification";
import { looksLikeCode, normalizeCode } from "@/lib/referrals";

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  /**
   * Optional. Normally comes from the `rb_ref` cookie that middleware set off
   * `?ref=`, but the form also posts it directly for someone who typed a code
   * by hand. Unvalidated here beyond shape — an unknown code is a missing
   * attribution, never a failed signup.
   */
  referralCode: z.string().trim().max(32).optional(),
});

/**
 * Start a signup.
 *
 * The account is not created here — only a pending registration, plus a code
 * emailed to the address. The real row appears once that code comes back
 * (see /verify-code), so an unverified address never holds a usable login.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Database is not configured. Set DATABASE_URL in .env.local." },
        { status: 503 },
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    // Cheap cleanup of signups abandoned long ago.
    await purgeExpiredPendingRegistrations().catch(() => {});

    // The referral rides along on the pending row, not in the browser: that
    // row is the only thing that survives between this step and the emailed
    // verification, so it's the only place a code can be trusted to still mean
    // what it did when the form was submitted.
    const referralCode = normalizeCode(
      parsed.data.referralCode || request.headers.get("x-referral-code"),
    );

    const started = await beginRegistration({
      email: normalizedEmail,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      referralCode: looksLikeCode(referralCode) ? referralCode : null,
    });

    if (!started.ok) {
      return NextResponse.json(
        {
          error: "We just emailed a code to that address. Give it a moment before asking for another.",
          retryInSeconds: started.retryInSeconds,
        },
        { status: 429 },
      );
    }

    await sendVerificationCodeEmail({
      to: normalizedEmail,
      name,
      code: started.code,
      expiresInMinutes: CODE_TTL_MINUTES,
    });

    return NextResponse.json(
      { email: normalizedEmail, expiresInMinutes: CODE_TTL_MINUTES },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}