import { appUrl } from "@/lib/app-url";
import {
  PLAN_LABELS,
  PLAN_PRICES,
  PLAN_TIERS,
  PLAN_UNIT_LIMITS,
} from "@/lib/plans";

/**
 * JSON-LD for the public marketing site, shared by the pages that carry it.
 *
 * This is the part of "AI visibility" we control directly: retrieval systems
 * parse structured data more reliably than prose, so the facts a model could
 * repeat about Renta-PH (what it is, who it's for, what it costs) should be
 * stated once, in schema.org, with one canonical origin. Everything in here
 * must remain provable from pages that exist — no invented ratings, no social
 * links we don't run.
 */

/** Script element props carrying a JSON-LD payload — spread on a <script>. */
export function schemaScriptProps(payload: Record<string, unknown>) {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: {
      __html: JSON.stringify({ "@context": "https://schema.org", ...payload }),
    },
  } as const;
}

const base = appUrl();

/** Site-level: who runs this site and what the site is. Used in the layout. */
export function orgWebsiteSchema() {
  return {
    "@graph": [
      {
        "@type": "Organization",
        name: "Renta-PH.net",
        url: base,
        logo: `${base}/icon.svg`,
      },
      {
        "@type": "WebSite",
        name: "Renta-PH.net",
        url: base,
        description:
          "Property management for Philippine landlords: rent collection by GCash or bank transfer, per-tenant utility statements, leases, and a tenant portal.",
        inLanguage: "en-PH",
      },
    ],
  };
}

/** The product as a purchasable thing, with real prices from the plan table. */
export function softwareApplicationSchema() {
  return {
    "@type": "SoftwareApplication",
    name: "Renta-PH.net",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Property Management Software",
    operatingSystem: "Web",
    url: base,
    description:
      "Property management software for Philippine landlords: collect rent by GCash or bank transfer with reference-number verification, issue per-tenant utility statements from sub-meter readings, keep leases, tenants and expenses in one place, and give tenants a portal. Priced in Philippine pesos.",
    offers: PLAN_TIERS.map((tier) => {
      const limit = PLAN_UNIT_LIMITS[tier];
      return {
        "@type": "Offer",
        name: `${PLAN_LABELS[tier]} plan`,
        price: PLAN_PRICES[tier].monthly,
        priceCurrency: "PHP",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: PLAN_PRICES[tier].monthly,
          priceCurrency: "PHP",
          unitText: "MONTH",
          billingIncrement: 1,
        },
        url: `${base}/pricing`,
        description:
          limit === null ? "Unlimited units" : `Up to ${limit} rental units`,
      };
    }),
  };
}

/** Long-form content (learn articles, guides) as a citable article. */
export function articleSchema(path: string, headline: string, description: string) {
  return {
    "@type": "Article",
    headline,
    description,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${base}${path}` },
    author: { "@type": "Organization", name: "Renta-PH.net" },
    publisher: { "@type": "Organization", name: "Renta-PH.net" },
    inLanguage: "en-PH",
  };
}
