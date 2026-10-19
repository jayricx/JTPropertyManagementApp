import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, Landmark } from "lucide-react";

export const metadata: Metadata = {
  title: "Guides — Renta-PH.net",
  description:
    "Practical guides for Philippine landlords: splitting utility bills, collecting rent by GCash, and running a small rental portfolio.",
};

const GUIDES = [
  {
    href: "/guides/split-utility-bill",
    icon: Calculator,
    title: "How to split one electric or water bill among your tenants",
    description:
      "Three methods, the arithmetic behind each, how to reconcile against the utility bill, and what to confirm with Meralco or Maynilad before you sub-meter.",
    minutes: 6,
  },
  {
    href: "/guides/collect-rent-gcash",
    icon: Landmark,
    title: "Collecting rent by GCash without chasing anyone",
    description:
      "What the reference number does and doesn't identify, why you don't need a merchant account, and how to keep submitted payments from counting as income before you verify them.",
    minutes: 5,
  },
];

export default function GuidesIndex() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Guides</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Landlord guides
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Written for Philippine landlords managing a handful of units — the
        parts of the job that don&apos;t fit neatly in a feature list.
      </p>

      <div className="mt-10 space-y-6">
        {GUIDES.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group block rounded-lg border p-6 transition-colors hover:border-ring/50"
          >
            <div className="flex items-start gap-4">
              <guide.icon className="mt-1 size-6 shrink-0 text-primary" />
              <div>
                <h2 className="font-semibold group-hover:underline">
                  {guide.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {guide.description}
                </p>
                <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                  {guide.minutes} min read
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Have a question the guides don&apos;t answer? Check the{" "}
        <Link href="/faq" className="underline underline-offset-4">
          FAQ
        </Link>
        .
      </p>
    </div>
  );
}