import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { domainViews, MAX_ROOTS_PER_SITE } from "@/lib/domains";
import { getDomainServices, missingDomainConfig } from "@/lib/domains/services";
import { requireSiteAccess } from "@/lib/session";
import { HelpLink } from "@/components/studio/help";
import { canConnectDomain, DOMAIN_NEEDS_SUBSCRIPTION } from "@/lib/billing/state";
import { SiteNav } from "../site-nav";
import { DomainManager } from "./domain-manager";

export default async function DomainPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user, role } = await requireSiteAccess(siteId);
  const owner = role === "owner";
  const db = await getDb();
  const services = getDomainServices(db);
  const rows = await db.select().from(domains).where(eq(domains.siteId, site.id));
  const views = services ? domainViews(rows, services.target) : [];
  const root = process.env.SITES_ROOT_DOMAIN?.trim();
  const freeAddress = root ? `${site.slug}.${root}` : `/vis/${site.slug}`;
  const allowed = canConnectDomain(site.billing, user.isPlatformAdmin);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="innstillinger" title="Domene" />
      <h2 className="mb-2 text-xl font-bold">Eget domene</h2>
      <p className="mb-6 text-neutral-700">
        Skriv inn domenet ditt, legg inn pekerne hos forhandleren, så kobler vi det til automatisk med sikker tilkobling (https). Til da ligger nettstedet på{" "}
        <span className="font-mono">{freeAddress}</span>. <HelpLink slug="domene" />
      </p>

      {!owner && <p className="mb-6 rounded-lg border bg-white p-4 text-sm">Du ser statusen her. Bare eieren av nettstedet kan koble til, endre eller fjerne domener.</p>}
      {owner && !allowed && (
        <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          {DOMAIN_NEEDS_SUBSCRIPTION}{" "}
          <Link href={`/studio/nettsted/${site.id}/abonnement`} className="font-semibold underline">
            Gå til Abonnement
          </Link>
        </p>
      )}
      {services ? (
        <DomainManager
          siteId={site.id}
          views={views}
          canAdd={owner && allowed && views.length < MAX_ROOTS_PER_SITE}
          canManage={owner}
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
