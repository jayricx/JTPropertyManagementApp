import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { claimInvitationForAccount } from "@/lib/tenant-invitations";

const claimSchema = z.object({
  token: z.string().min(20, "This invitation link is invalid."),
});

/**
 * Finish a tenant's portal setup via Google. The browser returns here from
 * Google already signed in, so the invite just needs to be attached to that
 * account. The token is the proof of control over the invited address, so the
 * account's email must match it — {@link claimInvitationForAccount} checks that
 * before spending the single-use link.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Database is not configured. Set DATABASE_URL in .env.local." },
        { status: 503 },
      );
    }

    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json(
        { error: "Sign in with Google to continue." },
        { status: 401 },
      );
    }

    const parsed = claimSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the link." },
        { status: 400 },
      );
    }

    const outcome = await claimInvitationForAccount(
      parsed.data.token,
      session.user.id,
      session.user.email,
    );
    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.status },
      );
    }

    return NextResponse.json({ email: outcome.email }, { status: 200 });
  } catch (error) {
    console.error("Tenant Google setup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
