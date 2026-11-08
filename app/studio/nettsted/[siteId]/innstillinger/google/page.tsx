import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { HelpLink } from "@/components/studio/help";
import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../../site-nav";
import { GoogleForm } from "./google-form";

/**
 * Innstillinger › Google og synlighet: Search Console, produktfeeden og hva Nettgata ordner selv.
 * Samlet her etter gjennomgangen i november 2026, der feeden lå øverst på Varer og Search Console midt i Innstillinger.
 */
export default async function GooglePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const shop = site.kind === "nettbutikk";
  const [primary] = await (await getDb())
    .select({ hostname: domains.hostname })
    .from(domains)
    .where(and(eq(domains.siteId, site.id), eq(domains.isPrimary, true), eq(domains.status, "active")))
    .limit(1);
  // Feeden ligger på butikkens egen adresse, så Google og Meta ser samme domene som i lenkene til varene.
  const host = primary?.hostname ?? `${site.slug}.${process.env.SITES_ROOT_DOMAIN ?? "localhost"}`;
  const feedUrl = `https://${host}/produktfeed.xml`;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Google og synlighet" />

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-2 font-semibold">Dette ordner Nettgata for deg</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Tittel og beskrivelse til Google på hver side, laget fra innholdet. Du kan endre dem i sideeditoren.</li>
          <li>Sitemap på {host}/sitemap.xml, oppdatert hver gang du publiserer.</li>
          <li>Strukturerte data med navn, adresse, telefon og åpningstider fra Firma og kontakt{shop ? ", og pris og lager på hver vare" : ""}.</li>
          <li>Rask og mobilvennlig side, som Google legger vekt på.</li>
        </ul>
      </section>

      <GoogleForm siteId={site.id} code={readSiteInfo(site.info).googleVerification ?? ""} />

      {shop && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="mb-2 font-semibold">Varene dine i Google Shopping, Facebook og Instagram</h2>
          <p className="text-sm text-neutral-700">
            Lim inn denne adressen i Google Merchant Center eller Meta Commerce Manager. Den oppdateres av seg selv når du endrer pris eller lager.
          </p>
          <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">
            <a href={feedUrl} className="break-all font-medium underline" target="_blank" rel="noreferrer">
              {feedUrl}
            </a>
          </p>
        </section>
      )}

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-2 font-semibold">Bedriftsprofil i Google Maps</h2>
        <p className="text-sm text-neutral-700">
          Profilen i Google Maps lager du selv hos Google. Den er gratis og gir deg plass i kartet når folk søker i nærheten.{" "}
          <HelpLink slug="google-bedriftsprofil" />
        </p>
      </section>

      <p className="text-sm text-neutral-700">
        Flytter du fra en gammel nettside, se{" "}
        <Link href={`/studio/nettsted/${site.id}/innstillinger/flytt`} className="underline">
          Flytt fra gammel side
        </Link>
        , så du beholder plasseringen i søk.
      </p>
    </main>
  );
}
