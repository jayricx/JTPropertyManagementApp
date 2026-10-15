import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { normalizePropertyFilter } from "@/lib/property-filter";
import {
  getReportData,
  normalizeMonths,
  toCsv,
  type ReportData,
} from "@/lib/reports";

const REPORT_NAMES = ["cashflow", "pnl", "occupancy"] as const;
type ReportName = (typeof REPORT_NAMES)[number];

interface CsvDocument {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}

function buildCsv(report: ReportName, data: ReportData): CsvDocument {
  const period = `last-${data.months}-months`;
  const money = (n: number) => n.toFixed(2);

  switch (report) {
    case "cashflow":
      return {
        filename: `cash-flow-${period}`,
        headers: ["Month", "Income (PHP)", "Expenses (PHP)", "Net (PHP)"],
        rows: [
          ...data.cashFlow.map((r) => [
            r.label,
            money(r.income),
            money(r.expenses),
            money(r.net),
          ]),
          [
            "Total",
            money(data.totals.income),
            money(data.totals.expenses),
            money(data.totals.net),
          ],
        ],
      };
    case "pnl":
      return {
        filename: `profit-and-loss-${period}`,
        headers: ["Property", "Income (PHP)", "Expenses (PHP)", "Net (PHP)"],
        rows: [
          ...data.pnl.map((r) => [
            r.label,
            money(r.income),
            money(r.expenses),
            money(r.net),
          ]),
          [
            "Total",
            money(data.totals.income),
            money(data.totals.expenses),
            money(data.totals.net),
          ],
        ],
      };
    case "occupancy":
      return {
        filename: `occupancy-${period}`,
        headers: [
          "Month",
          "Occupied units",
          "Total units",
          "Occupancy rate (%)",
        ],
        rows: [
          ...data.occupancy.map((r) => [
            r.label,
            r.occupied,
            r.total,
            r.rate,
          ]),
          ["Average", "", "", data.totals.avgOccupancy],
        ],
      };
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const report = searchParams.get("report") as ReportName | null;
  if (!report || !REPORT_NAMES.includes(report)) {
    return new Response(
      "Unknown report — use report=cashflow, report=pnl, or report=occupancy.",
      { status: 400 },
    );
  }

  const months = normalizeMonths(searchParams.get("months"));
  const propertyFilter = normalizePropertyFilter(searchParams.get("properties"));
  const data = await getReportData(session.user.id, months, propertyFilter);
  const doc = buildCsv(report, data);
  const today = new Date().toISOString().slice(0, 10);

  return new Response(toCsv(doc.headers, doc.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${doc.filename}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
