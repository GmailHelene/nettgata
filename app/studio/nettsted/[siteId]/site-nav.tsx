import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { heading, StreetSign } from "@/components/brand";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { aiSuggestions, inquiries, orders, sites } from "@/db/schema";
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

/**
 * Fanene for ett nettsted. Tellerne hentes her, så de er like på alle faner
 * uten at hver side må huske å sende dem med.
 */
export async function SiteNav({
  siteId,
  name,
  active,
  shop = false,
}: {
  siteId: string;
  name: string;
  active: SiteTab;
  /** Butikkfanene vises bare for nettbutikker, så en vanlig nettside ikke får faner den ikke trenger. */
  shop?: boolean;
}) {
  const db = await getDb();
  const [[{ unread }], [{ toShip }], [{ newIdeas }], [site]] = await Promise.all([
    db.select({ unread: count() }).from(inquiries).where(and(eq(inquiries.siteId, siteId), isNull(inquiries.readAt))),
    shop
      ? db.select({ toShip: count() }).from(orders).where(and(eq(orders.siteId, siteId), eq(orders.status, "paid")))
      : Promise.resolve([{ toShip: 0 }]),
    db.select({ newIdeas: count() }).from(aiSuggestions).where(and(eq(aiSuggestions.siteId, siteId), eq(aiSuggestions.status, "ny"))),
    db.select({ selfServe: sites.selfServe, billing: sites.billing }).from(sites).where(eq(sites.id, siteId)).limit(1),
  ]);
  // Nettsteder kunden har laget selv, kan bygges gratis, men ikke publiseres før abonnementet er valgt.
  const needsPlan = Boolean(site?.selfServe) && !hasActiveSubscription(site?.billing);
  const badges: Partial<Record<SiteTab, { text: string; className: string }>> = {};
  if (unread > 0) badges.henvendelser = { text: `${unread} ${unread === 1 ? "ny" : "nye"}`, className: "bg-[#a13a2c] text-white" };
  if (newIdeas > 0) badges["ai-teamet"] = { text: `${newIdeas} forslag`, className: "bg-[#2f5a47] text-white" };
  if (toShip > 0) badges.ordre = { text: `${toShip} å sende`, className: "bg-[#173b6c] text-white" };

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/studio" className="group inline-flex items-center gap-3 rounded-md text-sm">
          <StreetSign />
          <span className={ui.link}>Alle nettsteder</span>
        </Link>
        <Link href="/studio/hjelp" className={`text-sm ${ui.link}`}>
          Hjelp
        </Link>
      </div>
      <h1 className={`${heading} mt-6 text-[2.1rem] leading-none sm:text-4xl`}>{name}</h1>
      {/* Ruller sidelengs på mobil i stedet for å bryte over flere linjer. */}
      <nav aria-label="Nettsted" className="-mx-5 mt-4 overflow-x-auto px-5">
        <div className="flex min-w-max gap-x-6 border-b border-[#d5dbe0]">
          {tabs
            .filter((t) => shop || !t.shopOnly)
            .map((t) => (
              <Link
                key={t.key}
                href={`/studio/nettsted/${siteId}${t.href}`}
                aria-current={t.key === active ? "page" : undefined}
                className="-mb-px whitespace-nowrap border-b-[3px] border-transparent pb-2.5 font-medium text-[#47525c] transition-colors hover:text-[#1b232b] aria-[current=page]:border-[#173b6c] aria-[current=page]:font-semibold aria-[current=page]:text-[#173b6c]"
              >
                {t.label}
                {badges[t.key] && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${badges[t.key]!.className}`}>{badges[t.key]!.text}</span>}
              </Link>
            ))}
        </div>
      </nav>
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
