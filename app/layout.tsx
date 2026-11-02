import type { Metadata } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

/** Nettgata sitt eget ikon (gateskiltet) på salgssiden og i studioet. Kundenettstedene har sitt eget (lib/favicon.ts). */
export const metadata: Metadata = {
  title: "Nettgata",
  icons: {
    icon: [
      { url: "/nettgata/ikon.svg", type: "image/svg+xml" },
      { url: "/nettgata/favicon.ico", sizes: "16x16 32x32 48x48" },
    ],
    apple: "/nettgata/ikon-180.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
