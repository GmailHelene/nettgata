import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../site-nav";
import { SettingsForm } from "./settings-form";

/**
 * Innstillinger › Firma og kontakt. Resten av innstillingene har egne undersider i menyen, med én lagreknapp hver
 * (gjennomgangen av studioet, november 2026: én side med 14 skjemaer ble for mye).
 */
export default async function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Firma og kontakt" />
      <SettingsForm siteId={site.id} name={site.name} info={readSiteInfo(site.info)} />
    </main>
  );
}
