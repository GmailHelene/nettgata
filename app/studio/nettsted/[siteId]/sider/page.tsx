import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pages } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { canPublish } from "@/lib/billing/state";
import { PageList } from "../page-list";
import { SiteLinks } from "../site-links";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = { title: "Sider og meny" };

export default async function PagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user } = await requireSiteAccess(siteId);
  const pageRows = await (await getDb()).select().from(pages).where(eq(pages.siteId, site.id)).orderBy(asc(pages.sortOrder), asc(pages.path));

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="sider" />
      <SiteLinks siteId={site.id} slug={site.slug} />
      <PageList
        siteId={site.id}
        publishLocked={!canPublish(site.billing, user.isPlatformAdmin)}
        pages={pageRows.map((p) => ({
          id: p.id,
          title: p.title,
          path: p.path,
          showInMenu: p.showInMenu,
          published: p.publishedVersionId !== null,
        }))}
      />
    </main>
  );
}
