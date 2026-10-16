import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: cacheComponents is disabled because auth-gated dashboard pages read
  // cookies/server sessions. Re-enable later if you want partial prerendering,
  // wrapping dynamic segments in <Suspense> boundaries.
  /* config options here */
  // Default is bottom-left, which sits on top of the sidebar footer (theme
  // toggle + sign out) and swallows clicks during development.
  devIndicators: {
    position: "bottom-right",
  },
  experimental: {
    serverActions: {
      // Default is 1MB; lease attachments are capped at 5MB and multipart
      // framing adds a little on top.
      bodySizeLimit: "8mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // The service worker must never be served stale, and may only run
      // scripts from our own origin.
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // Offline fallback is revalidated so a new deploy reaches users.
      {
        source: "/offline.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      // Baseline hardening: no MIME sniffing, no framing, lean referrers.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
