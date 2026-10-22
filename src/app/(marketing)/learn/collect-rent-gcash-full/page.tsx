import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How to collect rent by GCash (and actually track it) — Renta-PH.net",
  description:
    "The full playbook for Philippine landlords: setting up your wallet, what to tell tenants, how to verify payments, and the common mistakes that cost landlords money.",
};

export default function CollectRentGcashFullArticle() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Article</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        How to collect rent by GCash (and actually track it)
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        GCash is how most Filipino tenants already move money. The problem isn&apos;t
        collecting it — it&apos;s knowing which payment is for which unit, whether
        it actually arrived, and whether you counted it twice. This guide covers
        the whole flow, from setup to verification.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        1. You don&apos;t need a merchant account
      </h2>
      <p className="mt-4 text-muted-foreground">
        A common misconception is that you need a GCash business account to
        receive rent. You don&apos;t. A personal GCash wallet works fine — tenants
        send money via &quot;Send Money&quot; to your registered mobile number,
        and you verify it against your own GCash transaction history.
      </p>
      <p className="mt-4 text-muted-foreground">
        The trade-off: personal wallets have daily receive limits (currently
        ₱100,000 for verified accounts). If a single month&apos;s rent roll exceeds
        that, split collections across days or use bank transfer for the larger
        amounts.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        2. What to tell your tenants
      </h2>
      <p className="mt-4 text-muted-foreground">
        Give tenants three things, in writing (a text message or a printed slip):
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>Your GCash number and registered name.</strong> Tenants need
          both — the name is how they confirm they&apos;re sending to the right
          person.
        </li>
        <li>
          <strong>The exact amount.</strong> Don&apos;t say &quot;around ₱8,000.&quot;
          Say &quot;₱8,500.00.&quot; Exact amounts make matching trivial.
        </li>
        <li>
          <strong>How to submit proof.</strong> Tell them to screenshot the
          GCash confirmation and send it to you — or, if you use Renta-PH.net,
          to submit the reference number through their tenant portal.
        </li>
      </ol>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        3. The reference number is your anchor
      </h2>
      <p className="mt-4 text-muted-foreground">
        Every GCash transfer generates a reference number (a 13-digit string
        starting with a date). This is the single most important piece of
        information for verification. Ask tenants to send it immediately after
        paying — not the screenshot, not the amount, the reference number.
      </p>
      <p className="mt-4 text-muted-foreground">
        A screenshot can be faked. A reference number can be checked against
        your own GCash history in seconds.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        4. Verifying payments (the part most landlords skip)
      </h2>
      <p className="mt-4 text-muted-foreground">
        The biggest mistake landlords make: counting a payment as income before
        verifying it. A tenant says &quot;I sent it&quot; — you mark it paid — but
        the money never arrived (wrong number, failed transfer, or worse, a
        fake screenshot).
      </p>
      <p className="mt-4 text-muted-foreground">The correct flow:</p>
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-muted-foreground">
        <li>Tenant submits a reference number through the portal (or texts it to you).</li>
        <li>It appears as &quot;Pending&quot; in your finance ledger.</li>
        <li>You open your GCash app and search for that reference number.</li>
        <li>If it matches — amount, sender, date — click &quot;Verify.&quot;</li>
        <li>If it doesn&apos;t match, click &quot;Reject&quot; and ask the tenant to re-send.</li>
      </ol>
      <p className="mt-4 text-muted-foreground">
        Until you verify, the payment doesn&apos;t count as income and doesn&apos;t
        reduce the tenant&apos;s balance. This is intentional — it prevents
        ghost income.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        5. Common mistakes
      </h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
        <li>
          <strong>Counting a screenshot as proof.</strong> Screenshots are
          trivially faked. Always verify against your own transaction history.
        </li>
        <li>
          <strong>Not matching the exact amount.</strong> If rent is ₱8,500 and
          the tenant sends ₱8,000, that&apos;s a partial payment — not a full one.
          Record it as partial and follow up.
        </li>
        <li>
          <strong>Losing reference numbers.</strong> If a tenant texts you the
          ref number and you don&apos;t write it down, you can&apos;t match it later.
          Use a system that stores them.
        </li>
        <li>
          <strong>Not sending reminders.</strong> Tenants forget. A reminder
          3 days before the due date (automated or manual) cuts late payments
          significantly.
        </li>
      </ul>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        6. Bank transfer works the same way
      </h2>
      <p className="mt-4 text-muted-foreground">
        If you prefer bank transfer, the flow is identical: tenant sends money
        to your account, submits the reference/transaction number, you verify
        against your bank statement. The only difference is that bank transfers
        are usually slower (1-2 business days) and have higher minimums.
      </p>
      <p className="mt-4 text-muted-foreground">
        Most landlords offer both — GCash for speed, bank transfer for larger
        amounts. Renta-PH.net supports both and lets tenants pick their method
        on the pay-rent page.
      </p>

      <div className="mt-12 rounded-lg border bg-muted/40 p-6">
        <h3 className="font-semibold">Try this in Renta-PH.net</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Record payments, verify tenant submissions, and generate statements —
          all in one place. Free for up to 5 units.
        </p>
        <Button className="mt-4" render={<Link href="/register" />}>
          Create a free account
        </Button>
      </div>

      <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Related:{" "}
        <Link href="/guides/collect-rent-gcash" className="underline underline-offset-4">
          Collecting rent by GCash (shorter guide)
        </Link>
        {" · "}
        <Link href="/guides/split-utility-bill" className="underline underline-offset-4">
          Splitting utility bills
        </Link>
      </p>
    </article>
  );
}