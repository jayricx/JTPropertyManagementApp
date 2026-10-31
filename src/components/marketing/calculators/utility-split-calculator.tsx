"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Splits one electric or water bill two ways:
 * - Proportional: the bill divided by units or by occupants — the method for
 *   landlords who pay the master account directly.
 * - Sub-meter: previous reading × current reading against a ₱/unit rate —
 *   the arithmetic that should match what gets filed on statements.
 */

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function UtilitySplitCalculator() {
  // Proportional
  const [bill, setBill] = useState("");
  const [units, setUnits] = useState("4");
  const [occupantsPerUnit, setOccupantsPerUnit] = useState("");

  // Sub-meter
  const [prev, setPrev] = useState("");
  const [cur, setCur] = useState("");
  const [rate, setRate] = useState("");

  const billAmount = num(bill);
  const unitCount = Math.max(1, Math.floor(num(units)));
  const occ = occupantsPerUnit.trim();
  // Occupant-weighted shares only make sense when weights sum to something.
  const occList = occ
    .split(",")
    .map((s) => Math.max(0, Math.floor(Number(s.trim()) || 0)));
  const occTotal = occList.reduce((a, b) => a + b, 0);

  const consumption = Math.max(0, num(cur) - num(prev));
  const meterRate = num(rate);
  const meterAmount = consumption * meterRate;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold">Shared master bill — proportional</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You pay Meralco/Maynilad directly, tenants reimburse.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bill">Total bill (₱)</Label>
              <Input id="bill" type="number" min="0" inputMode="decimal" placeholder="e.g. 18500" value={bill} onChange={(e) => setBill(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="units">Number of units</Label>
              <Input id="units" type="number" min="1" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="occupants">
                Occupants per unit (optional — e.g. <span className="font-mono">2,1,3,2</span>)
              </Label>
              <Input id="occupants" placeholder="leave empty for equal split" value={occupantsPerUnit} onChange={(e) => setOccupantsPerUnit(e.target.value)} />
            </div>
          </div>

          {billAmount > 0 && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Equal split per unit</p>
                <p className="mt-1 text-2xl font-bold">{peso(billAmount / unitCount)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {peso(billAmount)} ÷ {unitCount} units
                </p>
              </div>
              {occTotal > 0 && (
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Occupant-weighted {occList.map((_, i) => `Unit ${i + 1}`).join(" · ")}
                  </p>
                  <p className="mt-2 space-x-3">
                    {occList.map((n, i) => (
                      <span key={i} className="font-semibold">
                        U{i + 1}: {peso((billAmount * n) / occTotal)}
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {occTotal} occupants total — bill shared by headcount
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold">Sub-metered unit</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A sub-meter on the unit: (current − previous) × ₱ per kWh/m³. Keep
            the reading photo and file the charge on the period&apos;s statement.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="prev">Previous reading</Label>
              <Input id="prev" type="number" min="0" inputMode="decimal" value={prev} onChange={(e) => setPrev(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cur">Current reading</Label>
              <Input id="cur" type="number" min="0" inputMode="decimal" value={cur} onChange={(e) => setCur(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">Rate (₱ per kWh or m³)</Label>
              <Input id="rate" type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 12.50" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>

          {consumption > 0 && meterRate > 0 && (
            <div className="mt-4 rounded-lg border p-4 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount to charge this unit</p>
              <p className="mt-1 text-2xl font-bold">{peso(meterAmount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {cur} − {prev} = {consumption.toLocaleString("en-PH")} units × {peso(meterRate)}
              </p>
            </div>
          )}
          {num(cur) > 0 && num(cur) < num(prev) && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              Current reading is lower than the previous one — check for a
              mis-tap or a meter replacement before using these numbers.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
