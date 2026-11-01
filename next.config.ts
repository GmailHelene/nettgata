import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite brukes kun lokalt og i tester; den skal ikke bundles.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Bare for utviklingsserveren (npm run dev lytter på localhost): nettstedene vises på *.localhost, og uten dette
  // avviser Next forespørslene derfra til utviklingsressursene.
  allowedDevOrigins: ["localhost", "*.localhost"],
  async headers() {
    return [
      {
        // Alle sider: nettleseren skal ikke gjette filtype, andre nettsteder får bare domenet i Referer,
        // og nettstedene skal bare åpnes med https. Uten includeSubDomains, så kundens andre underdomener ikke påvirkes.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
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
