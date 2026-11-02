import type { Metadata } from "next";
import Link from "next/link";
import { heading } from "@/components/brand";
import { StudioTopBar } from "@/components/studio/top-bar";
import { ui } from "@/components/studio/ui";
import { requireUser } from "@/lib/session";
import { HelpContact } from "./contact";
import { HelpSearch } from "./help-search";

export const metadata: Metadata = { title: "Hjelp" };

export default async function HelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const q = (await searchParams).q;
  const query = (Array.isArray(q) ? q[0] : q)?.slice(0, 100) ?? "";

  return (
    <>
      <StudioTopBar email={user.email} active="hjelp" />
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <Link href="/studio" className={`text-sm ${ui.link}`}>
          Alle nettsteder
        </Link>
        <h1 className={`${heading} mt-4 text-[2.4rem] leading-none sm:text-5xl`}>Hjelp</h1>
        <p className={`mb-8 mt-3 max-w-2xl ${ui.muted}`}>Korte svar med steg for det meste du gjør i studioet.</p>
        <HelpSearch initialQuery={query} />
        <HelpContact />
      </main>
    </>
  );
}
