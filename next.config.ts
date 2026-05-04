import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Fixes incorrect root inference when other lockfiles exist outside the project.
    root: path.join(__dirname),
  },
  // The sandboxed Windows runner can block child-process spawning during `next build`
  // (Next runs TypeScript typechecking in a separate process). Keep typechecking in CI.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
