import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, pages } from "@/db/schema";
import { displayHost, rootOf } from "@/lib/domains";
import { getPack } from "@/lib/packs";
import { readShopSettings } from "@/lib/shop/settings";
import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../site-nav";
import { SettingsForm } from "./settings-form";
import { ShopSettingsForm } from "./shop-settings-form";
import { AppearanceForm } from "./appearance-form";
import { readSiteLayout } from "@/lib/site-layout";

export default async function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const designs = getPack(site.industryPack)?.designs ?? [];
  // Sammenlign bare fargene, siden fonter og hjørner kan være endret under Utseende.
  const colors = (t: typeof site.theme) => JSON.stringify([t.primary, t.onPrimary, t.background, t.surface, t.text, t.muted]);
  const current = designs.find((d) => colors(d.theme) === colors(site.theme))?.key;
  const domainRows = await (await getDb()).select().from(domains).where(eq(domains.siteId, site.id));
  const primary = domainRows.find((d) => d.isPrimary && d.status === "active");
  const waiting = domainRows.find((d) => d.status === "pending" && d.kind !== "apex");

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="innstillinger" />
      <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-5">
        <div>
          <h2 className="font-semibold">Domene</h2>
          <p className="text-sm text-neutral-600">
            {primary
              ? `Live på ${displayHost(primary.hostname)}`
              : waiting
                ? `${displayHost(rootOf(waiting))} venter på DNS-pekerne`
                : "Nettstedet har ikke eget domene ennå"}
          </p>
        </div>
        <Link href={`/studio/nettsted/${site.id}/domene`} className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold">
          {primary || waiting ? "Administrer domene" : "Koble til domene"}
        </Link>
      </section>
      <SettingsForm siteId={site.id} name={site.name} info={readSiteInfo(site.info)} designs={designs} currentDesign={current} />
      <AppearanceForm siteId={site.id} initial={readSiteLayout(site.layout)} fonts={site.theme.fonts} radius={site.theme.radius} />
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
