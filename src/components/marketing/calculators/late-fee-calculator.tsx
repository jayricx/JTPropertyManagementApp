"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The payment-date conversation in numbers: enter what the lease says
 * (grace period + penalty), and today's outstanding total gets computed —
 * the figure to write on the statement when rent finally arrives.
 */

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function atMidnight(iso: string): Date | null {
  return iso ? new Date(`${iso}T00:00:00`) : null;
}

export function LateFeeCalculator() {
  const [rent, setRent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [graceDays, setGraceDays] = useState("5");
  const [mode, setMode] = useState<"pct" | "flat">("pct");
  const [pctPerMonth, setPctPerMonth] = useState("5");
  const [flatPerDay, setFlatPerDay] = useState("");
  const [paidDate, setPaidDate] = useState("");

  const rentAmount = Number(rent) || 0;
  const grace = Math.max(0, Math.floor(Number(graceDays) || 0));

  const result = useMemo(() => {
    const due = atMidnight(dueDate);
    const paid = atMidnight(paidDate);
    if (!rentAmount || !due || !paid) return null;

    const DAY = 24 * 60 * 60 * 1000;
    const cutoff = new Date(due.getTime() + grace * DAY);
    if (paid <= cutoff) return { days: 0, fee: 0, cutoff, settled: true };

    // Late days run from the day after the grace cutoff through the payment
    // day; a full month overdue is the base of the percentage mode, prorated
    // daily (the "1/25th" clause convention on penalty % per month).
    const days = Math.ceil((paid.getTime() - cutoff.getTime()) / DAY);
    let fee = 0;
    if (mode === "pct") {
      const perDay = (rentAmount * ((Number(pctPerMonth) || 0) / 100)) / 25;
      fee = perDay * days;
    } else {
      fee = (Number(flatPerDay) || 0) * days;
    }
    return { days, fee, cutoff, settled: false };
  }, [rentAmount, dueDate, paidDate, grace, mode, pctPerMonth, flatPerDay]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rent">Monthly rent (₱)</Label>
          <Input id="rent" type="number" min="0" inputMode="decimal" placeholder="e.g. 12000" value={rent} onChange={(e) => setRent(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="due">Rent due date</Label>
          <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="grace">Grace period (days)</Label>
          <Input id="grace" type="number" min="0" inputMode="numeric" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paid">Payment received on</Label>
          <Input id="paid" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Penalty basis (per your lease)</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "pct" as const, label: "% of rent per month" },
                { value: "flat" as const, label: "Flat ₱ per day" },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  mode === opt.value
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {mode === "pct" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pct">Penalty % per month (₱ per month = rent × %)</Label>
            <Input id="pct" type="number" min="0" step="0.5" inputMode="decimal" value={pctPerMonth} onChange={(e) => setPctPerMonth(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              prorated daily at 1/25th of the monthly charge
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="flat">Penalty (₱ per day)</Label>
            <Input id="flat" type="number" min="0" step="0.5" inputMode="decimal" value={flatPerDay} onChange={(e) => setFlatPerDay(e.target.value)} />
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {!result ? (
            <p className="text-sm text-muted-foreground">
              Enter the rent, the due date and the actual payment date to see
              the arrears total.
            </p>
          ) : result.settled || result.days === 0 ? (
            <div className="text-sm">
              <p className="font-semibold text-green-700 dark:text-green-400">
                Within the grace period — no penalty
              </p>
              <p className="mt-1 text-muted-foreground">
                Grace runs until {result.cutoff.toLocaleDateString("en-PH", { day: "numeric", month: "long" })}.
                Amount due remains {peso(rentAmount)}.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total to post on the statement
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {peso(rentAmount + result.fee)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {peso(rentAmount)} rent + {peso(result.fee)} late fee ·{" "}
                  {result.days} late day{result.days === 1 ? "" : "s"} after the
                  grace cutoff ({result.cutoff.toLocaleDateString("en-PH", { day: "numeric", month: "long" })})
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Rents that stay unpaid get a formal demand: landlords who keep
                the statement numbers consistent have a much easier time
                legally — see the{" "}
                <Link
                  href="/learn/handle-unpaid-rent"
                  className="underline underline-offset-4"
                >
                  unpaid-rent playbook
                </Link>
                .
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
