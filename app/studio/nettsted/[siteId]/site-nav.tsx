import Link from "next/link";
import { eq } from "drizzle-orm";
import { heading } from "@/components/brand";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/state";

const tabs = [
  { key: "oversikt", label: "Oversikt", href: "", shopOnly: false },
  { key: "sider", label: "Sider", href: "/sider", shopOnly: false },
  { key: "design", label: "Design", href: "/design", shopOnly: false },
  { key: "bilder", label: "Bilder", href: "/bilder", shopOnly: false },
  { key: "varer", label: "Varer", href: "/varer", shopOnly: true },
  { key: "ordre", label: "Ordre", href: "/ordre", shopOnly: true },
  { key: "kunder", label: "Kunder", href: "/kunder", shopOnly: true },
  { key: "rabatter", label: "Rabatter", href: "/rabatter", shopOnly: true },
  { key: "rapporter", label: "Rapporter", href: "/rapporter", shopOnly: true },
  { key: "statistikk", label: "Statistikk", href: "/statistikk", shopOnly: false },
  { key: "betaling", label: "Betaling", href: "/betaling", shopOnly: true },
  { key: "henvendelser", label: "Henvendelser", href: "/henvendelser", shopOnly: false },
  { key: "booking", label: "Booking", href: "/booking", shopOnly: false },
  { key: "nyhetsbrev", label: "Nyhetsbrev", href: "/nyhetsbrev", shopOnly: false },
  { key: "ai-teamet", label: "AI-teamet", href: "/ai-teamet", shopOnly: false },
  { key: "innstillinger", label: "Innstillinger", href: "/innstillinger", shopOnly: false },
  { key: "abonnement", label: "Abonnement", href: "/abonnement", shopOnly: false },
] as const;

export type SiteTab = (typeof tabs)[number]["key"];

/** Overskriften på siden. Menyen ligger i layout.tsx (studio-shell.tsx). */
const titles: Record<SiteTab, string> = {
  oversikt: "Hjem",
  sider: "Sider og meny",
  design: "Design",
  bilder: "Bilder",
  varer: "Varer",
  ordre: "Ordre",
  kunder: "Kunder",
  rabatter: "Rabatter",
  rapporter: "Salg og MVA",
  statistikk: "Besøk",
  betaling: "Betaling",
  henvendelser: "Henvendelser",
  booking: "Booking",
  nyhetsbrev: "Nyhetsbrev",
  "ai-teamet": "AI-teamet",
  innstillinger: "Innstillinger",
  abonnement: "Abonnement",
};

/**
 * Toppen av hver side: sidens navn som h1 (WCAG 2.4.6) og beskjed om abonnement når nettstedet ikke kan publiseres.
 * Navnet på nettstedet står i toppstripa. title kan overstyre overskriften, for eksempel «Domene» under Innstillinger.
 */
export async function SiteNav({
  siteId,
  active,
  title,
}: {
  siteId: string;
  name?: string;
  active: SiteTab;
  shop?: boolean;
  title?: string;
}) {
  const db = await getDb();
  const [site] = await db.select({ selfServe: sites.selfServe, billing: sites.billing }).from(sites).where(eq(sites.id, siteId)).limit(1);
  // Nettsteder kunden har laget selv, kan bygges gratis, men ikke publiseres før abonnementet er valgt.
  const needsPlan = Boolean(site?.selfServe) && !hasActiveSubscription(site?.billing);

  return (
    <div className="mb-8">
      <h1 className={`${heading} text-[2rem] leading-tight sm:text-4xl`}>{title ?? titles[active]}</h1>
      {needsPlan && active !== "abonnement" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#173b6c]/30 bg-[#eef3f9] px-4 py-3.5">
          <p>
            <strong className="font-semibold">Velg abonnement for å publisere.</strong>{" "}
            <span className={ui.muted}>Du kan bygge og forhåndsvise så mye du vil før det, helt gratis.</span>
          </p>
          <Link href={`/studio/nettsted/${siteId}/abonnement`} className={ui.button}>
            Velg abonnement
          </Link>
        </div>
      )}
    </div>
  );
}
