"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Prorated first-month rent. Two conventions exist in the wild; show both
 * and let the landlord pick per lease (state it in writing on the contract):
 * - 30-day month: rent ÷ 30 × days occupied (the common PH practice)
 * - Calendar-year: rent × 12 ÷ 365 × days occupied (exact share)
 */

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProratedRentCalculator() {
  const [rentText, setRentText] = useState("");
  const [startDate, setStartDate] = useState("");

  const { monthlyRent, start, daysOccupied, totalDays, by30, byYear } =
    useMemo(() => {
      const monthlyRent = Number(rentText) || 0;
      if (!startDate || !monthlyRent) {
        return { monthlyRent: 0, start: null as Date | null, daysOccupied: 0, totalDays: 30, by30: 0, byYear: 0 };
      }
      const start = new Date(`${startDate}T00:00:00`);
      const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      // Inclusive of the move-in day itself.
      const daysOccupied = lastDay - start.getDate() + 1;
      const by30 = (monthlyRent / 30) * daysOccupied;
      const byYear = ((monthlyRent * 12) / 365) * daysOccupied;
      return { monthlyRent, start, daysOccupied, totalDays: lastDay, by30, byYear };
    }, [rentText, startDate]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rent">Monthly rent (₱)</Label>
          <Input
            id="rent"
            type="number"
            min="0"
            inputMode="decimal"
            placeholder="e.g. 12000"
            value={rentText}
            onChange={(e) => setRentText(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start">Move-in date</Label>
          <Input
            id="start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {!monthlyRent || !start || daysOccupied <= 0 ? (
            <p className="text-sm text-muted-foreground">
              Enter a rent amount and a move-in date to see the prorated
              amounts.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                Moving in on day {start.getDate()} with {daysOccupied} of{" "}
                {totalDays} days remaining (inclusive of move-in day):
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    30-day month convention
                  </p>
                  <p className="mt-1 text-2xl font-bold">{peso(by30)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {peso(monthlyRent)} ÷ 30 × {daysOccupied} days
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Calendar-day method (rent × 12 ÷ 365)
                  </p>
                  <p className="mt-1 text-2xl font-bold">{peso(byYear)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {peso(monthlyRent)} × 12 ÷ 365 × {daysOccupied} days
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The 30-day convention is the PH practice most tenants expect;
                the calendar-day method is the exact share. Pick one, put it in
                writing in the lease, and use it for every move-in.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
