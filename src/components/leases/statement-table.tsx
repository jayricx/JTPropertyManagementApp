import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChargeDialog } from "@/components/leases/charge-dialog";
import { DeleteChargeButton } from "@/components/leases/delete-charge-button";
import { formatCurrency, formatPeriodMonth } from "@/lib/utils";
import {
  chargeTypeLabels,
  meterConsumptionUnits,
  type ChargeType,
} from "@/lib/validations";
import type { LeaseStatement } from "@/lib/statements";

interface StatementTableProps {
  statement: LeaseStatement;
  /** Landlords can add and remove manual charges; tenants get a read-only view. */
  canManage?: boolean;
  /** Selectable months for the add-charge dialog (defaults to the statement range). */
  monthOptions?: string[];
}

/**
 * A lease's monthly statement of account — rent + sub-metered utilities +
 * manual charges − payments, per month. Shared by the landlord's lease page
 * and the tenant portal so both sides read the exact same numbers.
 */
export function StatementTable({
  statement,
  canManage = false,
  monthOptions,
}: StatementTableProps) {
  const readings = statement.months.flatMap((m) =>
    m.utilityLines.map((line) => ({ periodMonth: m.periodMonth, line })),
  );
  const manualCharges = statement.months.flatMap((m) =>
    m.chargeLines.map((line) => ({ periodMonth: m.periodMonth, line })),
  );
  const defaultMonth =
    statement.currentMonth?.periodMonth ??
    statement.months[statement.months.length - 1]?.periodMonth ??
    "";
  const chargeMonths =
    monthOptions && monthOptions.length
      ? monthOptions
      : [...statement.months].reverse().map((m) => m.periodMonth);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Statement of account</CardTitle>
          <CardDescription>
            Rent, utilities, and other charges against payments recorded.
          </CardDescription>
        </div>
        {canManage && defaultMonth && (
          <ChargeDialog
            leaseId={statement.leaseId}
            defaultMonth={defaultMonth}
            monthOptions={chargeMonths}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-lg font-semibold">
              {formatCurrency(statement.outstanding)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total charged</p>
            <p className="mt-1 text-lg font-medium">
              {formatCurrency(statement.totalCharges)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total paid</p>
            <p className="mt-1 text-lg font-medium">
              {formatCurrency(statement.totalPaid)}
            </p>
          </div>
        </div>

        {statement.months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No statement months yet — the lease hasn&apos;t started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right">Electric</TableHead>
                  <TableHead className="text-right">Water</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">Total due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.months.map((m) => (
                  <TableRow key={m.periodMonth}>
                    <TableCell className="whitespace-nowrap">
                      {formatPeriodMonth(m.periodMonth)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(m.rent)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {m.electricity > 0 ? formatCurrency(m.electricity) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {m.water > 0 ? formatCurrency(m.water) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {m.otherCharges > 0
                        ? formatCurrency(m.otherCharges)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(m.chargesTotal)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {m.paid > 0 ? formatCurrency(m.paid) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        m.balance > 0 ? "" : "text-muted-foreground"
                      }`}
                    >
                      {m.paid > 0 || m.balance !== 0
                        ? formatCurrency(m.balance)
                        : formatCurrency(m.chargesTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {readings.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Meter readings</h3>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Meter</TableHead>
                    <TableHead className="text-right">Previous</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Consumption</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readings.map(({ periodMonth, line }) => (
                    <TableRow key={`${periodMonth}-${line.meterId}`}>
                      <TableCell className="whitespace-nowrap">
                        {formatPeriodMonth(periodMonth)}
                      </TableCell>
                      <TableCell>
                        {line.label ??
                          (line.type === "electric" ? "Electric" : "Water")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {line.previousReading.toLocaleString("en-PH")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {line.currentReading.toLocaleString("en-PH")}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.consumption.toLocaleString("en-PH")}{" "}
                        {meterConsumptionUnits[line.type]}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(line.rate, {
                          maximumFractionDigits: 4,
                        })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(line.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {manualCharges.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Other charges</h3>
            <ul className="divide-y rounded-lg border">
              {manualCharges.map(({ periodMonth, line }) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div>
                    <p className="text-sm">
                      {line.description ??
                        chargeTypeLabels[line.type as ChargeType]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {chargeTypeLabels[line.type as ChargeType]} ·{" "}
                      {formatPeriodMonth(periodMonth)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatCurrency(line.amount)}
                    </span>
                    {canManage && (
                      <DeleteChargeButton
                        chargeId={line.id}
                        leaseId={statement.leaseId}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
