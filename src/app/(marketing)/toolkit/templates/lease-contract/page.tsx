import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/marketing/print-button";
import { ToolkitCta } from "@/components/marketing/toolkit-cta";

export const metadata: Metadata = {
  title: "Free residential lease contract template (Philippines) — Renta-PH.net",
  description:
    "A printable, PH-ready residential lease agreement: rent, deposits, advance rent, utilities and sub-metering, late fees, termination and signature blocks. Free — print it or save as PDF.",
};

/**
 * The fill-in-blank lease, written to be printed straight from the browser
 * (Ctrl/Cmd+P). Clauses follow the checklist in the lease-agreement article:
 * the terms a PH small landlord actually needs, with the figures most
 * commonly used — placeholders everywhere the answer is theirs.
 *
 * All chrome (nav, footer, CTA, this intro) is print-hidden; only
 * .print-doc reaches paper. Underline-blanks keep it hand-fillable.
 */

function Blank({ width = "w-48" }: { width?: string }) {
  return <span className={`print-blank inline-block ${width}`} />;
}

export default function LeaseContractTemplate() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="print:hidden">
        <p className="text-sm font-medium text-primary">Free tool</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Residential lease contract template (Philippines)
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Everything below is your lease — print it, fill in the blanks, and
          both of you sign it. Uses the figures standard for small PH rentals
          (one month&apos;s deposit and advance, 5% monthly late cap, 30-day
          notice). Not legal advice — for complex setups, have a lawyer review it.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrintButton />
        </div>
      </div>

      <article className="print-doc mt-10 rounded-xl border bg-card px-8 py-10 text-[15px] leading-relaxed">
        <header className="pb-6 text-center">
          <h2 className="text-xl font-bold uppercase tracking-wide">
            Contract of Lease — Residential Unit
          </h2>
          <p className="mt-1 text-xs">
            Made and executed in ________________________, Philippines on
            this ____ day of ____________, 20____
          </p>
        </header>

        <p>
          <strong>Entered into by and between:</strong>
        </p>
        <p className="mt-2">
          <strong>LESSOR:</strong> <Blank width="w-64" />, of legal age,
          Filipino, residing at <Blank width="w-64" />
        </p>
        <p className="mt-2">
          <strong>LESSEE:</strong> <Blank width="w-64" />, of legal age,
          Filipino, residing at <Blank width="w-64" />
        </p>

        <p className="mt-6">
          The LESSOR agrees to lease unto the LESSEE and the LESSEE agrees to
          lease from the LESSOR the residential unit described below, under the
          following terms:
        </p>

        <p className="mt-5 font-semibold">1. Premises</p>
        <p>
          The unit located at <Blank width="w-72" /> (the
          &ldquo;Unit&rdquo;), together with fixtures as listed in the Move-in
          Unit Inventory attached and signed by both parties.
        </p>

        <p className="mt-5 font-semibold">2. Term</p>
        <p>
          For a period of <Blank width="w-20" /> months, starting ______ and
          ending ______. If the LESSEE continues occupying after expiry with the
          LESSOR&apos;s consent, the lease continues month-to-month on the same
          terms unless either party gives at least thirty (30) days&apos; prior
          written notice.
        </p>

        <p className="mt-5 font-semibold">3. Rent</p>
        <p>
          Monthly rent: <strong>PESOS: ______________________ (₱ _______ )</strong>,
          due on the ______ day of each month, payable in advance to the LESSOR
          via <Blank width="w-32" /> (GCash / bank transfer / cash), mobile
          number: <Blank width="w-40" />.
        </p>

        <p className="mt-5 font-semibold">4. Advance rent and security deposit</p>
        <p>
          Upon signing, the LESSEE shall pay: one (1) month advance rent of
          ₱ _______ , and a security deposit of ₱ _______ (one month&apos;s
          rent), which shall be held as guarantee for unpaid rent, utility
          charges and damages. The deposit shall be refunded within fourteen
          (14) days after move-out, less lawful deductions itemized in writing,
          with the final billings pending (e.g., unpaid utility charges up to
          the billed amount).
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Note: the prepaid advance applies to the last month of the lease.
        </p>

        <p className="mt-5 font-semibold">5. Utilities</p>
        <p>
          The LESSEE shall pay for utilities assignable to the Unit
          (electricity, water, internet) either by direct account in their name
          or by:
        </p>
        <p className="mt-2 pl-6">
          ( ) metered share based on a sub-meter reading × rate of ₱ ______ per
          kWh / m³, to be paid together with rent for the period covering the
          reading; or
        </p>
        <p className="pl-6">
          ( ) a proportional share of the master bill: ______ % of the total
          bill.
        </p>

        <p className="mt-5 font-semibold">6. Late payment</p>
        <p>
          Rent unpaid five (5) days after the due date incurs a late charge of
          five percent (5%) of the monthly rent per month of delay, prorated
          daily at 1/25th of that amount per day. Late charges appear on the
          period&apos;s statement of account.
        </p>

        <p className="mt-5 font-semibold">7. Use of the Unit</p>
        <p>
          Residential use only, for no more than ______ occupants. No illegal,
          hazardous or nuisance activity; no alteration, painting or
          renovation without prior written consent; no pets without written
          consent: <Blank width="w-16" /> (allowed / not allowed).
        </p>

        <p className="mt-5 font-semibold">8. Repairs and inspections</p>
        <p>
          Ordinary wear-and-tear repairs are for the LESSOR&apos;s account;
          repairs caused by the LESSEE&apos;s acts or neglect are for the
          LESSEE&apos;s account. The LESSEE shall report damage promptly. The
          LESSOR may inspect the Unit with reasonable prior notice to the
          LESSEE.
        </p>

        <p className="mt-5 font-semibold">9. Termination</p>
        <p>
          Either party may terminate on thirty (30) days&apos; written notice
          before the end of the term. The LESSOR may terminate for: unpaid rent
          persisting after final demand; repeated violation of these terms; or
          use of the Unit inconsistent with a residential lease.
        </p>

        <p className="mt-5 font-semibold">10. Move-out and turnover</p>
        <p>
          On the last day, the LESSEE shall return the Unit clean and in the
          condition reflected in the move-in inventory, normal wear excepted,
          together with all keys. A Move-out Inspection Checklist shall be
          signed by both parties at turnover.
        </p>

        <p className="mt-5 font-semibold">11. General</p>
        <p>
          This contract binds the parties, their heirs and assigns. Amendments
          must be in writing signed by both. This lease is governed by the laws
          of the Republic of the Philippines.
        </p>

        <div className="mt-12 grid grid-cols-2 gap-10">
          <div>
            <div className="border-b border-foreground/60 pb-1">
              <Blank width="w-full" />
            </div>
            <p className="mt-1 text-xs">LESSEE — signature over printed name</p>
          </div>
          <div>
            <div className="border-b border-foreground/60 pb-1">
              <Blank width="w-full" />
            </div>
            <p className="mt-1 text-xs">LESSOR — signature over printed name</p>
          </div>
        </div>

        <p className="mt-10 text-xs">
          Attached: Move-in Unit Inventory ( __ pages), Move-out Inspection
          Checklist ( __ pages)
        </p>
        <p className="mt-6 text-center print:text-black">
          — End of contract — · renta-ph.net
        </p>
      </article>

      <div className="print:hidden">
        <ToolkitCta
          headline="This contract, versioned and digitally signed"
          body="In Renta-PH, this same lease lives on the lease record: filled from the term you agreed, frozen when issued, signed in the browser by both of you, and re-issued as version 2 if terms change. Free for your first 5 units."
        />
        <p className="mt-6 text-sm text-muted-foreground">
          Pair it with the{" "}
          <Link
            href="/toolkit/templates/move-in-inventory"
            className="underline underline-offset-4"
          >
            move-in inventory form
          </Link>{" "}
          — the attachment referenced in clause 1 — and the{" "}
          <Link
            href="/toolkit/templates/turnover-checklist"
            className="underline underline-offset-4"
          >
            move-out checklist
          </Link>{" "}
          for clause 10. See also{" "}
          <Link
            href="/learn/lease-agreement-basics"
            className="underline underline-offset-4"
          >
            what every PH landlord needs in a lease agreement
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
