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
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
