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
  return <div className="min-h-screen bg-neutral-50 text-neutral-900">{children}</div>;
}
