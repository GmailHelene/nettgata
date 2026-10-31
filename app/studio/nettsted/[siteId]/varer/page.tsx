import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { productCategories, productVariants, products } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { SiteNav } from "../site-nav";
import { Categories } from "./categories";

const statusLabel = { draft: "Kladd", active: "I butikken", archived: "Arkivert" } as const;

export default async function ProductsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const [rows, categories] = await Promise.all([
    db.select().from(products).where(eq(products.siteId, site.id)).orderBy(asc(products.status), asc(products.name)),
    db.select().from(productCategories).where(eq(productCategories.siteId, site.id)).orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
  ]);
  const variants = rows.length
    ? await db.select().from(productVariants).where(inArray(productVariants.productId, rows.map((r) => r.id)))
    : [];

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="varer" />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Varer ({rows.length})</h2>
        <Link href={`/studio/nettsted/${site.id}/varer/ny`} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
          Ny vare
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">Ingen varer ennå. Trykk «Ny vare» for å legge til den første.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {rows.map((p) => {
            const vs = variants.filter((v) => v.productId === p.id);
            const tracked = vs.filter((v) => v.stock !== null);
            const stock = tracked.reduce((sum, v) => sum + (v.stock ?? 0), 0);
            const prices = vs.map((v) => v.priceOre);
            return (
              <li key={p.id}>
                <Link href={`/studio/nettsted/${site.id}/varer/${p.id}`} className="flex flex-wrap items-center gap-4 p-4 hover:bg-neutral-50">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0].src} alt="" className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <span className="h-12 w-12 rounded bg-neutral-100" />
                  )}
                  <span className="mr-auto">
                    <span className="block font-medium">{p.name}</span>
                    <span className="text-sm text-neutral-600">
                      {vs.length} {vs.length === 1 ? "variant" : "varianter"}
                      {prices.length > 0 && ` · fra ${formatNok(Math.min(...prices))}`}
                      {categories.find((c) => c.id === p.categoryId) && ` · ${categories.find((c) => c.id === p.categoryId)!.name}`}
                    </span>
                  </span>
                  <span className={`text-sm ${tracked.length && stock === 0 ? "text-red-800" : "text-neutral-700"}`}>
                    {tracked.length ? (stock === 0 ? "Utsolgt" : `${stock} på lager`) : "Lager følges ikke"}
                  </span>
                  <span className={`text-sm ${p.status === "active" ? "text-green-800" : "text-neutral-600"}`}>{statusLabel[p.status]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Categories siteId={site.id} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </main>
  );
}
