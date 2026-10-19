import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Referring another landlord — Renta-PH.net",
  description:
    "Who benefits from property software, what to say in a landlord group, and what your referral code does and doesn't give you.",
};

export default function ReferALandlordGuide() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/guides"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        All guides
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
        Referring another landlord without sounding like a salesman
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Every account gets a share link and a code. This is about who to send it
        to, and what to actually say when you do.
      </p>

      <h2 className="mt-10 text-xl font-bold tracking-tight">
        Start with the honest test
      </h2>
      <p className="mt-3">
        Property software is not for everybody, and pretending otherwise is how
        you lose a friend. It pays off when a landlord is losing money or
        goodwill to admin, not when they are on top of it.
      </p>
      <p className="mt-3">It is worth a mention if they are:</p>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          chasing rent in a Messenger thread and losing track of who paid;
        </li>
        <li>
          splitting one electric bill among several tenants by hand, every
          month;
        </li>
        <li>
          running more than a couple of units and still tracking them in a
          spreadsheet;
        </li>
        <li>
          asking tenants for payment in a way that makes the conversation
          uncomfortable, every time.
        </li>
      </ul>
      <p className="mt-3">
        If they have one unit, pay on time and enjoy spreadsheets, leave them
        alone. This is not for everybody.
      </p>

      <h2 className="mt-10 text-xl font-bold tracking-tight">
        Say what it is, not what it isn&apos;t
      </h2>
      <p className="mt-3">
        The useful sentence is short and concrete:{" "}
        <em>
          &ldquo;I manage my units in an app that gives each tenant their own
          statement and sends me a GCash reference to check. No monthly fee for
          a couple of units.&rdquo;
        </em>
      </p>
      <p className="mt-3">
        Avoid &ldquo;revolutionary&rdquo; and avoid claiming it replaces things
        it doesn&apos;t. It doesn&apos;t do bookkeeping, tax filing, or screen
        tenants. Tenants are verified through an emailed code, not ID checks.
      </p>

      <h2 className="mt-10 text-xl font-bold tracking-tight">
        Post it once, and let the link do the rest
      </h2>
      <p className="mt-3">
        Your link and code are on the Referrals page of your dashboard. Paste
        the link, not a wall of text — anyone interested will click it, and
        anyone who isn&apos;t will scroll past.
      </p>
      <p className="mt-3">
        One honest note about what the code does and doesn&apos;t give you:
        {" "}
        <strong>it pays you nothing, and it doesn&apos;t discount them
        either.</strong> Referrals record who arrived. There is no commission
        and no reward on either side.
      </p>
      <p className="mt-3">
        That&apos;s still worth sending. You get to see which of your
        recommendations actually landed — and if someone you sent it to sets up
        and then asks you a question, you know what you&apos;re talking about.
      </p>

      <h2 className="mt-10 text-xl font-bold tracking-tight">
        What the person you refer can see
      </h2>
      <p className="mt-3">
        Worth knowing before you send it: the name, email, join date and plan of
        accounts that signed up with your link. Nothing else — not their
        properties, their tenants or their rent — and they can&apos;t email them.
        We tell them this on the sign-up page at the time.
      </p>

      <div className="mt-12 rounded-lg border bg-muted/30 p-6">
        <h2 className="text-base font-semibold">See your own link</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It&apos;s on the Referrals page of your dashboard, with a copy button
          and everyone who signed up through it.
        </p>
        <Link
          href="/register"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}