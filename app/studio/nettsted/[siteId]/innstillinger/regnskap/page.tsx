import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { fikenOverview, fikenPeriods } from "@/lib/fiken/send";
import { fikenCallbackMessages, fikenCallbackResults, type FikenCallbackResult } from "@/lib/fiken/connect";
import { fikenAvailableTo, fikenOAuthConfig } from "@/lib/fiken/oauth";
import { fikenView } from "@/lib/fiken/state";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { FikenSection } from "../../betaling/fiken-section";

/**
 * Innstillinger › Regnskap (Fiken). Lå før under Betaling, men regnskap er ikke en betalingsmåte.
 * Siden finnes bare når Fiken er åpnet: appen er registrert hos Fiken, eller brukeren er plattformadmin.
 */
export default async function AccountingPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { fiken: fikenResult } = await searchParams;
  const { site, role, user } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk" || !fikenAvailableTo(user)) notFound();
  // Resultatet etter at Fiken sendte eieren tilbake (/studio/fiken/callback). Bare kjente koder vises.
  const notice =
    typeof fikenResult === "string" && (fikenCallbackResults as readonly string[]).includes(fikenResult)
      ? fikenCallbackMessages[fikenResult as FikenCallbackResult]
      : null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Regnskap" />
      <FikenSection
        siteId={site.id}
        view={fikenView(site.shop)}
        canEdit={role === "owner"}
        configured={fikenOAuthConfig() !== null}
        notice={notice}
        periods={fikenPeriods()}
        overview={await fikenOverview(await getDb(), site.id)}
      />
    </main>
  );
}
