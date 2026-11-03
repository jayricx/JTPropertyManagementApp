import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

/**
 * Public pages only. The landlord dashboard and the tenant portal need a
 * session, so listing them would advertise URLs that bounce to sign-in.
 *
 * AI crawlers are listed by name under the same policy: allow the public
 * site, keep the session-gated app out. Named rules make the intent
 * explicit (retrieval systems behave predictably when they see them) and
 * future-proof the file if a blanket `*` restriction ever lands here.
 */
export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  const disallow = [
    "/dashboard",
    "/properties",
    "/leases",
    "/tenants",
    "/finance",
    "/reports",
    "/maintenance",
    "/settings",
    "/portal",
    "/api",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything behind a session — no value in the index and no way to
        // reach it without signing in.
        disallow,
      },
      // AI retrieval + training crawlers, explicitly welcomed on the same
      // terms as everyone else.
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "PerplexityBot",
          "Perplexity-User",
          "ClaudeBot",
          "Claude-SearchBot",
          "Claude-User",
          "Google-Extended",
          "Applebot-Extended",
        ],
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
