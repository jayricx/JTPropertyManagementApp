import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes the dashboard installable to the home screen.
 * `start_url` is `/dashboard` on purpose: that route redirects by role
 * (tenants bounce to the portal, signed-out visitors to /login), so one
 * launcher works for everyone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Renta-PH",
    short_name: "Renta-PH",
    description:
      "Register properties, track rent and income, and manage maintenance — built for independent landlords.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f7fdfb",
    theme_color: "#065f46",
    categories: ["business", "productivity", "finance"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Platform-masked: full-bleed background, art inside the safe zone.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the home screen icon for these.
    shortcuts: [
      { name: "Dashboard", short_name: "Dashboard", url: "/dashboard" },
      { name: "Finance", short_name: "Finance", url: "/finance" },
      { name: "Maintenance", short_name: "Requests", url: "/maintenance" },
    ],
  };
}