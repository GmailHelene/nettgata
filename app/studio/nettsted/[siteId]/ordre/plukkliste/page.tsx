import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { orderLines, orders } from "@/db/schema";
import { PrintButton } from "@/components/studio/print-button";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";

/** Alt som skal plukkes for ordrene som er betalt og ikke sendt, slått sammen per variant. */
export default async function PickListPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const toShip = await db
    .select()
    .from(orders)
    .where(and(eq(orders.siteId, site.id), eq(orders.status, "paid")))
    .orderBy(asc(orders.number));
  const lines = toShip.length ? await db.select().from(orderLines).where(inArray(orderLines.orderId, toShip.map((o) => o.id))) : [];

  const numberOf = new Map(toShip.map((o) => [o.id, o.number]));
  const picks = new Map<string, { name: string; variantLabel: string | null; sku: string | null; quantity: number; orders: Set<number> }>();
  for (const l of lines) {
    const key = l.variantId ?? `${l.name}|${l.variantLabel}`;
    const p = picks.get(key) ?? { name: l.name, variantLabel: l.variantLabel, sku: l.sku, quantity: 0, orders: new Set<number>() };
    p.quantity += l.quantity;
    p.orders.add(numberOf.get(l.orderId)!);
    picks.set(key, p);
  }
  const rows = [...picks.entries()].sort(
    ([, a], [, b]) => a.name.localeCompare(b.name, "nb") || (a.variantLabel ?? "").localeCompare(b.variantLabel ?? "", "nb"),
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link href={`/studio/nettsted/${site.id}/ordre?status=klar`} className="text-sm underline">
          Tilbake til ordre
        </Link>
        <PrintButton />
      </div>
      <h1 className="text-2xl font-bold">Plukkliste</h1>
      <p className="mb-6 text-sm text-neutral-600">
        {site.name} · {toShip.length} ordre klar til sending · laget {formatOsloDateTime(new Date())}
      </p>
      {rows.length === 0 ? (
        <p>Ingen betalte ordre venter på å bli sendt.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-[#173b6c] text-left">
              <th className="w-10 py-2">
                <span className="sr-only">Plukket</span>
              </th>
              <th className="py-2 pr-3">Vare</th>
              <th className="py-2 pr-3">Varenr.</th>
              <th className="py-2 pr-3 text-right">Antall</th>
              <th className="py-2">Ordre</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, r]) => (
              <tr key={key} className="border-b align-top">
                <td className="py-2">
                  <span aria-hidden="true" className="inline-block h-4 w-4 border border-[#173b6c]" />
                </td>
                <td className="py-2 pr-3">
                  {r.name}
                  {r.variantLabel && <span className="block text-neutral-600">{r.variantLabel}</span>}
                </td>
                <td className="py-2 pr-3">{r.sku ?? ""}</td>
                <td className="py-2 pr-3 text-right text-base font-semibold tabular-nums">{r.quantity}</td>
                <td className="py-2 text-neutral-700">{[...r.orders].map((n) => `#${n}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
