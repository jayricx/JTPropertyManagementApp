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
 * tenant's email, so a fresh account is created here and the tenant is signed
 * in straight away. If the address already has an account — an owner who rents
 * from another owner — the invite is linked to it instead, and they sign in
 * with their existing password.
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

    // A crash between the two writes below can leave an account that exists but
    // isn't linked yet — adopt it rather than colliding on the unique email.
    //
    // An existing account is linked as-is. Only a tenant-only account (the
    // half-finished crash case) takes the chosen password; an owner's account
    // keeps its own credentials — the emailed token already proved control of
    // this address, so linking is authorized without touching their login.
    const [existing] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(sql`lower(${users.email})`, result.email))
      .limit(1);

    let accountId: string;
    let linkedExisting = false;

    if (existing) {
      // The portal resolves a signed-in user's profile with a single row, so
      // keep the one-link-per-account invariant (a race between two landlords
      // inviting the same address is the only way to break it).
      const [otherLink] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.accountId, existing.id))
        .limit(1);
      if (otherLink) {
        return NextResponse.json(
          { error: "That email is already linked to another tenancy." },
          { status: 409 },
        );
      }

      accountId = existing.id;
      if (existing.role === "tenant") {
        const passwordHash = await bcrypt.hash(password, 10);
        await db
          .update(users)
          .set({ passwordHash })
          .where(eq(users.id, existing.id));
      } else {
        // Owner account: nothing to set up — they sign in as usual.
        linkedExisting = true;
      }
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
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

    await db
      .update(tenants)
      .set({ accountId })
      .where(eq(tenants.id, result.tenantId));

    return NextResponse.json(
      { email: result.email, linkedExisting },
      { status: 201 },
    );
  } catch (error) {
    console.error("Tenant setup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}