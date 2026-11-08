import type { Metadata } from "next";
import { letterIconSvg } from "@/lib/favicon";
import { requireSiteAccess } from "@/lib/session";
import { readSiteLayout } from "@/lib/site-layout";
import { SiteNav } from "../../site-nav";
import { AppearanceForm } from "../../innstillinger/appearance-form";
import { FaviconForm } from "../../innstillinger/favicon-form";

export const metadata: Metadata = { title: "Logo og bunntekst" };

/**
 * Design › Logo og bunntekst. Lå før i Innstillinger, men hører til utseendet, som i Shopify (Nettbutikk › Tilpass)
 * og WordPress (Utseende › Tilpass).
 */
export default async function LogoPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const layout = readSiteLayout(site.layout);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-12">
      <SiteNav siteId={site.id} active="design" title="Logo og bunntekst" />
      <AppearanceForm siteId={site.id} initial={layout} />
      <FaviconForm
        siteId={site.id}
        current={layout.favicon?.src ?? null}
        fallback={`data:image/svg+xml,${encodeURIComponent(letterIconSvg(site.name, site.theme))}`}
      />
    </main>
  );
}
