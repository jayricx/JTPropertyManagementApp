import { auth } from "@/auth";
import { affiliateForUser, referralsCsv, referralsFor } from "@/lib/referrals";

/**
 * CSV of the signed-in landlord's own referrals.
 *
 * Scoped from the session rather than a parameter: there is deliberately no
 * code or affiliate id in the query string, because the one thing this file
 * must never do is hand anybody else's list to somebody else.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (session.user.role === "tenant") {
    return new Response("Not available for tenant accounts.", { status: 403 });
  }

  const affiliate = await affiliateForUser(session.user.id);
  if (!affiliate) {
    return new Response("No referral code on this account.", { status: 404 });
  }

  const signups = await referralsFor(affiliate.id);
  if (signups.length === 0) {
    return new Response("No referrals to export yet.", { status: 204 });
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(referralsCsv(signups), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="renta-referrals-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}