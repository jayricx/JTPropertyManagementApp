import type { Metadata } from "next";
import { LateFeeCalculator } from "@/components/marketing/calculators/late-fee-calculator";
import { ToolkitCta } from "@/components/marketing/toolkit-cta";

export const metadata: Metadata = {
  title: "Late fee & arrears calculator — free for PH landlords",
  description:
    "Enter the lease's grace period and penalty, and get the exact amount to post on the statement when late rent finally arrives. Free, instant, no signup.",
};

export default function LateFeePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Free calculator</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Late fee &amp; arrears calculator
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The payment finally came. What&apos;s owed exactly — rent, how many
        late days, what penalty the lease allows? Post the whole figure once,
        with no frustration.
      </p>

      <div className="mt-10">
        <LateFeeCalculator />
      </div>

      <ToolkitCta
        headline="Statements that add it up before you ask"
        body="Renta-PH keeps every payment and charge against its billing period, so arrears is never a spreadsheet conversation — the rent tally says what's outstanding, always. Free for your first 5 units."
      />
    </div>
  );
}
