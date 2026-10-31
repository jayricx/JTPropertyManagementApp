import type { Metadata } from "next";
import { ProratedRentCalculator } from "@/components/marketing/calculators/prorated-rent-calculator";
import { ToolkitCta } from "@/components/marketing/toolkit-cta";

export const metadata: Metadata = {
  title: "Prorated rent calculator — free for PH landlords",
  description:
    "Figure the exact first-month rent for a mid-month move-in, by the 30-day-month convention or the calendar-day method. Free, instant, no signup.",
};

export default function ProratedRentPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Free calculator</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Prorated rent calculator
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        A tenant moving in on the 18th doesn&apos;t owe the full month, or
        nothing — they owe the days they actually stay. This computes that
        number two ways.
      </p>

      <div className="mt-10">
        <ProratedRentCalculator />
      </div>

      <ToolkitCta
        headline="In Renta-PH, the proration is automatic"
        body="Create the lease with its actual move-in date and the first billing period is computed from that day — the statement, the reminders and the calendar all follow, with no arithmetic on your part. Free for your first 5 units."
      />
    </div>
  );
}
