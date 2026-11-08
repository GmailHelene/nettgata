import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { requireSiteAccess } from "@/lib/session";
import { listVariantsForGrid } from "@/lib/shop/admin";
import { SiteNav } from "../../site-nav";
import { VariantGrid } from "./variant-grid";

export const metadata: Metadata = { title: "Pris og lager" };

export default async function PriceStockPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const rows = await listVariantsForGrid(await getDb(), site.id);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="varer" />
      <Link href={`/studio/nettsted/${site.id}/varer`} className="text-sm underline">
        Tilbake til varer
      </Link>
      <h2 className="mb-1 mt-4 text-lg font-semibold">Pris og lager</h2>
      <p className="mb-4 text-sm text-neutral-600">Endre så mange du vil, og lagre alt på én gang.</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">Ingen varer ennå.</p>
      ) : (
        <VariantGrid
          siteId={site.id}
          rows={rows.map((r) => ({
            variantId: r.variantId,
            name: r.name,
            variantLabel: r.optionValues.join(" / "),
            sku: r.sku,
            status: r.status,
            priceOre: r.priceOre,
            stock: r.stock,
          }))}
        />
      )}
    </main>
  );
}
