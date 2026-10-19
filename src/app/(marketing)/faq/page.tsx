import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "FAQ — Renta-PH.net",
  description:
    "Answers about Renta-PH.net plans and pricing, GCash and bank-transfer rent collection, tenant portal access, co-owners, and how your data is stored.",
};

type QA = { question: string; answer: string };

const SECTIONS: { heading: string; items: QA[] }[] = [
  {
    heading: "Plans and pricing",
    items: [
      {
        question: "How much does Renta-PH.net cost?",
        answer:
          "Free covers up to 2 units. Starter is ₱199 a month for up to 10 units, Pro is ₱399 for up to 20, and Business is ₱1,299 unlimited units. Paid plans bill annually at ten months' price — two months free.",
      },
      {
        question: "Can I pay now?",
        answer:
          "Not yet — billing opens at launch. New accounts start on Free, and upgrades are handled manually until then. Your data carries over unchanged when you move up.",
      },
      {
        question: "What happens when I hit my unit limit?",
        answer:
          "Adding a unit is blocked with a prompt showing your current usage and the plans above it. Nothing is deleted or hidden — you can upgrade, or remove a unit first.",
      },
      {
        question: "Do you charge per seat?",
        answer:
          "No. The limit is on units, not on how many people you add. Inviting a co-owner or property manager doesn't consume quota.",
      },
    ],
  },
  {
    heading: "Collecting rent",
    items: [
      {
        question: "Do I need a GCash merchant account?",
        answer:
          "No. Tenants send money to your own GCash wallet using ordinary send-money, or to a bank account you list in Settings. There is no gateway, no merchant onboarding and no percentage cut. Renta-PH.net keeps the record around the payment, not the payment itself.",
      },
      {
        question: "How does verification work?",
        answer:
          "Every tenant submission is recorded as awaiting verification. It shows in your Finance queue with the reference number and any receipt photo attached, but it does not count as income or reduce the tenant's balance until you approve it. Approval is atomic, so a double-click can't record it twice, and it emails the tenant their receipt.",
      },
      {
        question: "What if I reject a payment?",
        answer:
          "It stays on record as rejected rather than disappearing, so the history remains accurate. The tenant can resubmit the same reference, which reopens it for review at their current balance.",
      },
      {
        question: "Should tenants send receipt photos?",
        answer:
          "It's optional, and it's the single most useful thing they can add. The photo shows the amount, the destination, the date and the reference at once — which settles a disagreement in your favour. Photos are re-encoded on the tenant's phone so a large screenshot still uploads.",
      },
      {
        question: "Which bank accounts can tenants pay into?",
        answer:
          "Any you add under Settings → Bank accounts. You pick from the major Philippine banks or choose Other and type the name, then enter the account number and account name. Tenants see every active account when they choose bank transfer, along with the exact amount and send-money steps.",
      },
    ],
  },
  {
    heading: "Tenants and the portal",
    items: [
      {
        question: "How do tenants get access?",
        answer:
          "You add their email to the tenant record and send the invite from the tenant page. They open the setup link, choose a password or continue with Google, and land in the portal. The invite link is single-use and expires.",
      },
      {
        question: "What can a tenant see?",
        answer:
          "Only their own lease, their own statement and balance, and the maintenance issues they filed. They cannot see other tenants, other units, your income reports or your properties.",
      },
      {
        question: "Do tenants need to install anything?",
        answer:
          "No. The portal works in the browser on any phone. If they want it on their home screen, Renta-PH.net is installable as an app from the browser.",
      },
      {
        question: "Can a tenant report a leak with photos?",
        answer:
          "Yes. They file the issue from the portal, attach photos, and you track it from new through to resolved on your side.",
      },
    ],
  },
  {
    heading: "Working with other people",
    items: [
      {
        question: "How do I share management with a family member?",
        answer:
          "Invite them from Settings → Portfolio members, using the email of an existing account. Choose Co-owner — they can manage everything and fill in custom field values — or Viewer for read-only access. One invite covers every property in the portfolio.",
      },
      {
        question: "Why does a co-owner see all my properties?",
        answer:
          "A portfolio is the unit of access, not the individual property. If you'd rather someone only saw part of it, keep them out of the portfolio and give them portal access to a specific unit as a tenant instead.",
      },
      {
        question: "What can only the portfolio owner do?",
        answer:
          "Deleting a property, adding or removing members, renaming the portfolio, and creating or changing custom field definitions. Co-owners can create and edit properties, tenants, leases, charges and record payments.",
      },
    ],
  },
  {
    heading: "Data and security",
    items: [
      {
        question: "Where are my files stored?",
        answer:
          "Lease attachments, maintenance photos and payment receipts are stored in the app's database today and served only through an access-controlled route — the person who uploaded a file and anyone who can reach the related lease. Moving to object storage is on the roadmap.",
      },
      {
        question: "Can I export my data?",
        answer:
          "Yes. Reports covers 3, 6, 12 or 24 months of cash flow, income and expenses per property, and a CSV export that is generated by the same engine as the screen, so the numbers always match.",
      },
      {
        question: "What happens if I delete a property?",
        answer:
          "It removes the property and everything under it — units, leases, tenants and their payments. Only the portfolio owner can do this, and the confirmation names what goes with it. Take a CSV export first if you want the history.",
      },
      {
        question: "Do you need my bank password or a GCash PIN?",
        answer:
          "Never. Renta-PH.net only records the payment details a tenant submits and the receipt photo they choose to attach. It cannot move money, and it never connects to your bank or wallet.",
      },
    ],
  },
];

const ALL: QA[] = SECTIONS.flatMap((section) => section.items);

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ALL.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-primary">FAQ</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Frequently asked questions
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        How Renta-PH.net works, what it costs, and what it can and can&apos;t do
        with your money.
      </p>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-bold tracking-tight">
              {section.heading}
            </h2>
            <div className="mt-4 divide-y rounded-lg border">
              {section.items.map((item) => (
                <details key={item.question} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    <span className="flex items-start justify-between gap-4">
                      {item.question}
                      <span
                        aria-hidden
                        className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-lg border bg-muted/40 p-6">
        <h2 className="font-semibold">Still stuck?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The guides cover the day-to-day questions, and the{" "}
          <Link href="/guides/split-utility-bill" className="underline underline-offset-4">
            utility splitting guide
          </Link>{" "}
          is the one most small landlords find useful.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button render={<Link href="/register" />}>
            Create a free account
          </Button>
          <Button variant="outline" render={<Link href="/pricing" />}>
            See plans
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
    </div>
  );
}