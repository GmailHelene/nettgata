import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite brukes kun lokalt og i tester; den skal ikke bundles.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Studioet kan bare vises i en ramme på plattformens egne sider (forhåndsvisningen i redigereren).
        // Ellers kunne et annet nettsted lagt studioet i en usynlig ramme og lurt brukeren til å klikke.
        source: "/studio/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
