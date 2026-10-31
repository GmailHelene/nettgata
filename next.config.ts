import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite brukes kun lokalt og i tester; den skal ikke bundles.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
};

export default nextConfig;
