import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How to split a utility bill among tenants in the Philippines",
  description:
    "Three ways to divide one Meralco or Maynilad bill across the tenants in a boarding house or rental building — with the arithmetic, the fairness rules, and what you must check with your utility.",
};

const FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      name: "Can I add tenants' names to my Meralco bill?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Consolidating meters under fictitious or additional names on a single account is not allowed — the account holder is responsible for the whole bill, and adding names creates liability without reducing it. Each dwelling unit that will be billed separately must have its own meter, which you arrange with the utility.",
      },
    },
    {
      "@type": "Question",
      name: "Is it legal to charge tenants for utilities?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Charging a tenant for their consumption of water, electricity or other utilities is standard practice and normally permissible, provided the charge is reasonable, measured, and what the tenant sees matches what you were billed. Charge only what the tenant caused, and keep the evidence.",
      },
    },
    {
      "@type": "Question",
      name: "Equal split or metered split?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Equal split is only fair when occupancy and usage are similar. A unit where four people share a shower uses far more water than a unit occupied by one person. Metered split follows actual consumption and survives a disagreement; equal split is simpler and easier to explain.",
      },
    },
  ],
};

export default function SplitUtilityBillGuide() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      {/* Answer first: the page has to be useful even if the reader never
          scrolls, and it has to match what the search asked for. */}
      <p className="text-sm font-medium text-primary">Landlord guide</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        How to split one electric or water bill among your tenants
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        In a boarding house or rental building, one meter often covers a dozen
        rooms. That single bill has to be divided fairly — and the method you
        pick determines whether it stays a bookkeeping task or turns into a
        monthly argument. Here are the three approaches landlords use, the
        arithmetic behind each, and where the utility rules come in.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Why one bill becomes your problem
      </h2>
      <p className="mt-4 text-muted-foreground">
        The account is in your name, so the whole bill is your debt on the due
        date — whether or not the tenants pay you. A ₱4,000 bill across twelve
        rooms is roughly ₱333 each, and the arithmetic has to survive twelve
        people checking it.
      </p>
      <p className="mt-4 text-muted-foreground">
        The monthly unit of electricity is billed in kilowatt-hours, and your
        total consumption is the sum of everything in the building: each
        tenant&apos;s lights, air conditioning, appliances, and the common areas you
        run yourself — the hallway lights, the water pump, your own unit.
      </p>
      <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">Keep your own consumption
          separate.</strong> If you live in one of the units, decide upfront
          whether your unit is metered like everyone else&apos;s or treated as a
          cost you absorb. Both are acceptable; what causes arguments is a
          rule that appears without warning.
        </p>
      </div>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Method 1 — Split equally
      </h2>
      <p className="mt-4 text-muted-foreground">
        The simplest approach, and the right one when usage is broadly similar
        across units.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        {`share = (total bill − common-area cost) ÷ occupied units

example
  Meralco bill           ₱4,120
  less common areas        −₱620   (hallway, water pump, your unit)
  ÷ 12 occupied units
  = ₱350 ÷ 12 units
  = ₱291.67 per unit, rounded to ₱292`}
      </pre>
      <p className="mt-4 text-muted-foreground">
        Take the remainder — ₱4 in the example — rather than letting the
        arithmetic drift. Assign it once, openly, instead of absorbing it
        silently or hoping nobody notices.
      </p>
      <p className="mt-4 text-muted-foreground">
        <strong className="text-foreground">Weakness:</strong> it does not
        respond to actual usage. Two households running air conditioning
        through a Manila summer subsidise the room with the broken window unit
        — and they will say so.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Method 2 — Split by occupancy
      </h2>
      <p className="mt-4 text-muted-foreground">
        When occupancy varies but usage is broadly similar, weight by headcount.
        A room shared by three people uses more than one occupied by a single
        person.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        {`total occupant units = 15 people across 12 rooms

share per person = ₱3,500 ÷ 15 = ₱233.33

  Room 1A · 3 people   ₱700.00
  Room 1B · 1 person    ₱233.33
  Room 1C · 2 people    ₱466.67
  …`}
      </pre>
      <p className="mt-4 text-muted-foreground">
        <strong className="text-foreground">Weakness:</strong> treats a
        student who studies all night the same as someone who is away for work
        all week.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Method 3 — Sub-meter and bill by reading (the defensible one)
      </h2>
      <p className="mt-4 text-muted-foreground">
        Give each unit its own meter, read it on the same day each month, and
        bill the difference between readings multiplied by the rate. This is how
        it is meant to work, and it is the only method that survives a tenant
        disputing the number.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        {`consumption = current reading − previous reading
amount     = consumption × rate

example (electricity)
  previous reading        12,480 kWh
  current reading         13,215 kWh
  consumption                735 kWh
  × rate                      ₱7.42
  = ₱5,453.70  →  billed to that unit

then reconcile with the Meralco bill:
  sum of all unit bills + common areas = total billed`}
      </pre>
      <p className="mt-4 text-muted-foreground">
        Two things make this hold up in practice:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Read every meter on the same
          day.</strong> A day out of sync shifts usage between tenants
          unpredictably.
        </li>
        <li>
          <strong className="text-foreground">Carry the rate over, not just the
          reading.</strong> Utilities adjust rates mid-period; record the rate
          used at reading time so a rate change can&apos;t be mistaken for a
          tenant using more.
        </li>
      </ul>
      <p className="mt-4 text-muted-foreground">
        The reconciliation step matters: if your unit bills don&apos;t add up to
        the utility bill, the difference is leakage — unmetered common areas,
        a shared riser, or a meter that drifted. Better to discover that in the
        arithmetic than in a tenant&apos;s complaint.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Where the utility rules come in
      </h2>
      <p className="mt-4 text-muted-foreground">
        Two things are worth confirming with Meralco or Maynilad before you
        restructure anything:
      </p>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">
            You generally cannot consolidate dwelling units onto one account
            under additional or fictitious names.
          </strong>{" "}
          The account holder stays liable for the entire bill, so adding names
          creates liability without reducing any of it. Billing a dwelling
          unit separately means a separate meter, arranged with the utility.
        </li>
        <li>
          <strong className="text-foreground">
            Sub-metering may need their sign-off.
          </strong>{" "}
          Utilities differ in how they treat private sub-meters used for
          re-billing. Ask what documentation they require before you install,
            rather than after.
        </li>
      </ul>
      <p className="mt-4 text-muted-foreground">
        Treat these as the questions to ask your utility, not as settled rules —
        your provider&apos;s current requirements are what binds you, and they
        change.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        What tenants should see on a statement
      </h2>
      <p className="mt-4 text-muted-foreground">
        Whatever method you use, the tenant-facing number should be boring and
        itemised. Four lines beat a total every time:
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        {`October 2026 — Room 1A

  Rent                       ₱4,500.00
  Electricity  (86 kWh)       ₱638.12
  Water                       ₱185.00
  Less payments received   −₱5,323.12
  ─────────────────────────────────────
  Balance due                ₱0.00`}
      </pre>
      <p className="mt-4 text-muted-foreground">
        Show the previous and current readings, the consumption they imply, and
        the rate applied. A tenant can check that multiplication in their head,
        and a number they can verify is a number they won&apos;t dispute.
      </p>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">
        Doing this by hand every month
      </h2>
      <p className="mt-4 text-muted-foreground">
        Twelve units means twelve readings, twelve multiplications, a
        reconciliation against the utility bill, and then a message to each
        tenant asking for money. RentBase-PH does that loop for you: record each
        meter reading once, and each tenant&apos;s statement shows their share,
        their balance, and a link to pay by GCash or bank transfer.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button render={<Link href="/register" />}>
          Start free — up to 2 units
        </Button>
        <Button variant="outline" render={<Link href="/pricing" />}>
          See plans from ₱199
        </Button>
      </div>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">Common questions</h2>
      <div className="mt-4 space-y-4">
        {FAQ["mainEntity"].map((item) => (
          <div key={item.name} className="rounded-lg border p-4">
            <h3 className="font-semibold">{item.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.acceptedAnswer.text}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        More guides on{" "}
        <Link href="/guides" className="underline underline-offset-4">
          rent collection and landlord admin
        </Link>
        , or read the{" "}
        <Link href="/faq" className="underline underline-offset-4">
          RentBase-PH FAQ
        </Link>
        .
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ) }}
      />
    </article>
  );
}