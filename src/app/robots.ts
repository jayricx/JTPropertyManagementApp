import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything behind a session — no value in the index and no way to
        // reach it without signing in.
        disallow: ["/dashboard", "/properties", "/leases", "/tenants", "/finance", "/reports", "/maintenance", "/settings", "/portal", "/api"],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}