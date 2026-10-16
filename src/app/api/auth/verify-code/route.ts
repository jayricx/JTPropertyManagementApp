import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { CODE_LENGTH, verifyRegistrationCode } from "@/lib/email-verification";

const verifySchema = z.object({
  email: z.string().email(),
  code: z
    .string()
    .trim()
    .regex(/^\d+$/, `Enter the ${CODE_LENGTH}-digit code from your email.`),
});

/**
 * Finish a signup: the code proves control of the address, so the account is
 * created now — verified from birth — and the pending row is spent.
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
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Enter the code from your email." },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const result = await verifyRegistrationCode(email, parsed.data.code);

    if (!result.ok) {
      const error =
        result.reason === "mismatch"
          ? "That code isn't right. Check it and try again."
          : result.reason === "locked"
            ? "Too many wrong attempts. Request a new code to continue."
            : result.reason === "expired"
              ? "That code has expired. Request a new one to continue."
              : "We don't have a sign-up waiting for that address. Start again.";
      return NextResponse.json({ error, code: result.reason }, { status: 400 });
    }

    const { email: address, name, passwordHash } = result.registration;

    // Another tab may have completed the same signup in between.
    const [already] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, address))
      .limit(1);
    if (already) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    await db.insert(users).values({
      name,
      email: address,
      passwordHash,
      // Reaching here means the address was proven, so the account starts
      // verified rather than carrying a pending flag the app never checks.
      emailVerified: new Date(),
    });

    return NextResponse.json({ email: address }, { status: 201 });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}