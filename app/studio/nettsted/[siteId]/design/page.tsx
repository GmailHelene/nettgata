import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pages } from "@/db/schema";
import { getPack } from "@/lib/packs";
import { buildRenderContext } from "@/lib/render";
import { requireSiteAccess } from "@/lib/session";
import { resolveTheme } from "@/lib/theme";
import { SiteNav } from "../site-nav";
import { DesignStudio } from "./design-studio";

export const metadata: Metadata = { title: "Tema og farger" };

/**
 * Design for et nettsted som finnes: temagalleri og «Tilpass», som i WordPress. Forhåndsvisningene bruker
 * kladdene til nettstedets egne sider, så kunden ser sitt eget innhold i hvert tema.
 */
export default async function DesignPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const rows = await db
    .select({ path: pages.path, title: pages.title, content: pages.draft })
    .from(pages)
    .where(eq(pages.siteId, site.id))
    .orderBy(asc(pages.sortOrder), asc(pages.path));
  const ctx = await buildRenderContext(db, site, "/", true);
  // Lagres temaet på nytt, får det alle feltene. Eldre nettsteder har ikke stilvalgene i databasen ennå.
  const { preset, ...resolved } = resolveTheme(site.theme);

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="design" />
      <DesignStudio
        siteId={site.id}
        saved={preset ? { ...resolved, preset } : resolved}
        recommended={getPack(site.industryPack)?.themes ?? []}
        pages={rows}
        ctx={ctx}
      />
    </main>
  );
}
