import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { CUSTOMERS_PER_PAGE, customerSorts, listCustomers, parseCustomerQuery, type CustomerSort } from "@/lib/shop/customers";
import { formatNok } from "@/lib/shop/money";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = { title: "Kunder" };

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const query = parseCustomerQuery(await searchParams);
  const found = await listCustomers(await getDb(), site.id, query);
  const rows = found.slice(0, CUSTOMERS_PER_PAGE);
  const hasNext = found.length > CUSTOMERS_PER_PAGE;
  const base = `/studio/nettsted/${site.id}/kunder`;
  const href = (changes: Record<string, string | number>) => {
    const merged = { q: query.search, sorter: query.sort, side: query.page, ...changes };
    const next = new URLSearchParams();
    if (merged.q) next.set("q", String(merged.q));
    if (merged.sorter !== "siste") next.set("sorter", String(merged.sorter));
    if (Number(merged.side) > 1) next.set("side", String(merged.side));
    const qs = next.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="kunder" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action={base} role="search" className="flex flex-1 gap-2">
          {query.sort !== "siste" && <input type="hidden" name="sorter" value={query.sort} />}
          <label htmlFor="kunde-sok" className="sr-only">
            Søk i kunder
          </label>
          <input
            id="kunde-sok"
            name="q"
            type="search"
            defaultValue={query.search}
            placeholder="Navn, e-post eller telefon"
            className="min-w-0 flex-1 rounded-md border border-neutral-400 px-3 py-2"
          />
          <button className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">Søk</button>
        </form>
        <a href={`${base}/eksport`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
          Last ned CSV
        </a>
      </div>

      <nav aria-label="Sorter kunder" className="-mx-5 mb-4 overflow-x-auto px-5">
        <ul className="flex min-w-max gap-2">
          {(Object.keys(customerSorts) as CustomerSort[]).map((key) => (
            <li key={key}>
              <Link
                href={href({ sorter: key, side: 1 })}
                aria-current={key === query.sort ? "page" : undefined}
                className="block rounded-full border px-3 py-1 text-sm aria-[current=page]:border-[#173b6c] aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white"
              >
                {customerSorts[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">
          {query.search ? `Ingen kunder passer «${query.search}».` : "Ingen kunder ennå. Alle som bestiller, havner her."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-neutral-50">
                <span className="mr-auto min-w-48">
                  <span className="block font-medium">
                    {c.name}
                    {c.orderCount > 1 && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Fast kunde</span>}
                  </span>
                  <span className="text-sm text-neutral-600">{c.email}</span>
                </span>
                <span className="text-sm text-neutral-700">
                  {c.orderCount} ordre
                  {c.lastOrderAt && ` · sist ${formatOsloDateTime(c.lastOrderAt)}`}
                </span>
                <span className="font-medium tabular-nums sm:w-28 sm:text-right">{formatNok(c.spentOre)}</span>
              </Link>
            </li>
          ))}
        </ul>
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
