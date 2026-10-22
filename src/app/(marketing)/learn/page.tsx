import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpenIcon,
  Calculator,
  Gift,
  Landmark,
  ReceiptIcon,
  ScaleIcon,
  WrenchIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Learn — Renta-PH.net",
  description:
    "Practical guides and articles for Philippine landlords: rent collection, utility billing, lease agreements, tenant management, and property accounting.",
};

interface LearnItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  minutes: number;
  tag: "Guide" | "Article";
}

const LEARN_ITEMS: LearnItem[] = [
  {
    href: "/guides/collect-rent-gcash",
    icon: Landmark,
    title: "Collecting rent by GCash without chasing anyone",
    description:
      "What the reference number does and doesn't identify, why you don't need a merchant account, and how to keep submitted payments from counting as income before you verify them.",
    minutes: 5,
    tag: "Guide",
  },
  {
    href: "/guides/split-utility-bill",
    icon: Calculator,
    title: "How to split one electric or water bill among your tenants",
    description:
      "Three methods, the arithmetic behind each, how to reconcile against the utility bill, and what to confirm with Meralco or Maynilad before you sub-meter.",
    minutes: 6,
    tag: "Guide",
  },
  {
    href: "/guides/refer-a-landlord",
    icon: Gift,
    title: "Referring another landlord without sounding like a salesman",
    description:
      "Who actually benefits from property software, what to say in a landlord group, and why your referral code pays you nothing — and why that's still worth sending.",
    minutes: 4,
    tag: "Guide",
  },
  {
    href: "/learn/collect-rent-gcash-full",
    icon: Landmark,
    title: "How to collect rent by GCash (and actually track it)",
    description:
      "The full playbook: setting up your wallet, what to tell tenants, how to verify payments, and the common mistakes that cost landlords money.",
    minutes: 8,
    tag: "Article",
  },
  {
    href: "/learn/handle-unpaid-rent",
    icon: ScaleIcon,
    title: "How to handle a tenant who won't pay rent",
    description:
      "From the first missed payment to eviction: a step-by-step for Philippine landlords, including what the law says, what you can do, and what you shouldn't.",
    minutes: 10,
    tag: "Article",
  },
  {
    href: "/learn/lease-agreement-basics",
    icon: BookOpenIcon,
    title: "What every PH landlord needs in a lease agreement",
    description:
      "The clauses that matter, the ones that don't, and the common mistakes that leave you unprotected — written for landlords managing 1 to 25 units.",
    minutes: 7,
    tag: "Article",
  },
  {
    href: "/learn/landlord-income-tax",
    icon: ReceiptIcon,
    title: "Landlord income tax basics in the Philippines",
    description:
      "What counts as taxable income, what you can deduct, BIR forms you need, and how to keep records that survive an audit.",
    minutes: 9,
    tag: "Article",
  },
  {
    href: "/learn/maintenance-requests",
    icon: WrenchIcon,
    title: "Managing maintenance requests without the headaches",
    description:
      "How to triage, track, and resolve repairs — and how to keep tenants informed so small problems don't become big ones.",
    minutes: 5,
    tag: "Article",
  },
];

export default function LearnIndex() {
  const guides = LEARN_ITEMS.filter((i) => i.tag === "Guide");
  const articles = LEARN_ITEMS.filter((i) => i.tag === "Article");

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Learn</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Guides and articles for Philippine landlords
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Practical, PH-specific content on running a small rental portfolio —
        from collecting rent to handling tenants who won&apos;t pay. No fluff,
        no US advice that doesn&apos;t apply here.
      </p>

      <h2 className="mt-12 text-xl font-semibold tracking-tight">Guides</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Step-by-step walkthroughs tied to features in Renta-PH.net.
      </p>
      <div className="mt-6 space-y-4">
        {guides.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group block rounded-lg border p-5 transition-colors hover:border-ring/50"
          >
            <div className="flex items-start gap-4">
              <item.icon className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold group-hover:underline">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {item.minutes} min read
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-semibold tracking-tight">Articles</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Deeper reads on the parts of landlording that don&apos;t fit in a
        feature list.
      </p>
      <div className="mt-6 space-y-4">
        {articles.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group block rounded-lg border p-5 transition-colors hover:border-ring/50"
          >
            <div className="flex items-start gap-4">
              <item.icon className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold group-hover:underline">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {item.minutes} min read · Article
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Have a question these don&apos;t answer? Check the{" "}
        <Link href="/faq" className="underline underline-offset-4">
          FAQ
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="underline underline-offset-4">
          get in touch
        </Link>
        .
      </p>
    </div>
  );
}