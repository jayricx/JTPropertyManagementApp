import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How to handle a tenant who won't pay rent — Renta-PH.net",
  description:
    "A step-by-step for Philippine landlords: from the first missed payment to eviction, including what the law says, what you can do, and what you shouldn't.",
};

export default function HandleUnpaidRentArticle() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Article</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        How to handle a tenant who won&apos;t pay rent
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Every landlord eventually faces it: a tenant who stops paying. How you
        handle the first missed payment determines whether this is a bump or a
        crisis. Here&apos;s a step-by-step for Philippine landlords.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Step 1: Don&apos;t panic, but don&apos;t wait
      </h2>
      <p className="mt-4 text-muted-foreground">
        A tenant who misses one payment isn&apos;t necessarily a bad tenant —
        they might have a cash-flow problem, a family emergency, or a
        misunderstanding about the due date. But silence is the enemy. The
        longer you wait to follow up, the harder it becomes to recover the money.
      </p>
      <p className="mt-4 text-muted-foreground">
        <strong>Day 1-3 after the due date:</strong> Send a friendly reminder.
        &quot;Hi, just a reminder that rent for this period is due. Let me know if
        there&apos;s an issue.&quot; Many tenants will pay immediately when nudged.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Step 2: Get it in writing
      </h2>
      <p className="mt-4 text-muted-foreground">
        If the first reminder doesn&apos;t work, escalate to a formal written
        notice. Text messages are fine, but keep screenshots. The key information:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>The amount owed (exact, including any late fees).</li>
        <li>The period it covers.</li>
        <li>A deadline to pay (e.g., 5 business days).</li>
        <li>What happens if they don&apos;t pay (termination of lease, legal action).</li>
      </ul>
      <p className="mt-4 text-muted-foreground">
        In the Philippines, a written demand letter is the first step in any
        eviction process. Even if you never go to court, having it documented
        protects you.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Step 3: Offer a payment plan (if appropriate)
      </h2>
      <p className="mt-4 text-muted-foreground">
        If the tenant is genuinely struggling (job loss, medical emergency), a
        payment plan can recover more than an eviction would. Consider:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>Splitting the arrears over 2-3 months.</li>
        <li>Reducing rent temporarily (with a written agreement on when it goes back up).</li>
        <li>Letting them move out early without penalty if they can&apos;t afford it.</li>
      </ul>
      <p className="mt-4 text-muted-foreground">
        Get everything in writing. A verbal agreement is worth nothing if it goes
        to court.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Step 4: Know your legal options
      </h2>
      <p className="mt-4 text-muted-foreground">
        Philippine law (Civil Code, and the Rent Control Act for covered units)
        gives landlords specific remedies:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>Lease termination.</strong> If the lease has a clause allowing
          termination for non-payment, you can terminate after the notice period.
        </li>
        <li>
          <strong>Ejectment (unlawful detainer).</strong> Filed in the
          Municipal Trial Court. Requires a written demand to vacate first. The
          process can take 3-6 months.
        </li>
        <li>
          <strong>Security deposit.</strong> You can apply the deposit against
          unpaid rent, but only after the tenant vacates. Don&apos;t deduct it
          while they&apos;re still in the unit.
        </li>
      </ul>
      <p className="mt-4 text-muted-foreground">
        <strong>What you can&apos;t do:</strong> lock the tenant out, cut
        utilities, or remove their belongings. These are illegal and can result
        in criminal charges against you.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Step 5: Protect yourself for next time
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>Require a deposit.</strong> One to two months&apos; rent is
          standard. It covers unpaid rent and damages.
        </li>
        <li>
          <strong>Put everything in writing.</strong> A verbal lease is legal in
          the Philippines but very hard to enforce. Use a written contract with
          clear terms on rent, due date, late fees, and termination.
        </li>
        <li>
          <strong>Screen tenants.</strong> Ask for employment details, references,
          and previous landlord contacts. A 10-minute call to a previous landlord
          saves months of trouble.
        </li>
        <li>
          <strong>Track payments digitally.</strong> If you can show a clear
          payment history (who paid, when, how much), you have evidence if it
          goes to court.
        </li>
      </ul>

      <div className="mt-12 rounded-lg border bg-muted/40 p-6">
        <h3 className="font-semibold">Try this in Renta-PH.net</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Track every payment, send automated rent reminders, and keep a
          complete statement of account per tenant — all exportable as evidence.
          Free for up to 5 units.
        </p>
        <Button className="mt-4" render={<Link href="/register" />}>
          Create a free account
        </Button>
      </div>

      <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Related:{" "}
        <Link href="/learn/collect-rent-gcash-full" className="underline underline-offset-4">
          Collecting rent by GCash
        </Link>
        {" · "}
        <Link href="/guides/split-utility-bill" className="underline underline-offset-4">
          Splitting utility bills
        </Link>
      </p>
    </article>
  );
}