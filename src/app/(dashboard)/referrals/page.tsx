import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, GiftIcon, UsersIcon } from "lucide-react";
import { auth } from "@/auth";
import { appUrl } from "@/lib/app-url";
import {
  affiliateForUser,
  referralSignupUrl,
  referralsFor,
} from "@/lib/referrals";
import { ReferralLinkCard } from "@/components/referrals/referral-link-card";
import { ReferralList } from "@/components/referrals/referral-list";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Share Renta-PH.net" — the landlord's own code, the link built from it, and
 * the accounts that arrived through it.
 *
 * Attribution only: nothing is earned and nothing is discounted. The value is
 * knowing who came from you, which is also how you find out a link you shared
 * is being used for spam.
 */
export const metadata = { title: "Referrals — Renta-PH.net" };

export default async function ReferralsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "tenant") redirect("/portal");

  const affiliate = await affiliateForUser(session.user.id);

  // Every landlord gets a code on account creation, so this should be
  // unreachable — but a mint can fail on a unique collision, and a page that
  // explains itself beats an error.
  if (!affiliate) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <h1 className="text-xl font-bold tracking-tight">
            We couldn&apos;t set up your referral link
          </h1>
          <p className="text-sm text-muted-foreground">
            Your account is fine — only the share link is missing. Try again in a
            moment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const signups = await referralsFor(affiliate.id);
  const signupUrl = referralSignupUrl(appUrl(), affiliate.code);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="mr-1 inline size-4" />
          Back to settings
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GiftIcon className="size-6 text-primary" />
          Referrals
        </h1>
        <p className="text-muted-foreground">
          Share your link. When someone signs up with it, you&apos;ll see them
          here.
        </p>
      </div>

      <ReferralLinkCard
        code={affiliate.code}
        signupUrl={signupUrl}
        signups={affiliate.signups}
        paused={affiliate.status === "paused"}
        pausedReason={affiliate.pausedReason}
      />

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UsersIcon className="size-5 text-muted-foreground" />
          Sign-ups from your link
        </h2>
        <ReferralList
          signups={signups}
          csvHref={`/referrals/export?format=csv`}
        />
      </div>

      {signups.length > 0 && (
        <p className="text-xs text-muted-foreground">
          You can see the name, email and plan of anyone who signed up using your
          link. That was explained on the sign-up page, and we tell them at the
          time too.
        </p>
      )}
    </div>
  );
}