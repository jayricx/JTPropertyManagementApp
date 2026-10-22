import Link from "next/link";
import type { Metadata } from "next";
import {
  BadgeCheck,
  Building2,
  Calculator,
  FileSignature,
  Gift,
  Landmark,
  Receipt,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Renta-PH.net — Property management for Philippine landlords",
  description:
    "Collect rent by GCash or bank transfer, bill tenants their exact share of the electric bill, and keep your properties, tenants and leases in one place. Built in the Philippines, priced in pesos.",
};

const FEATURES = [
  {
    icon: Landmark,
    title: "GCash & bank transfer, verified",
    description:
      "Tenants pay from their own GCash or bank app and submit the reference. You confirm it against your history — with an optional photo of the receipt right beside it.",
  },
  {
    icon: Calculator,
    title: "Per-tenant utility statements",
    description:
      "One Meralco meter, many tenants? Sub-meter each unit and give every tenant a statement showing exactly their share of the electric and water bill.",
  },
  {
    icon: Receipt,
    title: "Statements, not spreadsheets",
    description:
      "Rent plus this month's readings plus any charges, minus what's been paid. Each tenant sees one number and knows what to send.",
  },
  {
    icon: Users,
    title: "A tenant portal that works",
    description:
      "Invited tenants sign in to see their lease, their balance and their statement, file maintenance issues with photos, and pay rent.",
  },
  {
    icon: Users,
    title: "Share with a co-owner",
    description:
      "Invite a family member or a property manager to a portfolio. They see the same properties and the same custom fields you do.",
  },
  {
    icon: Wrench,
    title: "Maintenance with photos",
    description:
      "Tenants report leaks and repairs from their phone with pictures attached, and you track each one to resolved.",
  },
  {
    icon: Wallet,
    title: "Cash flow you can export",
    description:
      "Income, expenses and per-property P&L over 3 to 24 months, with a CSV export that matches the screen exactly.",
  },
  {
    icon: FileSignature,
    title: "Signed leases",
    description:
      "Both parties sign on screen with a typed name or a drawn mark. Lease-end alerts go out before a term expires.",
  },
  {
    icon: Zap,
    title: "Custom fields",
    description:
      "Gate codes, parking slots, water tank levels — add the fields your buildings actually need, shared across your portfolio.",
  },
  {
    icon: Gift,
    title: "Know a landlord who needs this?",
    description:
      "Every account gets a share link and a code. Send it to a landlord you'd rather see set up properly, and you'll see who signed up with it — no cost, no catch.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* --------------------------------------------------------------- hero */}
      <section className="px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="size-3.5" />
            Built in the Philippines
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Property management for Filipino landlords
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Collect rent the way your tenants actually pay — GCash or bank
            transfer, with a reference number and a receipt photo you can check.
            Bill each tenant their exact share of the electric bill. Keep
            properties, tenants and leases in one place.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" render={<Link href="/register" />}>
              Start free — up to 5 units
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/pricing" />}>
              See plans from ₱199
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No credit card. No GCash merchant account needed — tenants pay you
            directly.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ problems */}
      <section className="border-y bg-muted/30 px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            The spreadsheet breaks at three points
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Almost every small landlord starts in a Google Sheet. It works
            right up until it doesn&apos;t.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  One meter, many tenants
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>
                  A single Meralco account covers twelve rooms. Someone has to
                  work out who owes what, every month, by hand — and then
                  explain it to a tenant who thinks it&apos;s unfair.
                </p>
                <p className="mt-3">
                  Renta-PH.net reads each sub-meter and issues the statement
                  automatically.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Chasing rent, every month
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>
                  Texting or messaging every tenant for rent, then wondering
                  who paid and who didn&apos;t, and which reference number belongs to
                  which unit.
                </p>
                <p className="mt-3">
                  Tenants pay from the portal, submit their reference and a
                  receipt photo, and you approve them in one queue.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Everything lives in your head
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>
                  Lease end dates, deposits, who still owes maintenance
                  repairs, and which unit a relative is staying in. If you&apos;re
                  managing a family building, this is usually a group chat.
                </p>
                <p className="mt-3">
                  Bring in a co-owner with one invite — they see the same
                  records you do.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Everything a small portfolio needs
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            No per-seat pricing, no module unlocks, and no plan is ever
            unlimited.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-lg border p-6">
                <feature.icon className="size-6 text-primary" />
                <h3 className="mt-3 font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- guide */}
      <section className="border-t bg-muted/30 px-6 py-14">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center md:flex-row md:text-left">
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">Free guide</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              How to split one electric bill among a dozen tenants
            </h2>
            <p className="mt-2 text-muted-foreground">
              The three methods landlords actually use, the arithmetic behind
              each, and the mistakes that cause arguments.
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/guides/split-utility-bill" />}
          >
            Read the guide
          </Button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Referrals                                                        */}
      {/* ---------------------------------------------------------------- */}
      {/* Kept honest on purpose: this records who sent whom. Nothing is
          earned and nothing is discounted, and saying otherwise here would be
          a claim the product doesn't honour. */}
      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 text-center md:flex-row md:text-left">
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">Referrals</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              Send it to one landlord you know
            </h2>
            <p className="mt-2 text-muted-foreground">
              Your account comes with a link and a code from the moment you
              sign up. Paste it into a landlord group, or send it to the cousin
              who keeps a spreadsheet of four units and calls it bookkeeping.
              You&apos;ll see who signed up with it.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              We don&apos;t pay commission and nobody gets a discount for
              signing up. It&apos;s a way of knowing which of your referrals
              actually landed, nothing more.
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/faq#referrals" />}
          >
            How referrals work
          </Button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- cta */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Building2 className="mx-auto size-8 text-primary" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight">
            Start with the building you already manage
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Free for up to 5 units. ₱199 a month for up to 12. Your data
            carries over if you upgrade.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" render={<Link href="/register" />}>
              Create free account
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/faq" />}>
              Read the FAQ
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}