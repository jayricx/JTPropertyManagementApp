"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPeriodMonth } from "@/lib/utils";
import { meterConsumptionUnits, type MeterType } from "@/lib/validations";
import {
  saveReadingsAction,
  type UtilityActionState,
} from "@/app/(dashboard)/properties/utility-actions";

export interface ReadingRow {
  meterId: string;
  unitName: string;
  tenantName: string | null;
  type: MeterType;
  label: string | null;
  /** Suggested rate for a new reading (₱ per consumption unit). */
  rate: string;
  /** Suggested previous reading (the last reading's, or 0). */
  previous: string;
  /** Existing current reading for this month, or "" when none yet. */
  current: string;
}

interface ReadingsFormProps {
  propertyId: string;
  month: string;
  rows: ReadingRow[];
  /** Recent months, newest first, for the month picker. */
  monthOptions: string[];
}

interface RowState {
  previous: string;
  current: string;
  rate: string;
}

export function ReadingsForm({
  propertyId,
  month,
  rows,
  monthOptions,
}: ReadingsFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    UtilityActionState,
    FormData
  >(saveReadingsAction, null);

  const [values, setValues] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    for (const row of rows) {
      initial[row.meterId] = {
        previous: row.previous,
        current: row.current,
        rate: row.rate,
      };
    }
    return initial;
  });

  function update(meterId: string, patch: Partial<RowState>) {
    setValues((prev) => ({
      ...prev,
      [meterId]: { ...prev[meterId], ...patch },
    }));
  }

  const computed = useMemo(() => {
    const map: Record<string, { consumption: number; amount: number } | null> =
      {};
    for (const row of rows) {
      const v = values[row.meterId];
      if (!v || v.current.trim() === "") {
        map[row.meterId] = null;
        continue;
      }
      const previous = Number(v.previous);
      const current = Number(v.current);
      const rate = Number(v.rate);
      if (
        !Number.isFinite(previous) ||
        !Number.isFinite(current) ||
        !Number.isFinite(rate) ||
        current < previous
      ) {
        map[row.meterId] = null;
        continue;
      }
      const consumption = current - previous;
      map[row.meterId] = {
        consumption,
        amount: Math.round(consumption * rate * 100) / 100,
      };
    }
    return map;
  }, [rows, values]);

  const total = useMemo(
    () =>
      Object.values(computed).reduce((sum, c) => sum + (c?.amount ?? 0), 0),
    [computed],
  );

  function onSubmit(formData: FormData) {
    for (const row of rows) {
      const v = values[row.meterId];
      if (!v) continue;
      formData.set(`prev_${row.meterId}`, v.previous);
      formData.set(`curr_${row.meterId}`, v.current);
      formData.set(`rate_${row.meterId}`, v.rate);
    }
    formAction(formData);
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        This property has no utility meters yet. Add an electric or water meter
        to a unit to start recording readings.
      </p>
    );
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="month" value={month} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <label
            htmlFor="reading-month"
            className="text-sm font-medium"
          >
            Billing month
          </label>
          <Select
            items={monthOptions.map((m) => ({
              value: m,
              label: formatPeriodMonth(m),
            }))}
            value={month}
            onValueChange={(value) =>
              router.push(`/properties/${propertyId}/readings?month=${value}`)
            }
          >
            <SelectTrigger id="reading-month" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatPeriodMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-right text-sm">
          <span className="text-muted-foreground">Statement utilities: </span>
          <span className="font-semibold">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Meter</TableHead>
              <TableHead className="w-32">Previous</TableHead>
              <TableHead className="w-32">Current</TableHead>
              <TableHead className="w-32">Rate (₱/unit)</TableHead>
              <TableHead className="text-right">Consumption</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const v = values[row.meterId];
              const calc = computed[row.meterId];
              return (
                <TableRow key={row.meterId}>
                  <TableCell className="font-medium">
                    <div>{row.unitName}</div>
                    {row.tenantName && (
                      <div className="text-xs text-muted-foreground">
                        {row.tenantName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      {row.type === "electric" ? "Electric" : "Water"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.label ?? `₱ per ${meterConsumptionUnits[row.type]}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={v?.previous ?? ""}
                      onChange={(e) =>
                        update(row.meterId, { previous: e.target.value })
                      }
                      aria-label={`Previous reading for ${row.unitName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      placeholder="—"
                      value={v?.current ?? ""}
                      onChange={(e) =>
                        update(row.meterId, { current: e.target.value })
                      }
                      aria-label={`Current reading for ${row.unitName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      min={0}
                      value={v?.rate ?? ""}
                      onChange={(e) =>
                        update(row.meterId, { rate: e.target.value })
                      }
                      aria-label={`Rate for ${row.unitName}`}
                    />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {calc
                      ? `${calc.consumption.toLocaleString("en-PH")} ${
                          meterConsumptionUnits[row.type]
                        }`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {calc ? formatCurrency(calc.amount) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-3">
        {state?.ok && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-4" />
            Readings saved
          </span>
        )}
        {state?.error && (
          <span className="text-sm font-medium text-destructive">
            {state.error}
          </span>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save readings"}
        </Button>
      </div>
    </form>
  );
}
