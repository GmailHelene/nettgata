import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { paymentSetupView } from "@/lib/payments/config";
import { readShopSettings } from "@/lib/shop/settings";
import { requireSiteAccess } from "@/lib/session";
import { HelpLink } from "@/components/studio/help";
import { SiteNav } from "../site-nav";
import { ShopSettingsForm } from "../innstillinger/shop-settings-form";
import { ProviderForm } from "./provider-form";

export const metadata: Metadata = { title: "Betaling" };

/**
 * Innstillinger › Betaling: alle betalingsmåtene på ett sted, både Vipps og Kustom og det butikken ordner selv
 * (henting og faktura). Butikken har egne avtaler og egne nøkler, og pengene går rett til butikken.
 * Siden får bare vite om løsningene er koblet til, aldri selve nøklene.
 */
export default async function PaymentPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") notFound();
  const view = paymentSetupView(site.shop);
  const canEdit = role === "owner";

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} shop active="betaling" />
      <p className="-mt-4 mb-6 text-neutral-700">
        Kundene betaler rett til butikken din. Du har egen avtale med Vipps eller Kustom, og pengene går til kontoen din, aldri via Nettgata. Lim inn
        nøklene du har fått, så tester vi at de virker før betalingsmåten vises i kassen. Kustom-kassen har kort, Vipps og Klarna i én løsning.{" "}
        <HelpLink slug="vipps-klarna" />
      </p>
      {!canEdit && (
        <p className="mb-6 rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">
          Bare eieren av butikken kan legge inn eller endre betalingsmåter, fordi de bestemmer hvor pengene går.
        </p>
      )}

      <div className="space-y-6">
        <ProviderForm siteId={site.id} provider="kustom" view={view.kustom} canEdit={canEdit} />
        <ProviderForm siteId={site.id} provider="vipps" view={view.vipps} canEdit={canEdit} />
        {/* Klarna Payments vises bare for butikker som allerede har koblet det til. Nye butikker bruker Kustom, som har Vipps og Klarna i samme kasse. */}
        {view.klarna && <ProviderForm siteId={site.id} provider="klarna" view={view.klarna} canEdit={canEdit} />}
        {canEdit && <ShopSettingsForm siteId={site.id} part="betaling" initial={readShopSettings(site.shop)} />}
      </div>

      <section className="mt-8 rounded-lg border bg-white p-5">
        <h2 className="mb-2 font-semibold">Slik går pengene</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Når kunden betaler, reserveres beløpet. Ordren blir betalt i studioet først når Vipps eller Kustom har bekreftet betalingen.</li>
          <li>Beløpet trekkes når du markerer ordren som sendt eller hentet. Før det er ingenting trukket fra kunden.</li>
          <li>Kansellerer du en ordre, frigjøres reservasjonen. Refunderer du, får kunden pengene tilbake.</li>
          <li>Fullfører ikke kunden betalingen, kanselleres ordren av seg selv, og varene legges tilbake på lager.</li>
        </ul>
      </section>
    </main>
  );
}
