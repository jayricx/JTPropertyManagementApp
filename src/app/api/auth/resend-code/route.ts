import { NextResponse } from "next/server";
import { z } from "zod";
import { sendVerificationCodeEmail } from "@/lib/email";
import {
  CODE_TTL_MINUTES,
  resendRegistrationCode,
} from "@/lib/email-verification";

const resendSchema = z.object({ email: z.string().email() });

/**
 * Mail a fresh registration code. Replies the same way whether or not a sign-up
 * is actually waiting, so this can't be used to probe which addresses exist.
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
    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const result = await resendRegistrationCode(email);

    if (result.ok) {
      await sendVerificationCodeEmail({
        to: email,
        name: result.name,
        code: result.code,
        expiresInMinutes: CODE_TTL_MINUTES,
      });
      return NextResponse.json({ sent: true, expiresInMinutes: CODE_TTL_MINUTES });
    }

    return NextResponse.json({
      // A throttled request did not send anything, and neither did one for an
      // address with no sign-up waiting.
      sent: false,
      retryInSeconds: result.retryInSeconds,
    });
  } catch (error) {
    console.error("Resend code error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}