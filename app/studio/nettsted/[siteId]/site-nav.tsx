import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { heading, StreetSign } from "@/components/brand";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { inquiries, orders } from "@/db/schema";

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
  { key: "betaling", label: "Betaling", href: "/betaling", shopOnly: true },
  { key: "henvendelser", label: "Henvendelser", href: "/henvendelser", shopOnly: false },
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
  const [[{ unread }], [{ toShip }]] = await Promise.all([
    db.select({ unread: count() }).from(inquiries).where(and(eq(inquiries.siteId, siteId), isNull(inquiries.readAt))),
    shop
      ? db.select({ toShip: count() }).from(orders).where(and(eq(orders.siteId, siteId), eq(orders.status, "paid")))
      : Promise.resolve([{ toShip: 0 }]),
  ]);
  const badges: Partial<Record<SiteTab, { text: string; className: string }>> = {};
  if (unread > 0) badges.henvendelser = { text: `${unread} ${unread === 1 ? "ny" : "nye"}`, className: "bg-[#a13a2c] text-white" };
  if (toShip > 0) badges.ordre = { text: `${toShip} å sende`, className: "bg-[#173b6c] text-white" };

  return (
    <div className="mb-8">
      <Link href="/studio" className="group inline-flex items-center gap-3 rounded-md text-sm">
        <StreetSign />
        <span className={ui.link}>Alle nettsteder</span>
      </Link>
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
    </div>
  );
}
