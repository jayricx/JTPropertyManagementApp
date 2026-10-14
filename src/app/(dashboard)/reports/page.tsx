import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportPropertyFilter } from "@/components/reports/report-property-filter";
import { listAccessibleProperties } from "@/lib/access";
import {
  getReportData,
  normalizeMonths,
  normalizePropertyFilter,
  REPORT_MONTH_OPTIONS,
} from "@/lib/reports";
import { cn, formatCurrency } from "@/lib/utils";

interface ReportsPageProps {
  searchParams: Promise<{ months?: string; properties?: string }>;
}

function CsvButton({
  report,
  months,
  properties,
}: {
  report: string;
  months: number;
  properties: string[] | null;
}) {
  const params = new URLSearchParams({ report, months: String(months) });
  if (properties?.length) params.set("properties", properties.join(","));
  return (
    <Button
      variant="outline"
      size="sm"
      render={<a href={`/api/reports/csv?${params.toString()}`} download />}
    >
      <DownloadIcon />
      CSV
    </Button>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { months: monthsRaw, properties: propertiesRaw } = await searchParams;
  const months = normalizeMonths(monthsRaw);
  const requestedIds = normalizePropertyFilter(propertiesRaw);

  const session = await auth();
  const userId = session?.user?.id;
  // The dashboard layout redirects unauthenticated visitors.
  if (!userId) return null;

  // Options come first so the requested ids can be sanitized before the
  // report runs — labels, CSV links, and data then agree on one filter.
  const options = await listAccessibleProperties(userId);
  const optionIds = new Set(options.map((o) => o.id));
  const usable = requestedIds?.filter((id) => optionIds.has(id)) ?? null;
  // All-or-none is equivalent to no filter — keep the URL canonical.
  const propertyFilter =
    usable && usable.length > 0 && usable.length < options.length
      ? usable
      : null;

  const data = await getReportData(userId, months, propertyFilter);
  const { cashFlow, pnl, occupancy, totals } = data;

  // Period links keep the active property filter (and vice versa).
  const reportHref = (m: number) => {
    const params = new URLSearchParams();
    params.set("months", String(m));
    if (propertyFilter?.length) params.set("properties", propertyFilter.join(","));
    return `/reports?${params.toString()}`;
  };

  const flowMax = Math.max(
    1,
    ...cashFlow.map((r) => Math.max(r.income, r.expenses)),
  );
  // Keep chart labels readable: at most one label per ~column bucket.
  const labelEvery = Math.max(1, Math.ceil(months / 12));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Cash flow, profitability, and occupancy across your portfolio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ReportPropertyFilter
            options={options}
            selected={propertyFilter}
            months={months}
          />
          <div
            role="group"
            aria-label="Report period"
            className="flex rounded-lg border p-1"
          >
            {REPORT_MONTH_OPTIONS.map((m) => (
              <Link
                key={m}
                href={reportHref(m)}
                aria-current={m === months ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  m === months
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}M
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Cash flow                                                        */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Cash flow</CardTitle>
            <CardDescription>
              Income vs. expenses per month · net{" "}
              <span
                className={cn(
                  "font-medium",
                  totals.net < 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {formatCurrency(totals.net)}
              </span>{" "}
              over the last {months} months
            </CardDescription>
          </div>
          <CsvButton
            report="cashflow"
            months={months}
            properties={propertyFilter}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            {/* CSS bar chart — no chart library needed; the table below is
                the accessible source of truth for exact values. */}
            <div
              aria-hidden="true"
              className="flex h-44 items-end gap-1.5 border-b"
            >
              {cashFlow.map((r) => (
                <div
                  key={r.key}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
                >
                  <div className="flex h-full w-full items-end justify-center gap-px">
                    <div
                      className="w-1/2 rounded-t-sm bg-emerald-500"
                      style={{
                        height:
                          r.income > 0
                            ? `${Math.max(2, (r.income / flowMax) * 100)}%`
                            : 0,
                      }}
                    />
                    <div
                      className="w-1/2 rounded-t-sm bg-red-400"
                      style={{
                        height:
                          r.expenses > 0
                            ? `${Math.max(2, (r.expenses / flowMax) * 100)}%`
                            : 0,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="flex gap-1.5 pt-1"
            >
              {cashFlow.map((r, i) => (
                <div
                  key={r.key}
                  className="flex-1 text-center text-[10px] text-muted-foreground"
                >
                  {i % labelEvery === 0 ? r.shortLabel : ""}
                </div>
              ))}
            </div>
            <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                Expenses
              </span>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...cashFlow].reverse().map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(r.income)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(r.expenses)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      r.net < 0 && "text-destructive",
                    )}
                  >
                    {formatCurrency(r.net)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(totals.income)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(totals.expenses)}
                </TableCell>
                <TableCell
                  className={cn("text-right", totals.net < 0 && "text-destructive")}
                >
                  {formatCurrency(totals.net)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Profit & loss by property                                        */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Profit &amp; loss by property</CardTitle>
            <CardDescription>
              Income and expenses per property over the last {months} months.
            </CardDescription>
          </div>
          <CsvButton report="pnl" months={months} properties={propertyFilter} />
        </CardHeader>
        <CardContent>
          {pnl.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No income or expenses recorded in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnl.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.income)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.expenses)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right", r.net < 0 && "text-destructive")}
                    >
                      {formatCurrency(r.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals.income)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totals.expenses)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right",
                      totals.net < 0 && "text-destructive",
                    )}
                  >
                    {formatCurrency(totals.net)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Occupancy history                                                */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Occupancy history</CardTitle>
            <CardDescription>
              Units with a lease at some point each month · average{" "}
              <span className="font-medium text-foreground">
                {totals.avgOccupancy}%
              </span>{" "}
              over the last {months} months
            </CardDescription>
          </div>
          <CsvButton
            report="occupancy"
            months={months}
            properties={propertyFilter}
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Occupied</TableHead>
                <TableHead className="text-right">Total units</TableHead>
                <TableHead>Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...occupancy].reverse().map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right">
                    {r.total > 0 ? `${r.occupied} / ${r.total}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.total > 0 ? r.total : "—"}
                  </TableCell>
                  <TableCell>
                    {r.total > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${r.rate}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {r.rate}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Average</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell>{totals.avgOccupancy}%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
