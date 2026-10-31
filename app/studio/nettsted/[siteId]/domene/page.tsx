import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { domainViews, MAX_ROOTS_PER_SITE } from "@/lib/domains";
import { getDomainServices, missingDomainConfig } from "@/lib/domains/services";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { DomainManager } from "./domain-manager";

export default async function DomainPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user } = await requireSiteAccess(siteId);
  const db = await getDb();
  const services = getDomainServices(db);
  const rows = await db.select().from(domains).where(eq(domains.siteId, site.id));
  const views = services ? domainViews(rows, services.target) : [];
  const root = process.env.SITES_ROOT_DOMAIN?.trim();
  const freeAddress = root ? `${site.slug}.${root}` : `/vis/${site.slug}`;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="innstillinger" />
      <Link href={`/studio/nettsted/${site.id}/innstillinger`} className="text-sm underline">
        Tilbake til innstillinger
      </Link>
      <h2 className="mb-2 mt-4 text-xl font-bold">Eget domene</h2>
      <p className="mb-6 text-neutral-700">
        Skriv inn domenet ditt, legg inn pekerne hos forhandleren, så kobler vi det til automatisk med sikker tilkobling (https). Til da ligger nettstedet på{" "}
        <span className="font-mono">{freeAddress}</span>.
      </p>

      {services ? (
        <DomainManager
          siteId={site.id}
          views={views}
          canAdd={views.length < MAX_ROOTS_PER_SITE}
          simulated={services.simulated}
        />
      ) : (
        <section className="rounded-lg border bg-white p-5">
          <p>Kobling av eget domene blir slått på snart. Nettstedet ditt virker som før på gratisadressen.</p>
          {user.isPlatformAdmin && (
            <p className="mt-3 text-sm text-neutral-600">Mangler i oppsettet: {missingDomainConfig().join(", ")}. Se docs/DOMENEKOBLING.md.</p>
          )}
        </section>
      )}
    </main>
  );
}
