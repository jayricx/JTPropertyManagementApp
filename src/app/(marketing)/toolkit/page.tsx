import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  ClipboardList,
  DownloadIcon,
  FileSignature,
  Gauge,
  Zap,
} from "lucide-react";
import { ToolkitCta } from "@/components/marketing/toolkit-cta";

export const metadata: Metadata = {
  title: "Free landlord toolkit — templates and calculators for PH rentals",
  description:
    "Free, no-signup tools for Philippine landlords: a printable lease contract template, move-in and move-out checklists, a rent ledger spreadsheet, and instant rent, utility-split and late-fee calculators.",
};

interface ToolkitItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  kind: "Template" | "Calculator" | "Download";
  title: string;
  description: string;
}

const TEMPLATES: ToolkitItem[] = [
  {
    href: "/toolkit/templates/lease-contract",
    icon: FileSignature,
    kind: "Template",
    title: "Residential lease contract (PH)",
    description:
      "A plain-English, PH-ready lease you can print and sign: parties, rent and due date, deposits under the rent-control rules, utilities, sub-metering, late fees, and the termination clauses that actually protect you.",
  },
  {
    href: "/toolkit/templates/turnover-checklist",
    icon: ClipboardList,
    kind: "Template",
    title: "Move-out / turnover inspection checklist",
    description:
      "Walk the unit, tick the boxes, photograph everything. The document that decides how much of the security deposit you get to keep — and ends most deposit arguments before they start.",
  },
  {
    href: "/toolkit/templates/move-in-inventory",
    icon: ClipboardList,
    kind: "Template",
    title: "Move-in unit inventory form",
    description:
      "Every fixture and appliance with its condition on day one, signed by both of you. The single cheapest way to make deductions on move-out undisputable.",
  },
  {
    href: "/toolkit/rent-ledger.csv",
    icon: DownloadIcon,
    kind: "Download",
    title: "Rent ledger spreadsheet (.csv — opens in Excel)",
    description:
      "One row per payment: date, unit, tenant, method, reference number, amount, status. The record that settles disputes and keeps BIR season boring. Opens in Excel or Google Sheets.",
  },
];

const CALCULATORS: ToolkitItem[] = [
  {
    href: "/toolkit/calculators/prorated-rent",
    icon: CalendarClock,
    kind: "Calculator",
    title: "Prorated rent calculator",
    description:
      "Tenant moving in on the 18th? Figure the exact first-month amount — by the 30-day-month convention or the calendar-day method — in ten seconds.",
  },
  {
    href: "/toolkit/calculators/utility-split",
    icon: Zap,
    kind: "Calculator",
    title: "Utility split calculator",
    description:
      "Split one electric or water bill fairly: proportionally by units or occupants, or per-submeter with reading × rate arithmetic that matches what you file on statements.",
  },
  {
    href: "/toolkit/calculators/late-fee",
    icon: Gauge,
    kind: "Calculator",
    title: "Late fee & arrears calculator",
    description:
      "Set your grace period and penalty once, get the exact amount to post on the statement the day payment finally comes — plus the running total in arrears.",
  },
];

function ToolkitCard({ item }: { item: ToolkitItem }) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="group block rounded-lg border p-5 transition-colors hover:border-ring/50"
    >
      <div className="flex items-start gap-4">
        <item.icon className="mt-1 size-5 shrink-0 text-primary" />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {item.kind}
          </p>
          <h3 className="mt-1 font-semibold group-hover:underline">
            {item.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function ToolkitIndex() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Free tools</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Landlord toolkit for Philippine rentals
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Printable lease, checklists, a rent ledger, and the three calculations
        every small landlord asks about. Everything is free — no account, no
        email, no catch.
      </p>

      <h2 className="mt-12 text-xl font-semibold tracking-tight">
        Templates you can print and use today
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Each opens as a clean fill-in-the-blanks document — print it or save it
        as PDF from your browser (Ctrl/Cmd+P).
      </p>
      <div className="mt-6 space-y-4">
        {TEMPLATES.map((item) => (
          <ToolkitCard key={item.href} item={item} />
        ))}
      </div>

      <h2 className="mt-12 text-xl font-semibold tracking-tight">
        Instant calculators
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The money questions that come up mid-month — answered on the spot,
        computed the way statements do.
      </p>
      <div className="mt-6 space-y-4">
        {CALCULATORS.map((item) => (
          <ToolkitCard key={item.href} item={item} />
        ))}
      </div>

      <ToolkitCta
        headline="Renta-PH does all of this automatically"
        body="Same lease as a digitally signed version, the ledger kept in real time with statements per billing period, and sub-metered utility charges filed straight onto each tenant's account. Free for your first 5 units."
      />
    </div>
  );
}
