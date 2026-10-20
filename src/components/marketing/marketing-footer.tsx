import Link from "next/link";
import { BrandMark } from "@/components/marketing/brand-mark";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/", label: "Overview" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
      { href: "/roadmap", label: "Roadmap" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { href: "/guides", label: "Guides" },
      { href: "/guides/split-utility-bill", label: "Splitting a utility bill" },
      { href: "/guides/collect-rent-gcash", label: "Collecting rent by GCash" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/register", label: "Create an account" },
      { href: "/login", label: "Sign in" },
      { href: "/portal-setup", label: "Tenant portal setup" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <BrandMark size={22} />
              <span>Renta-PH.net</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Property management built for Philippine landlords — peso
              pricing, GCash and bank-transfer rent collection, and per-tenant
              utility statements.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-sm font-semibold">{column.heading}</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-xs text-muted-foreground">
          <p>
            Made in the Philippines. Prices in Philippine pesos, and no plan is
            ever unlimited.
          </p>
        </div>
      </div>
    </footer>
  );
}