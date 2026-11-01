import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isPlatformHost } from "@/lib/hosts";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

/** Studioet finnes bare på plattformens egne vertsnavn, aldri på kundenes domener. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  if (!isPlatformHost(host)) notFound();
  // Samme fonter og farger som nettgata.no. Forhåndsvisningene av nettstedene setter sine egne fonter selv.
  return (
    <div className="min-h-screen bg-[#f2f4f5] font-[family-name:var(--font-archivo)] text-[#1b232b] [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-[#173b6c]">
      {children}
    </div>
  );
}
