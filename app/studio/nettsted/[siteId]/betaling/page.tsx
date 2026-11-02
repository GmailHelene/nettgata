import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { fikenOverview, fikenPeriods } from "@/lib/fiken/send";
import { fikenAvailableTo, fikenView } from "@/lib/fiken/state";
import { paymentSetupView } from "@/lib/payments/config";
import { requireSiteAccess } from "@/lib/session";
import { HelpLink } from "@/components/studio/help";
import { SiteNav } from "../site-nav";
import { FikenSection } from "./fiken-section";
import { ProviderForm } from "./provider-form";

/**
 * Vipps og Klarna for nettbutikken. Butikken har egne avtaler og egne nøkler, og pengene går rett til butikken.
 * Siden får bare vite om løsningene er koblet til, aldri selve nøklene.
 */
export default async function PaymentPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role, user } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") notFound();
  const view = paymentSetupView(site.shop);
  const canEdit = role === "owner";
  const showFiken = fikenAvailableTo(user);
  // Fiken-oppsettet uten nøkkelen. Bare det studioet trenger, sendes videre til nettleseren.
  const fiken = showFiken ? fikenView(site.shop) : null;
  const fikenStatus = fiken ? await fikenOverview(await getDb(), site.id) : null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="betaling" />
      <h2 className="mb-2 text-xl font-bold">Betaling med Vipps og Klarna</h2>
      <p className="mb-6 text-neutral-700">
        Kundene betaler rett til butikken din. Du har egen avtale med Vipps og Klarna, og pengene går til kontoen din, aldri via Nettgata. Lim inn
        nøklene du har fått, så tester vi at de virker før betalingsmåten vises i kassen. <HelpLink slug="vipps-klarna" />
      </p>
      {!canEdit && (
        <p className="mb-6 rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">
          Bare eieren av butikken kan legge inn eller endre nøklene, fordi de bestemmer hvor pengene går.
        </p>
      )}

      <div className="space-y-6">
        <ProviderForm siteId={site.id} provider="vipps" view={view.vipps} canEdit={canEdit} />
        <ProviderForm siteId={site.id} provider="klarna" view={view.klarna} canEdit={canEdit} />
      </div>

      <section className="mt-8 rounded-lg border bg-white p-5">
        <h3 className="mb-2 font-semibold">Slik går pengene</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Når kunden betaler, reserveres beløpet. Ordren blir betalt i studioet først når Vipps eller Klarna har bekreftet betalingen.</li>
          <li>Beløpet trekkes når du markerer ordren som sendt eller hentet. Før det er ingenting trukket fra kunden.</li>
          <li>Kansellerer du en ordre, frigjøres reservasjonen. Refunderer du, får kunden pengene tilbake.</li>
          <li>Fullfører ikke kunden betalingen, kanselleres ordren av seg selv, og varene legges tilbake på lager.</li>
        </ul>
        <p className="mt-3 text-sm text-neutral-700">
          Betaling ved henting og faktura velger du under{" "}
          <Link href={`/studio/nettsted/${site.id}/innstillinger`} className="underline">
            Innstillinger
          </Link>
          .
        </p>
      </section>

      {showFiken && (
        <div className="mt-8">
          <FikenSection siteId={site.id} view={fiken} canEdit={canEdit} periods={fikenPeriods()} overview={fikenStatus} />
        </div>
      )}
    </main>
  );
}
