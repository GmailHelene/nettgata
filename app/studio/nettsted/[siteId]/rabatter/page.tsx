import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { discountCodes } from "@/db/schema";
import { formatOsloDay } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { describeDiscount, discountStatus, discountToInput, type DiscountStatus } from "@/lib/shop/discounts";
import { SiteNav } from "../site-nav";
import { DiscountForm } from "./discount-form";
import { DiscountRowActions } from "./discount-row-actions";

const statusLabel: Record<DiscountStatus, { text: string; className: string }> = {
  aktiv: { text: "Aktiv", className: "bg-green-100 text-green-900" },
  planlagt: { text: "Planlagt", className: "bg-blue-100 text-blue-900" },
  utlopt: { text: "Utløpt", className: "bg-neutral-200 text-neutral-800" },
  "brukt-opp": { text: "Brukt opp", className: "bg-neutral-200 text-neutral-800" },
  av: { text: "Slått av", className: "bg-neutral-200 text-neutral-800" },
};

export default async function DiscountsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const rows = await (await getDb()).select().from(discountCodes).where(eq(discountCodes.siteId, site.id)).orderBy(desc(discountCodes.createdAt));
  const now = new Date();

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="rabatter" />

      {rows.length > 0 && (
        <ul className="mb-8 divide-y rounded-lg border bg-white">
          {rows.map((d) => {
            const status = statusLabel[discountStatus(d, now)];
            const input = discountToInput(d);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <span className="mr-auto min-w-48">
                  <Link href={`/studio/nettsted/${site.id}/rabatter/${d.id}`} className="font-mono font-semibold hover:underline">
                    {d.code}
                  </Link>
                  <span className="block text-sm text-neutral-600">
                    {describeDiscount(d)}
                    {input.startDate && ` · fra ${formatOsloDay(d.startsAt!, now)}`}
                    {input.endDate && ` · til og med ${formatOsloDay(new Date(d.endsAt!.getTime() - 1), now)}`}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-neutral-700">
                  Brukt {d.usedCount}
                  {d.usageLimit !== null && ` av ${d.usageLimit}`}
                </span>
                <span className={`rounded-full px-3 py-1 text-sm ${status.className}`}>{status.text}</span>
                <DiscountRowActions siteId={site.id} discountId={d.id} active={d.active} used={d.usedCount > 0} />
              </li>
            );
          })}
        </ul>
      )}

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-1 text-lg font-semibold">Ny rabattkode</h2>
        <p className="mb-5 text-sm text-neutral-600">
          Kunden skriver koden i kassen. Rabatten trekkes fra varene, og MVA regnes av beløpet etter rabatt. Koder som er brukt, kan slås av, men ikke slettes, så
          gamle ordre fortsatt viser hva som ble gitt.
        </p>
        <DiscountForm siteId={site.id} discountId={null} />
      </section>
    </main>
  );
}
