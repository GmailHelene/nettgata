import Link from "next/link";
import { LabelPrintHelp } from "@/components/studio/label-print-help";
import { PageIntro } from "@/components/studio/help";
import { getDb } from "@/db";
import { bringLabelsReady, labelBadge } from "@/lib/bring/bulk";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { listOrders, orderFilters, ORDERS_PER_PAGE, parseOrderQuery, type OrderFilter } from "@/lib/shop/admin";
import { formatNok } from "@/lib/shop/money";
import { orderCounts } from "@/lib/shop/reports";
import { SiteNav } from "../site-nav";
import { orderStatusLabel } from "./order-status";
import { OrderList } from "./order-list";

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const query = parseOrderQuery(await searchParams);
  const db = await getDb();
  const [found, counts] = await Promise.all([listOrders(db, site.id, query), orderCounts(db, site.id)]);
  const rows = found.slice(0, ORDERS_PER_PAGE);
  const hasNext = found.length > ORDERS_PER_PAGE;
  const base = `/studio/nettsted/${site.id}/ordre`;
  const bringReady = bringLabelsReady(site.shop);

  const countFor = (key: OrderFilter) => {
    const statuses = orderFilters[key].statuses;
    return statuses ? statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0);
  };
  const href = (changes: Record<string, string | number>) => {
    const next = new URLSearchParams();
    const merged = { status: query.filter, q: query.search, side: query.page, ...changes };
    if (merged.status !== "alle") next.set("status", String(merged.status));
    if (merged.q) next.set("q", String(merged.q));
    if (Number(merged.side) > 1) next.set("side", String(merged.side));
    const qs = next.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const exportHref = href({ side: 1 }).replace(base, `${base}/eksport`);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="ordre" />
      <PageIntro article="ordre">Med Vipps og Klarna trekkes beløpet først når du markerer ordren som sendt eller hentet.</PageIntro>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action={base} className="flex flex-1 gap-2" role="search">
          {query.filter !== "alle" && <input type="hidden" name="status" value={query.filter} />}
          <label htmlFor="ordre-sok" className="sr-only">
            Søk i ordre
          </label>
          <input
            id="ordre-sok"
            name="q"
            type="search"
            defaultValue={query.search}
            placeholder="Ordrenummer, navn, e-post eller sporingsnummer"
            className="min-w-0 flex-1 rounded-md border border-neutral-400 px-3 py-2"
          />
          <button className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">Søk</button>
        </form>
        {(counts.paid ?? 0) > 0 && (
          <Link href={`${base}/plukkliste`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
            Plukkliste ({counts.paid})
          </Link>
        )}
        <a href={exportHref} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
          Last ned CSV
        </a>
      </div>

      <nav aria-label="Filtrer ordre" className="-mx-5 mb-4 overflow-x-auto px-5">
        <ul className="flex min-w-max gap-2">
          {(Object.keys(orderFilters) as OrderFilter[]).map((key) => (
            <li key={key}>
              <Link
                href={href({ status: key, side: 1 })}
                aria-current={key === query.filter ? "page" : undefined}
                className="block rounded-full border px-3 py-1 text-sm aria-[current=page]:border-[#173b6c] aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white"
              >
                {orderFilters[key].label} <span className="tabular-nums opacity-80">({countFor(key)})</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {bringReady && (
        <div className="mb-4">
          <LabelPrintHelp />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">
          {query.search ? `Ingen ordre passer «${query.search}».` : countFor("alle") === 0 ? "Ingen ordre ennå." : "Ingen ordre med denne statusen."}
        </p>
      ) : (
        <OrderList
          siteId={site.id}
          base={base}
          bulk={bringReady}
          rows={rows.map((o) => ({
            id: o.id,
            number: o.number,
            customerName: o.customerName,
            meta: `${formatOsloDateTime(o.createdAt)} · ${o.shipping.name}${o.discountCode ? ` · ${o.discountCode}` : ""}${o.trackingNumber ? " · sporing lagt inn" : ""}`,
            total: formatNok(o.totalOre),
            statusText: orderStatusLabel[o.status].text,
            statusClass: orderStatusLabel[o.status].className,
            selectable: bringReady && (o.status === "paid" || o.status === "fulfilled"),
            label: labelBadge(o, bringReady),
          }))}
        />
      )}

      {(query.page > 1 || hasNext) && (
        <nav aria-label="Sider" className="mt-4 flex items-center justify-between text-sm">
          {query.page > 1 ? (
            <Link href={href({ side: query.page - 1 })} className="underline">
              Forrige side
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-600">Side {query.page}</span>
          {hasNext ? (
            <Link href={href({ side: query.page + 1 })} className="underline">
              Neste side
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
