import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/marketing/print-button";
import { ToolkitCta } from "@/components/marketing/toolkit-cta";

export const metadata: Metadata = {
  title: "Free move-out / turnover inspection checklist (PH rentals)",
  description:
    "A printable move-out inspection checklist for Philippine landlords: walk the room by room with the tenant, record condition, and settle the deposit without arguments. Free — no signup.",
};

/**
 * The move-out walkthrough on paper. Room-by-room condition rows with
 * boxes, both parties sign it, deductions get itemized on the back.
 * From the tenant's side this is the document that makes the deposit
 * refund feel earned instead of negotiated.
 */

const AREAS: { title: string; items: string[] }[] = [
  {
    title: "Living / dining",
    items: ["Floor / tiles", "Walls & paint", "Ceiling", "Lights", "Windows, grills & locks", "Door & lock"],
  },
  {
    title: "Kitchen",
    items: ["Counter & cabinets", "Sink & faucet", "Cooktop / range", "Exhaust fan", "Tiling", "Lights"],
  },
  {
    title: "Bedroom(s)",
    items: ["Floor / tiles", "Walls & paint", "Wardrobe / closet", "Aircon (condition & filters)", "Windows & grills", "Lights"],
  },
  {
    title: "Bathroom(s)",
    items: ["Toilet (flush / seat / lid)", "Shower & faucet", "Drainage", "Mirror & accessories", "Tiling", "Ventilation"],
  },
  {
    title: "Whole unit",
    items: ["Water meter reading:", "Electric meter reading:", "Keys returned (set of __)", "Furniture listed in inventory", "Wiring & outlets", "Gas / plumbing leaks"],
  },
];

function Check() {
  return <span className="print-box" aria-hidden />;
}

function Row({ label }: { label: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <Check />
      <span>
        {label} <span className="text-[12px] text-muted-foreground">(OK / damaged / missing)</span>
      </span>
    </li>
  );
}

export default function TurnoverChecklistTemplate() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="print:hidden">
        <p className="text-sm font-medium text-primary">Free tool</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Move-out / turnover inspection checklist
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Walk the unit with the tenant, tick what&apos;s wrong, photograph
          everything, both signatures at the end. It is the document that
          makes deposit deductions undisputable — print enough copies for
          both of you.
        </p>
        <div className="mt-6">
          <PrintButton />
        </div>
      </div>

      <article className="print-doc mt-10 rounded-xl border bg-card px-8 py-10 text-[15px]">
        <header className="pb-4">
          <h2 className="text-center text-lg font-bold uppercase">
            Move-out / Turnover Inspection Checklist
          </h2>
          <p className="mt-2 text-sm">Unit: <span className="print-blank inline-block w-72" /></p>
          <p className="text-sm">Tenant: <span className="print-blank inline-block w-72" /></p>
          <p className="text-sm">Lease term ended: <span className="print-blank inline-block w-40" />  Inspection date: <span className="print-blank inline-block w-40" /></p>
        </header>

        <p className="text-[13px]">
          Mark each item <strong>OK</strong> (same as move-in), <strong>R</strong> (needs repair),
          <strong> C</strong> (cleaning), or <strong> M</strong> (missing). Notes go in the
          itemization on page 2.
        </p>

        {AREAS.map((area) => (
          <section key={area.title} className="mt-5 break-inside-avoid">
            <h3 className="border-b border-foreground/40 pb-0.5 text-sm font-semibold uppercase tracking-wide">
              {area.title}
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {area.items.map((item) => (
                <Row key={item} label={item} />
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-6 break-inside-avoid">
          <h3 className="border-b border-foreground/40 pb-0.5 text-sm font-semibold uppercase tracking-wide">
            Itemized deductions (if any)
          </h3>
          {[1, 2, 3, 4].map((n) => (
            <p key={n} className="mt-3 text-sm">
              {n}. <span className="print-blank inline-block w-10/12" /> ₱ ________
            </p>
          ))}
          <p className="mt-3 text-sm font-semibold">
            Refundable deposit balance: ₱ __________ (of ₱ __________ deposit)
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Photos taken on this date are attached to this checklist. Deposit
            refund due within fourteen (14) days of turnover.
          </p>
        </section>

        <div className="mt-14 grid grid-cols-2 gap-10">
          <div>
            <div className="border-b border-foreground/60 pb-1"><span className="print-blank inline-block w-full" /></div>
            <p className="mt-1 text-xs">LESSEE — tenant turnover</p>
          </div>
          <div>
            <div className="border-b border-foreground/60 pb-1"><span className="print-blank inline-block w-full" /></div>
            <p className="mt-1 text-xs">LESSOR — inspection done by</p>
          </div>
        </div>
        <p className="mt-8 text-center text-xs">— End of checklist — · renta-ph.net</p>
      </article>

      <div className="print:hidden">
        <ToolkitCta
          headline="Deposit math, handled where the lease lives"
          body="Renta-PH keeps the move-in inventory, the deposit balance and the final utility billings against the lease, so the turnover amount isn't a scramble — it's already the number."
        />
        <p className="mt-6 text-sm text-muted-foreground">
          Start the file at{" "}
          <Link href="/toolkit/templates/move-in-inventory" className="underline underline-offset-4">
            move-in
          </Link>{" "}
          — this checklist references the same inventory.
        </p>
      </div>
    </div>
  );
}
