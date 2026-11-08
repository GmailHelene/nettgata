import Link from "next/link";
import { notFound } from "next/navigation";
import { bringSetupView } from "@/lib/bring/config";
import { readShopSettings } from "@/lib/shop/settings";
import { requireSiteAccess } from "@/lib/session";
import { HelpLink } from "@/components/studio/help";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../../site-nav";
import { ShopSettingsForm } from "../shop-settings-form";
import { BringAccountForm } from "./bring-account-form";
import { BringShippingForm } from "./bring-shipping-form";

/**
 * Innstillinger › Frakt og levering: faste leveringsmåter og gratis frakt øverst, så Bring med butikkens egen
 * Mybring-konto. Før lå de faste valgene i Innstillinger og Bring på en egen underside. Siden får aldri nøklene.
 */
export default async function ShippingPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") notFound();
  const view = bringSetupView(site.shop);
  const info = readSiteInfo(site.info);
  const canEdit = role === "owner";

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} shop active="innstillinger" title="Frakt og levering" />
      <p className="-mt-4 mb-6 text-neutral-700">
        Faste leveringsmåter, som Hent i butikken eller en fast fraktpris, setter du øverst. Har du avtale med Bring, kan kassen i tillegg hente
        prisen fra Bring ut fra vekt og postnummer. Vekten setter du på hver vare under{" "}
        <Link href={`/studio/nettsted/${site.id}/varer`} className="underline">
          Varer
        </Link>
        .
      </p>

      {canEdit ? (
        <ShopSettingsForm siteId={site.id} part="frakt" initial={readShopSettings(site.shop)} />
      ) : (
        <p className="mb-6 rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">
          Bare eieren av butikken kan endre frakten, fordi den bestemmer hva kundene betaler og hvem som blir fakturert for sendingene.
        </p>
      )}

      <h2 className="mb-2 mt-10 text-xl font-bold">Frakt med Bring</h2>
      <p className="mb-6 text-neutral-700">
        Kassen henter fraktprisen fra Bring, og fra ordren lager du fraktetiketten med ett trykk. Sporingsnummeret legges inn av seg selv.{" "}
        <HelpLink slug="bring" />
      </p>

      <section className="mb-6 rounded-lg border bg-white p-5">
        <h3 className="mb-2 font-semibold">Slik går fraktpengene</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Du bruker din egen avtale med Bring, og det er dine priser som gjelder.</li>
          <li>Kunden betaler frakten til deg sammen med varene. Bring fakturerer deg for sendingene etter avtalen din.</li>
          <li>Nettgata tar aldri betalt for frakt og ser aldri fraktpengene.</li>
        </ul>
      </section>

      <div className="space-y-6">
        <BringAccountForm siteId={site.id} view={view.account} canEdit={canEdit} />
        <BringShippingForm
          siteId={site.id}
          initial={view.shipping}
          defaults={{ name: site.name.slice(0, 35), street: info.street.slice(0, 35), postalCode: info.postalCode, city: info.city.slice(0, 35) }}
          canEdit={canEdit}
          ready={view.account?.ready ?? false}
        />
      </div>
    </main>
  );
}
