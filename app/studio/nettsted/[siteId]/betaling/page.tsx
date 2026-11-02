import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { fikenOverview, fikenPeriods } from "@/lib/fiken/send";
import { fikenCallbackMessages, fikenCallbackResults, type FikenCallbackResult } from "@/lib/fiken/connect";
import { fikenAvailableTo, fikenOAuthConfig } from "@/lib/fiken/oauth";
import { fikenView } from "@/lib/fiken/state";
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
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { fiken: fikenResult } = await searchParams;
  const { site, role, user } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") notFound();
  const view = paymentSetupView(site.shop);
  const canEdit = role === "owner";
  // Fiken åpnes for butikkene når appen er registrert hos Fiken. Til da ser bare plattformadmin koblingen.
  const showFiken = fikenAvailableTo(user);
  const fikenConfigured = fikenOAuthConfig() !== null;
  // Resultatet etter at Fiken sendte eieren tilbake (/studio/fiken/callback). Bare kjente koder vises.
  const fikenNotice = typeof fikenResult === "string" && (fikenCallbackResults as readonly string[]).includes(fikenResult) ? fikenCallbackMessages[fikenResult as FikenCallbackResult] : null;
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
        <ProviderForm siteId={site.id} provider="kustom" view={view.kustom} canEdit={canEdit} />
      </div>

      <section className="mt-8 rounded-lg border bg-white p-5">
        <h3 className="mb-2 font-semibold">Slik går pengene</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Når kunden betaler, reserveres beløpet. Ordren blir betalt i studioet først når Vipps, Klarna eller Kustom har bekreftet betalingen.</li>
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

      <div className="mt-8">
        {showFiken ? (
          <FikenSection
            siteId={site.id}
            view={fiken}
            canEdit={canEdit}
            configured={fikenConfigured}
            notice={fikenNotice}
            periods={fikenPeriods()}
            overview={fikenStatus}
          />
        ) : (
          <section aria-labelledby="fiken-tittel" className="rounded-lg border bg-white p-5">
            <h3 id="fiken-tittel" className="text-lg font-semibold">
              Regnskap: Fiken
            </h3>
            <p className="mt-2 text-sm text-neutral-700">
              Fiken kommer snart. Da kan du sende betalte ordre fra nettbutikken rett til regnskapet ditt i Fiken.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
