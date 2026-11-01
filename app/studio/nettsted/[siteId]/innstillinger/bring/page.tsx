import Link from "next/link";
import { notFound } from "next/navigation";
import { bringSetupView } from "@/lib/bring/config";
import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../../site-nav";
import { BringAccountForm } from "./bring-account-form";
import { BringShippingForm } from "./bring-shipping-form";

/**
 * Frakt med Bring for nettbutikken: butikkens egen Mybring-konto, tjenestene kassen viser og avsenderadressen.
 * Siden får aldri nøklene, bare om Bring er koblet til.
 */
export default async function BringPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") notFound();
  const view = bringSetupView(site.shop);
  const info = readSiteInfo(site.info);
  const canEdit = role === "owner";

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="innstillinger" />
      <Link href={`/studio/nettsted/${site.id}/innstillinger`} className="text-sm underline">
        Innstillinger
      </Link>
      <h2 className="mb-2 mt-4 text-xl font-bold">Frakt med Bring</h2>
      <p className="mb-6 text-neutral-700">
        Kassen henter fraktprisen fra Bring ut fra hvor mye varene veier og postnummeret til kunden. Fra ordren lager du fraktetiketten hos Bring med
        ett trykk, og sporingsnummeret legges inn av seg selv.
      </p>

      <section className="mb-6 rounded-lg border bg-white p-5">
        <h3 className="mb-2 font-semibold">Slik går fraktpengene</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Du bruker din egen avtale med Bring, og det er dine priser som gjelder.</li>
          <li>Kunden betaler frakten til deg sammen med varene. Bring fakturerer deg for sendingene etter avtalen din.</li>
          <li>Nettgata tar aldri betalt for frakt og ser aldri fraktpengene.</li>
        </ul>
      </section>

      {!canEdit && (
        <p className="mb-6 rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">
          Bare eieren av butikken kan endre Bring-oppsettet, fordi det bestemmer fraktprisene og hvem som blir fakturert for sendingene.
        </p>
      )}

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

      <p className="mt-6 text-sm text-neutral-700">
        Vekten setter du på hver vare under{" "}
        <Link href={`/studio/nettsted/${site.id}/varer`} className="underline">
          Varer
        </Link>
        . Faste leveringsmåter, som Hent selv, og gratis frakt over et beløp, setter du under{" "}
        <Link href={`/studio/nettsted/${site.id}/innstillinger`} className="underline">
          Innstillinger
        </Link>
        .
      </p>
    </main>
  );
}
