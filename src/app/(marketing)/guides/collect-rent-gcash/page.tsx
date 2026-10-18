import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Collecting rent by GCash as a landlord in the Philippines",
  description:
    "Why chasing rent by GCash is slow, how the reference number actually works, what a receipt photo is for, and how to collect rent without a merchant account.",
};

export default function CollectRentGcashGuide() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Landlord guide</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Collecting rent by GCash without chasing anyone
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Rent in the Philippines is usually paid over GCash, and collecting it
        that way works — but the bookkeeping around it is manual, and it is the
        bookkeeping that eats your month-end. Here is what actually happens, and
        what to change.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Why it feels slower than it is
      </h2>
      <p className="mt-4 text-muted-foreground">
        The money transfer takes seconds. The part that takes time is what
        happens around it:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>Sending the same amount to every tenant, one at a time.</li>
        <li>Deciding how much each tenant owes once utilities are added in.</li>
        <li>
          Matching a reference number in your GCash history back to a unit —
          which is unreliable when a tenant pays two months at once, or when
          the number on the confirmation screen isn&apos;t the number in your
          history.
        </li>
        <li>Keeping a mental note of who already paid for October.</li>
      </ul>
      <p className="mt-4 text-muted-foreground">
        The reference number is the weak point. It identifies a transaction
        within GCash, not one specific payment to you — and a number copied by
        hand can be misread. That&apos;s why attaching a photo of the
        confirmation screen is worth doing: it shows the amount, the
        destination number, the date, and the reference, all at once.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        You do not need a merchant account
      </h2>
      <p className="mt-4 text-muted-foreground">
        A common misconception is that accepting rent digitally means signing
        up for a GCash merchant account or a payment gateway. It doesn&apos;t
        have to. The simplest arrangement — and the one most small landlords
        already use — is ordinary send-money:
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          Your tenants send money to your GCash wallet from their own app.
        </li>
        <li>They submit the reference number — and optionally a photo — to you.</li>
        <li>You check your GCash history and confirm the payment.</li>
      </ol>
      <p className="mt-4 text-muted-foreground">
        The money lands in your wallet directly. There is no gateway, no
        percentage cut, and no onboarding. What you gain from a system like
        Renta-PH is not a different payment rail — it&apos;s the record
        around it: who paid, for which unit, for which month, and who
        hasn&apos;t.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Bank transfers work the same way
      </h2>
      <p className="mt-4 text-muted-foreground">
        Some tenants prefer to pay from a bank account — often because they
        want the transaction reference on a statement they already check.
        InstaPay and a plain bank transfer behave the same way: the tenant sends
        the money, then submits the transaction reference and an optional photo.
      </p>
      <p className="mt-4 text-muted-foreground">
        Publish your account details (bank, account number, account name) in
        the tenant portal rather than in a group chat, so nobody is re-typing
        them — and so a transfer to the wrong account is at least traceable to
        the account your tenants were given.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Tell your tenant three things
      </h2>
      <p className="mt-4 text-muted-foreground">
        If your tenants submit references, make three instructions explicit,
        once, at move-in time:
      </p>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">
            The exact amount, including utilities.
          </strong>{" "}
          Rent alone is rarely what you expect to receive.
        </li>
        <li>
          <strong className="text-foreground">The destination.</strong> GCash
          number, or bank and account name — and not the account name of
          whichever relative happens to be at the bank.
        </li>
        <li>
          <strong className="text-foreground">
            A photo of the confirmation screen.
          </strong>{" "}
          It settles disputes in your favour, because you can see the amount
          they were actually charged.
        </li>
      </ol>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        What verification is actually for
      </h2>
      <p className="mt-4 text-muted-foreground">
        When a tenant says they paid, there are three possibilities: they did,
        they didn&apos;t, or they paid and mistyped the reference. Only you can
        tell by looking at your GCash or bank history.
      </p>
      <p className="mt-4 text-muted-foreground">
        This is why submitted payments should sit in a queue as{" "}
        <strong className="text-foreground">awaiting verification</strong>{" "}
        rather than counting as income immediately. A rent system that records
        money as received the moment a tenant types a number will eventually
        believe a payment that never happened. Renta-PH holds every
        submission — GCash or bank transfer — as pending until you confirm it
        against your own history, and only then counts it toward your balance
        and sends the receipt.
      </p>
      <p className="mt-4 text-muted-foreground">
        If you reject one, the tenant can resubmit it rather than losing the
        record, and it stays visible to you as rejected rather than vanishing.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button render={<Link href="/register" />}>
          Start free — up to 2 units
        </Button>
        <Button variant="outline" render={<Link href="/pricing" />}>
          See plans from ₱199
        </Button>
      </div>

      <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        Also worth reading:{" "}
        <Link
          href="/guides/split-utility-bill"
          className="underline underline-offset-4"
        >
          how to split one utility bill among a dozen tenants
        </Link>
        .
      </p>
    </article>
  );
}