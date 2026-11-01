import Link from "next/link";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { heading } from "@/components/brand";
import { SiteHouse, VacantPlot, type SiteHouseData } from "@/components/studio/site-street";
import { StudioTopBar } from "@/components/studio/top-bar";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { memberships, pages, sites } from "@/db/schema";
import { getPack } from "@/lib/packs";
import { PLATFORM_SITE_SLUG } from "@/lib/platform-site";
import { requireUser } from "@/lib/session";
import { publicSiteUrl } from "@/lib/site-url";

export default async function StudioHome() {
  const user = await requireUser();
  const db = await getDb();
  const rows = user.isPlatformAdmin
    ? await db.select().from(sites).orderBy(asc(sites.name))
    : (
        await db
          .select({ site: sites })
          .from(memberships)
          .innerJoin(sites, eq(memberships.orgId, sites.orgId))
          .where(eq(memberships.userId, user.id))
          .orderBy(asc(sites.name))
      ).map((r) => r.site);

  // Hvilke nettsteder som har minst én publisert side, i én spørring.
  const published = new Set(
    rows.length
      ? (
          await db
            .selectDistinct({ siteId: pages.siteId })
            .from(pages)
            .where(and(inArray(pages.siteId, rows.map((s) => s.id)), isNotNull(pages.publishedVersionId)))
        ).map((r) => r.siteId)
      : [],
  );
  const houses: SiteHouseData[] = await Promise.all(
    rows.map(async (site) => ({
      id: site.id,
      name: site.name,
      description:
        site.slug === PLATFORM_SITE_SLUG
          ? "Henvendelser fra skjemaet på nettgata.no"
          : `${site.kind === "nettbutikk" ? "Nettbutikk" : "Nettside"} · ${getPack(site.industryPack)?.label ?? site.industryPack}`,
      host: new URL(await publicSiteUrl(db, site)).host,
      published: published.has(site.id),
      theme: site.theme,
    })),
  );

  return (
    <>
      <StudioTopBar email={user.email} active="nettsteder" />
      <main className={`${ui.page} pb-20 pt-10 sm:pt-14`}>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <div>
            <p className={ui.eyebrow}>Gata di</p>
            <h1 className={`${heading} text-[2.4rem] leading-none sm:text-5xl`}>Dine nettsteder</h1>
            <p className={`mt-3 ${ui.muted}`}>
              {houses.length === 1 ? "Ett nettsted." : `${houses.length} nettsteder.`} Trykk på et hus for å redigere nettstedet.
            </p>
          </div>
          {user.isPlatformAdmin && (
            <Link href="/studio/nytt" className={ui.button}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nytt nettsted
            </Link>
          )}
        </div>

        {houses.length === 0 && !user.isPlatformAdmin ? (
          <div className={`${ui.card} max-w-xl p-6`}>
            <h2 className={`${heading} text-xl`}>Du har ingen nettsteder ennå</h2>
            <p className={`mt-2 ${ui.muted}`}>Har du fått en invitasjon på e-post, åpner du lenken i den, så dukker nettstedet opp her.</p>
          </div>
        ) : (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {houses.map((site, i) => (
              <li key={site.id}>
                <SiteHouse site={site} index={i} />
              </li>
            ))}
            {user.isPlatformAdmin && (
              <li>
                <VacantPlot index={houses.length} />
              </li>
            )}
          </ul>
        )}
      </main>
    </>
  );
}
