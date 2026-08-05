import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js — this is what the
  // Docker image runs. Keeps the runtime image small (no node_modules copy).
  output: "standalone",
  // @react-pdf/renderer resolves fonts and its own internals at runtime, which
  // the bundler cannot statically follow. Left bundled it throws on first render
  // inside the container — where the failure surfaces as a 500 on issue, after
  // the quote number has already been drawn.
  serverExternalPackages: ["@react-pdf/renderer"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
