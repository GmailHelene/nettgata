import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { productCategories, products } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { listProductsAdmin, parseProductQuery, productStatusFilters, type ProductStatusFilter } from "@/lib/shop/admin";
import { readShopSettings } from "@/lib/shop/settings";
import { SiteNav } from "../site-nav";
import { Categories } from "./categories";
import { ProductTable } from "./product-table";

export const metadata: Metadata = { title: "Varer" };

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const query = parseProductQuery(await searchParams);
  const settings = readShopSettings(site.shop);
  const db = await getDb();
  const [rows, categories, [{ total }]] = await Promise.all([
    listProductsAdmin(db, site.id, query, settings.lowStockAt),
    db.select().from(productCategories).where(eq(productCategories.siteId, site.id)).orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
    db.select({ total: count() }).from(products).where(eq(products.siteId, site.id)),
  ]);
  const base = `/studio/nettsted/${site.id}/varer`;
  const href = (changes: Record<string, string>) => {
    const merged = { status: query.status, q: query.search, kategori: query.categoryId, lager: query.lowStock ? "lite" : "", ...changes };
    const next = new URLSearchParams();
    if (merged.status !== "alle") next.set("status", merged.status);
    for (const key of ["q", "kategori", "lager"] as const) if (merged[key]) next.set(key, merged[key]);
    const qs = next.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const filtered = query.search || query.categoryId || query.lowStock || query.status !== "alle";

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="varer" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Varer</h2>
        <div className="flex flex-wrap gap-2">
          <a href={`${base}/eksport`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
            Last ned CSV
          </a>
          <Link href={`${base}/import`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
            Importer CSV
          </Link>
          <Link href={`${base}/pris-og-lager`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
            Pris og lager
          </Link>
          <Link href={`${base}/ny`} className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white">
            Ny vare
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">Ingen varer ennå. Trykk «Ny vare» for å legge til den første.</p>
      ) : (
        <>
          <form action={base} role="search" className="mb-3 flex flex-wrap gap-2">
            {query.status !== "alle" && <input type="hidden" name="status" value={query.status} />}
            {query.lowStock && <input type="hidden" name="lager" value="lite" />}
            <label htmlFor="vare-sok" className="sr-only">
              Søk i varer
            </label>
            <input
              id="vare-sok"
              name="q"
              type="search"
              defaultValue={query.search}
              placeholder="Varenavn eller varenummer"
              className="min-w-0 flex-1 rounded-md border border-neutral-400 px-3 py-2"
            />
            {categories.length > 0 && (
              <>
                <label htmlFor="vare-kategori" className="sr-only">
                  Kategori
                </label>
                <select id="vare-kategori" name="kategori" defaultValue={query.categoryId} className="rounded-md border border-neutral-400 px-3 py-2">
                  <option value="">Alle kategorier</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">Søk</button>
          </form>

          <nav aria-label="Filtrer varer" className="-mx-5 mb-4 overflow-x-auto px-5">
            <ul className="flex min-w-max gap-2">
              {(Object.keys(productStatusFilters) as ProductStatusFilter[]).map((key) => (
                <li key={key}>
                  <Link
                    href={href({ status: key })}
                    aria-current={key === query.status ? "page" : undefined}
                    className="block rounded-full border px-3 py-1 text-sm aria-[current=page]:border-[#173b6c] aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white"
                  >
                    {productStatusFilters[key].label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={href({ lager: query.lowStock ? "" : "lite" })}
                  aria-pressed={query.lowStock}
                  className="block rounded-full border px-3 py-1 text-sm aria-pressed:border-[#173b6c] aria-pressed:bg-[#173b6c] aria-pressed:text-white"
                >
                  Lite på lager ({settings.lowStockAt} eller færre)
                </Link>
              </li>
            </ul>
          </nav>

          {rows.length === 0 ? (
            <p className="rounded-lg border bg-white p-6 text-neutral-700">
              Ingen varer passer.{" "}
              {filtered && (
                <Link href={base} className="underline">
                  Vis alle
                </Link>
              )}
            </p>
          ) : (
            <ProductTable
              siteId={site.id}
              products={rows}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            />
          )}
        </>
      )}
      <Categories siteId={site.id} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </main>
  );
}
