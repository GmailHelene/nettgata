import { getPack } from "@/lib/packs";
import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../site-nav";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const designs = getPack(site.industryPack)?.designs ?? [];
  const current = designs.find((d) => JSON.stringify(d.theme) === JSON.stringify(site.theme))?.key;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} active="innstillinger" />
      <SettingsForm siteId={site.id} name={site.name} info={readSiteInfo(site.info)} designs={designs} currentDesign={current} />
    </main>
  );
}
