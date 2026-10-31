import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pages } from "@/db/schema";
import { getPack } from "@/lib/packs";
import { readShopSettings } from "@/lib/shop/settings";
import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../site-nav";
import { SettingsForm } from "./settings-form";
import { ShopSettingsForm } from "./shop-settings-form";

export default async function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const designs = getPack(site.industryPack)?.designs ?? [];
  const current = designs.find((d) => JSON.stringify(d.theme) === JSON.stringify(site.theme))?.key;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="innstillinger" />
      <SettingsForm siteId={site.id} name={site.name} info={readSiteInfo(site.info)} designs={designs} currentDesign={current} />
      {site.kind === "nettbutikk" && (
        <ShopSettingsForm
          siteId={site.id}
          initial={readShopSettings(site.shop)}
          pages={(await (await getDb()).select().from(pages).where(eq(pages.siteId, site.id)).orderBy(asc(pages.sortOrder))).map((p) => ({
            path: p.path,
            title: p.title,
            published: p.publishedVersionId !== null,
          }))}
        />
      )}
    </main>
  );
}
