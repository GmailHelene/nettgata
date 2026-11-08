import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { pages } from "@/db/schema";
import { readShopSettings } from "@/lib/shop/settings";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { OwnerOnly } from "../owner-note";
import { ShopSettingsForm } from "../shop-settings-form";

/** Innstillinger › Vilkår og lager: hvilken side som er kjøpsvilkårene, og når en vare regnes som nesten utsolgt. */
export default async function ShopTermsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") notFound();
  const rows = await (await getDb()).select().from(pages).where(eq(pages.siteId, site.id)).orderBy(asc(pages.sortOrder));

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Vilkår og lager" />
      {role === "owner" ? (
        <ShopSettingsForm
          siteId={site.id}
          part="vilkar"
          initial={readShopSettings(site.shop)}
          pages={rows.map((p) => ({ path: p.path, title: p.title, published: p.publishedVersionId !== null }))}
        />
      ) : (
        <OwnerOnly>Kjøpsvilkårene kan bare endres av eieren, fordi de er avtalen butikken har med kundene.</OwnerOnly>
      )}
    </main>
  );
}
