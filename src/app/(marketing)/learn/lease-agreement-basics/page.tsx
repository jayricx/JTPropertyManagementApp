import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "What every PH landlord needs in a lease agreement — Renta-PH.net",
  description:
    "The clauses that matter, the ones that don't, and the common mistakes that leave you unprotected — written for landlords managing 1 to 25 units.",
};

export default function LeaseAgreementBasicsArticle() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Article</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        What every PH landlord needs in a lease agreement
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        A verbal lease is legal in the Philippines. It&apos;s also nearly
        impossible to enforce. Here&apos;s what a written lease needs to include
        to actually protect you.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        The essentials (non-negotiable)
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>Parties.</strong> Full names and addresses of landlord and
          tenant. If the landlord is a business, the business name and
          representative.
        </li>
        <li>
          <strong>Property description.</strong> Address, unit number, and what
          is included (parking, storage, furniture).
        </li>
        <li>
          <strong>Rent amount and due date.</strong> State the exact amount in
          pesos, the due date (e.g., &quot;15th of each month&quot;), and the
          payment method (GCash, bank transfer, cash).
        </li>
        <li>
          <strong>Lease term.</strong> Start date, end date, and whether it
          auto-renews or requires a new agreement.
        </li>
        <li>
          <strong>Security deposit.</strong> Amount (typically 1-2 months&apos;
          rent), what it covers (unpaid rent, damages), and when it&apos;s
          returned (usually 30 days after move-out, minus deductions).
        </li>
        <li>
          <strong>Advance rent.</strong> How many months in advance (typically
          1-2 months), and whether it&apos;s applied to the last month or the
          first.
        </li>
      </ul>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Clauses that save you later
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>Late payment penalty.</strong> A small daily or monthly fee
          for late payment (e.g., 5% of rent per month). Without this, you
          have no leverage.
        </li>
        <li>
          <strong>Termination for non-payment.</strong> Specify how many days of
          unpaid rent triggers termination (e.g., 30 days). This is your legal
          basis for eviction.
        </li>
        <li>
          <strong>Utility responsibility.</strong> State who pays for
          electricity, water, and internet. If the tenant pays, specify how
          (direct account, sub-meter, or proportional split).
        </li>
        <li>
          <strong>Maintenance responsibility.</strong> Minor repairs (light
          bulbs, clogged drains) are usually the tenant&apos;s. Major repairs
          (roof, plumbing, electrical) are the landlord&apos;s. State this
          clearly.
        </li>
        <li>
          <strong>Subletting.</strong> Either allow it (with your written
          consent) or prohibit it outright. Silent subletting is a common
          problem.
        </li>
        <li>
          <strong>Entry rights.</strong> You need to enter the unit for
          repairs or inspections. Specify notice (e.g., 24 hours) and
          exceptions (emergencies).
        </li>
        <li>
          <strong>Move-out condition.</strong> The unit must be returned in the
          same condition (minus normal wear and tear). List what counts as
          damage vs. wear.
        </li>
      </ul>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Common mistakes
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>No written lease at all.</strong> Verbal agreements work until
          they don&apos;t. When a dispute arises, it&apos;s your word against
          theirs.
        </li>
        <li>
          <strong>Vague rent terms.</strong> &quot;Rent is ₱8,000&quot; without
          specifying due date, payment method, or late fees leads to arguments.
        </li>
        <li>
          <strong>No deposit clause.</strong> Without a written deposit clause,
          you can&apos;t legally deduct damages or unpaid rent from the deposit.
        </li>
        <li>
          <strong>Missing signatures.</strong> Both parties must sign. An
          unsigned lease is a draft, not a contract.
        </li>
        <li>
          <strong>Not keeping a copy.</strong> Each party gets an original. If
          you only have one copy and the tenant disputes it, you have no
          evidence.
        </li>
      </ul>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Rent Control Act (RA 9653)
      </h2>
      <p className="mt-4 text-muted-foreground">
        If your unit rents for ₱10,000/month or less, the Rent Control Act
        applies. Key provisions:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>Rent increases are capped at 7% per year (for units under ₱10,000).</li>
        <li>The landlord can only increase rent once per year.</li>
        <li>Eviction requires a court order — you can&apos;t just lock the tenant out.</li>
        <li>Advance rent is limited to 1 month and deposit to 2 months.</li>
      </ul>
      <p className="mt-4 text-muted-foreground">
        For units above ₱10,000/month, the Rent Control Act doesn&apos;t apply,
        and terms are governed by the Civil Code and your contract.
      </p>

      <div className="mt-12 rounded-lg border bg-muted/40 p-6">
        <h3 className="font-semibold">Try this in Renta-PH.net</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Generate a bilingual lease contract (English/Filipino) from your lease
          data, send it for digital signature, and track the signing status. Free
          for up to 5 units.
        </p>
        <Button className="mt-4" render={<Link href="/register" />}>
          Create a free account
        </Button>
      </div>

      <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Related:{" "}
        <Link href="/toolkit/templates/lease-contract" className="underline underline-offset-4">
          Free printable lease contract template
        </Link>
        {" · "}
        <Link href="/learn/handle-unpaid-rent" className="underline underline-offset-4">
          Handling unpaid rent
        </Link>
        {" · "}
        <Link href="/learn/collect-rent-gcash-full" className="underline underline-offset-4">
          Collecting rent by GCash
        </Link>
      </p>
    </article>
  );
}