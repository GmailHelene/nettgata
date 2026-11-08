import type { Metadata } from "next";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { OwnerOnly } from "../owner-note";
import { RedirectsForm } from "../redirects-form";

export const metadata: Metadata = { title: "Flytt fra gammel side" };

/**
 * Innstillinger › Flytt fra gammel side: omdirigeringer fra gamle adresser, skrevet for hånd eller hentet fra sitemapen
 * til den gamle siden. Slik beholder kunden plasseringene i Google når nettstedet flyttes hit.
 */
export default async function MovePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Flytt fra gammel side" />
      <p className="-mt-4 mb-6 text-neutral-700">
        Har du hatt en annen nettside før, peker Google og gamle lenker fortsatt til adressene der. Her sender du dem videre til riktig side, så du
        ikke mister besøkende eller plasseringen i søk.
      </p>
      {/* Omdirigeringer styrer trafikken til hele nettstedet. Serveren sjekker det samme. */}
      {role === "owner" ? (
        <RedirectsForm siteId={site.id} initial={site.redirects ?? []} />
      ) : (
        <OwnerOnly>Omdirigeringer kan bare endres av eieren, fordi de styrer hvor all trafikk fra gamle lenker havner.</OwnerOnly>
      )}
    </main>
  );
}
