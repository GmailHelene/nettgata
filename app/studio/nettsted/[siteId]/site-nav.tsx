import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { inquiries, orders } from "@/db/schema";

const tabs = [
  { key: "oversikt", label: "Oversikt", href: "", shopOnly: false },
  { key: "sider", label: "Sider", href: "/sider", shopOnly: false },
  { key: "varer", label: "Varer", href: "/varer", shopOnly: true },
  { key: "ordre", label: "Ordre", href: "/ordre", shopOnly: true },
  { key: "rabatter", label: "Rabatter", href: "/rabatter", shopOnly: true },
  { key: "henvendelser", label: "Henvendelser", href: "/henvendelser", shopOnly: false },
  { key: "innstillinger", label: "Innstillinger", href: "/innstillinger", shopOnly: false },
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
  /** Varer, Ordre og Rabatter vises bare for nettbutikker, så en vanlig nettside ikke får faner den ikke trenger. */
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
  if (unread > 0) badges.henvendelser = { text: `${unread} nye`, className: "bg-red-700 text-white" };
  if (toShip > 0) badges.ordre = { text: `${toShip} å sende`, className: "bg-blue-700 text-white" };

  return (
    <div className="mb-8">
      <Link href="/studio" className="text-sm underline">
        Alle nettsteder
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{name}</h1>
      {/* Ruller sidelengs på mobil i stedet for å bryte over flere linjer. */}
      <nav aria-label="Nettsted" className="-mx-5 mt-4 overflow-x-auto px-5">
        <div className="flex min-w-max gap-x-6 border-b">
          {tabs
            .filter((t) => shop || !t.shopOnly)
            .map((t) => (
              <Link
                key={t.key}
                href={`/studio/nettsted/${siteId}${t.href}`}
                aria-current={t.key === active ? "page" : undefined}
                className="-mb-px whitespace-nowrap border-b-2 border-transparent pb-2 aria-[current=page]:border-neutral-900 aria-[current=page]:font-semibold"
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
