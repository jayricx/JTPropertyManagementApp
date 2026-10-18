import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

/**
 * Public pages only. The landlord dashboard and the tenant portal need a
 * session, so listing them would advertise URLs that bounce to sign-in.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const lastModified = new Date();

  const routes: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/pricing", priority: 0.9 },
    { path: "/guides", priority: 0.8 },
    { path: "/guides/split-utility-bill", priority: 0.7 },
    { path: "/guides/collect-rent-gcash", priority: 0.7 },
    { path: "/faq", priority: 0.7 },
  ];

  return routes.map((route) => ({
    url: `${base}${route.path}`,
    lastModified,
    changeFrequency: "monthly",
    priority: route.priority,
  }));
}