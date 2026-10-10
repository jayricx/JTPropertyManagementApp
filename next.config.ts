import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: cacheComponents is disabled because auth-gated dashboard pages read
  // cookies/server sessions. Re-enable later if you want partial prerendering,
  // wrapping dynamic segments in <Suspense> boundaries.
  /* config options here */
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
