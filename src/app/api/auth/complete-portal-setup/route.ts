import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { tenants, users } from "@/db/schema";
import { acceptTenantInvitation } from "@/lib/tenant-invitations";

const completeSchema = z.object({
  token: z.string().min(20, "This invitation link is invalid."),
  password: z.string().min(8).max(100),
});

/**
 * Finish a tenant's sign-up. The invitation link proved control of the
 * tenant's email, so the account is created here and the tenant is signed in
 * straight away.
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
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the form." },
        { status: 400 },
      );
    }

    const { token } = parsed.data;
    const password = parsed.data.password;
    const result = await acceptTenantInvitation(token);
    if (!result) {
      return NextResponse.json(
        { error: "That invite is invalid or has expired." },
        { status: 400 },
      );
    }
    if (result.alreadyActive) {
      return NextResponse.json(
        { error: "This portal is already set up. Sign in instead." },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // A crash between the two writes below can leave an account that exists but
    // isn't linked yet — adopt it rather than colliding on the unique email.
    // Only a tenant-role account may be adopted: if this address signed up as a
    // landlord after the invite went out, touching its password would hand the
    // tenant's chosen password to a landlord account.
    const [existing] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(sql`lower(${users.email})`, result.email))
      .limit(1);
    if (existing && existing.role !== "tenant") {
      return NextResponse.json(
        { error: "That email already has an account. Sign in instead." },
        { status: 409 },
      );
    }

    let accountId = existing?.id;
    if (!accountId) {
      const [inserted] = await db
        .insert(users)
        .values({
          name: result.tenantName,
          email: result.email,
          passwordHash,
          role: "tenant",
          // The landlord vouched for this address, so the account starts verified.
          emailVerified: new Date(),
        })
        .returning({ id: users.id });
      accountId = inserted.id;
    }

    if (existing) {
      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, existing.id));
    }

    await db
      .update(tenants)
      .set({ accountId })
      .where(eq(tenants.id, result.tenantId));

    return NextResponse.json({ email: result.email }, { status: 201 });
  } catch (error) {
    console.error("Tenant setup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}