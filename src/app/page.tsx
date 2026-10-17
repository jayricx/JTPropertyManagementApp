import Link from "next/link";
import { Building2, Users, Wallet, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Building2,
    title: "Properties & units",
    description:
      "Register every property and track unit-level rent, occupancy, and details.",
  },
  {
    icon: Wallet,
    title: "Income tracking",
    description:
      "Record rent payments and expenses to see cash flow per property.",
  },
  {
    icon: Wrench,
    title: "Maintenance",
    description:
      "Track repair requests from new to resolved, with priorities and costs.",
  },
  {
    icon: Users,
    title: "Tenants & leases",
    description:
      "Manage lease dates, deposits, and get alerts before leases expire.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Property management for independent landlords
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Register your properties, monitor income, and stay on top of
          maintenance — all in one place.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/register">
            <Button size="lg">Create free account</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-primary hover:underline">
            See plans
          </Link>
        </div>
      </section>
      <section className="grid gap-6 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-lg border p-6"
          >
            <feature.icon className="h-6 w-6 text-primary" />
            <h2 className="mt-3 font-semibold">{feature.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
