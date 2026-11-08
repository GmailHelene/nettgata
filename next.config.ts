import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite brukes kun lokalt og i tester; den skal ikke bundles.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Bare for utviklingsserveren (npm run dev lytter på localhost): nettstedene vises på *.localhost, og uten dette
  // avviser Next forespørslene derfra til utviklingsressursene.
  allowedDevOrigins: ["localhost", "*.localhost"],
  async rewrites() {
    // Nøkkelfilen for IndexNow må ligge rett under domenet (lib/seo/indexnow.ts).
    return [{ source: "/:key([0-9a-f]{32}).txt", destination: "/api/indexnow/:key" }];
  },
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
          // Andre nettsteder kan ikke legge sidene i en usynlig ramme (skjemaer, kasse og studio), og sidene ber aldri om kamera, mikrofon eller posisjon.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
