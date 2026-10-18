import Link from "next/link";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PLAN_LABELS, PLAN_PRICES, PLAN_TIERS, PLAN_UNIT_LIMITS } from "@/lib/plans";
import { cn } from "@/lib/utils";

const TIER_FEATURES = {
  free: [
    "Up to 2 units",
    "Tenants & leases",
    "Rent logging",
    "Maintenance requests",
    "Tenant portal invites",
    "Health score & badges",
  ],
  starter: [
    "Up to 10 units",
    "Everything in Free",
    "Co-owner collaboration",
    "Portfolio custom fields",
    "Reports & CSV export",
  ],
  pro: [
    "Up to 20 units",
    "Everything in Starter",
    "Lease-end alerts",
    "Lease attachments & notes",
    "GCash & bank transfer",
    "Receipt photos",
  ],
  business: [
    "Unlimited units",
    "Everything in Pro",
    "Accounting sync (coming soon)",
    "AI insights (coming soon)",
  ],
} as const satisfies Record<(typeof PLAN_TIERS)[number], readonly string[]>;

export default async function PricingPage() {
  const session = await auth();
  const userPlan = (session?.user as { plan?: string } | undefined)?.plan ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col items-center px-6 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Simple, honest pricing
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Start free, upgrade when you need more units. Billing opens at launch — pay via
          GCash. Your data carries over.
        </p>
      </section>
      <section className="px-6 pb-16">
        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_TIERS.map((tier) => {
            const key = tier as keyof typeof PLAN_LABELS;
            const planLabel = PLAN_LABELS[key];
            const prices = PLAN_PRICES[key];
            const limit = PLAN_UNIT_LIMITS[key];
            const limitText =
              limit === null ? "Unlimited units" : `Up to ${limit} units`;
            const isCurrent = userPlan === key;
            const isPro = key === "pro";
            return (
              <Card key={key} className={cn(isPro && "border-primary shadow-lg")}>
                <CardHeader>
                  <CardTitle>{planLabel}</CardTitle>
                  <CardDescription>{limitText}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">₱{prices.monthly}</span>
                    <span className="ml-2 text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {prices.monthly === 0
                      ? "Free forever"
                      : `₱${prices.annual} / year (2 months free)`}
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {TIER_FEATURES[key].map((feature) => (
                      <li key={feature}>• {feature}</li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <Button disabled className="w-full">
                      Your current plan
                    </Button>
                  ) : key === "free" ? (
                    <Button
                      render={<Link href={session?.user ? "/properties" : "/register"} />}
                      className="w-full"
                    >
                      {session?.user ? "Go to dashboard" : "Start free"}
                    </Button>
                  ) : (
                    <Button disabled className="w-full">
                      Billing opens soon
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          Paid plans aren&apos;t billed yet — new accounts start on Free. We&apos;ll switch
          on GCash payments at launch; until then upgrades are handled manually. Your free
          data carries over.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
          Managing more than 100 units? A portfolio plan is on our roadmap — get in touch and
          we&apos;ll set you up.
        </p>
      </section>
    </div>
  );
}
