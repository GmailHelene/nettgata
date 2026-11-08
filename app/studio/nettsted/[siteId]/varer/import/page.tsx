import type { Metadata } from "next";
import Link from "next/link";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { ProductImport } from "./product-import";

export const metadata: Metadata = { title: "Import av varer" };

export default async function ImportPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const base = `/studio/nettsted/${site.id}/varer`;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="varer" />
      <Link href={base} className="text-sm underline">
        Tilbake til varer
      </Link>
      <h2 className="mb-2 mt-4 text-lg font-semibold">Importer varer fra CSV</h2>
      <div className="mb-6 space-y-2 text-sm text-neutral-700">
        <p>
          Enklest er å{" "}
          <a href={`${base}/eksport`} className="underline">
            laste ned varene som CSV
          </a>
          , endre i Excel og laste opp filen igjen. Da er kolonnene riktige.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Varer som finnes fra før, kjennes igjen på adressen eller navnet. Varianter kjennes igjen på varenummer eller variantnavn.</li>
          <li>Pris, lager, status og kategori oppdateres. Tomme felt lar det som står i butikken, være som det er.</li>
          <li>Nye varer opprettes som kladd, med mindre status er «I butikken». Bilder legger du inn på varen etterpå.</li>
          <li>Du ser alt som vil skje før noe lagres. Har filen feil, lagres ingenting.</li>
        </ul>
      </div>
      <ProductImport siteId={site.id} />
    </main>
  );
}
