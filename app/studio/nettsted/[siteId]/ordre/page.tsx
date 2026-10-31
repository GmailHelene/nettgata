import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { SiteNav } from "../site-nav";
import { orderStatusLabel } from "./order-status";

export default async function OrdersPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const rows = await db.select().from(orders).where(eq(orders.siteId, site.id)).orderBy(desc(orders.createdAt)).limit(200);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="ordre" />
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">Ingen ordre ennå.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/studio/nettsted/${site.id}/ordre/${o.id}`} className="flex flex-wrap items-center gap-4 p-4 hover:bg-neutral-50">
                <span className="w-16 font-semibold">#{o.number}</span>
                <span className="mr-auto">
                  <span className="block">{o.customerName}</span>
                  <span className="text-sm text-neutral-600">{o.createdAt.toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}</span>
                </span>
                <span className="font-medium">{formatNok(o.totalOre)}</span>
                <span className={`rounded-full px-3 py-1 text-sm ${orderStatusLabel[o.status].className}`}>{orderStatusLabel[o.status].text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
