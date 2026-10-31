import type { Metadata } from "next";
import { UtilitySplitCalculator } from "@/components/marketing/calculators/utility-split-calculator";
import { ToolkitCta } from "@/components/marketing/toolkit-cta";

export const metadata: Metadata = {
  title: "Utility split calculator — free for PH landlords",
  description:
    "Split one electric or water bill fairly across tenants: proportionally by units or occupants, or per sub-meter with reading × rate arithmetic. Free, instant, no signup.",
};

export default function UtilitySplitPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Free calculator</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Utility split calculator
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The &ldquo;papano sa kuryente?&rdquo; question: whether the master
        account is in your name or there are sub-meters on the units, here is
        the fair figure for each tenant.
      </p>

      <div className="mt-10">
        <UtilitySplitCalculator />
      </div>

      <ToolkitCta
        headline="Renta-PH files the split on the tenant's statement for you"
        body="Enter meter readings or the manual share, and the charge lands on the right billing period of the right lease — statement, portal and arithmetic handled. Free for your first 5 units."
      />
    </div>
  );
}
