import type { Metadata } from "next";
import { PrintButton } from "@/components/marketing/print-button";
import { ToolkitCta } from "@/components/marketing/toolkit-cta";

export const metadata: Metadata = {
  title: "Free move-in unit inventory form (PH rentals)",
  description:
    "A printable move-in unit inventory: every fixture and appliance with its condition on day one, meter readings and both signatures. The record that makes turnover deductions undisputable.",
};

/**
 * Day-one condition record. The point is the signature line: whatever is
 * marked OK today is what the tenant acknowledged receiving. Later, the
 * move-out checklist reads against this same list.
 */

const FIXTURES: { title: string; items: string[] }[] = [
  {
    title: "Structure & fit-out",
    items: ["Floor (tiles / vinyl / parquet)", "Walls & paint", "Ceiling", "Windows & grills", "Doors & locks", "Kitchen counter & cabinets"],
  },
  {
    title: "Kitchen",
    items: ["Stove / cooktop", "Range hood / exhaust", "Sink & faucet", "Water dispenser", "Microwave", "Refrigerator brand + condition"],
  },
  {
    title: "Bedroom & living",
    items: ["Bed / bed frame", "Wardrobe", "Aircon brand + filters", "Electric fan", "Sofa", "Dining set"],
  },
  {
    title: "Bathroom",
    items: ["Toilet & flush", "Shower head & faucet", "Lavatory", "Mirror", "Storage rack", "Water heater"],
  },
  {
    title: "Utilities & meters",
    items: ["Electric meter reading:", "Water meter reading:", "Electricity account in whose name:", "Water account in whose name:", "Internet provider / modem in unit:", "Tested working: outlets / lights / flushing / drainage"],
  },
];

function Row({ label }: { label: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="print-box" aria-hidden />
      <span>
        {label} <span className="text-[12px] text-muted-foreground">(new — very good — good — for repair —)</span>
      </span>
    </li>
  );
}

export default function MoveInInventoryTemplate() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="print:hidden">
        <p className="text-sm font-medium text-primary">Free tool</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Move-in unit inventory form
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          For each fixture, mark its condition on day one and both parties
          sign. Twenty minutes at move-in that removes 90% of the arguing at
          move-out.
        </p>
        <div className="mt-6">
          <PrintButton />
        </div>
      </div>

      <article className="print-doc mt-10 rounded-xl border bg-card px-8 py-10 text-[15px]">
        <header className="pb-4">
          <h2 className="text-center text-lg font-bold uppercase">
            Move-in Unit Inventory
          </h2>
          <p className="mt-2 text-sm">Unit: <span className="print-blank inline-block w-72" /></p>
          <p className="text-sm">Tenant: <span className="print-blank inline-block w-72" /></p>
          <p className="text-sm">Lease start: <span className="print-blank inline-block w-40" />  Completed on: <span className="print-blank inline-block w-40" /></p>
        </header>

        <p className="text-[13px]">
          Rate each item: <strong>N</strong> / <strong>VG</strong> / <strong>G</strong> / <strong>FR</strong> (for repair) / <strong>M</strong> (missing).
          Everything not listed is assumed NOT included in the lease unless written in below.
        </p>

        {FIXTURES.map((section) => (
          <section key={section.title} className="mt-5 break-inside-avoid">
            <h3 className="border-b border-foreground/40 pb-0.5 text-sm font-semibold uppercase tracking-wide">
              {section.title}
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {section.items.map((item) => (
                <Row key={item} label={item} />
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-6 break-inside-avoid">
          <p className="border-b border-foreground/40 pb-0.5 text-sm font-semibold uppercase tracking-wide">
            Additional items / furniture / exceptions
          </p>
          {[1, 2, 3, 4].map((n) => (
            <p key={n} className="mt-3 text-sm">
              {n}. <span className="print-blank inline-block w-10/12" />
            </p>
          ))}
        </section>

        <div className="mt-14 grid grid-cols-2 gap-10">
          <div>
            <div className="border-b border-foreground/60 pb-1"><span className="print-blank inline-block w-full" /></div>
            <p className="mt-1 text-xs">LESSEE</p>
          </div>
          <div>
            <div className="border-b border-foreground/60 pb-1"><span className="print-blank inline-block w-full" /></div>
            <p className="mt-1 text-xs">LESSOR</p>
          </div>
        </div>
        <p className="mt-8 text-center text-xs">— End of inventory — · renta-ph.net</p>
      </article>

      <div className="print:hidden">
        <ToolkitCta
          headline="Attachments, not paperwork"
          body="In Renta-PH, this inventory is an attachment to the lease record rather than a lost photocopy — kept with the lease it belongs to, where the move-out conversation will find it."
        />
      </div>
    </div>
  );
}
