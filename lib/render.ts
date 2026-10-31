import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { pages, sites } from "@/db/schema";
import type { RenderContext } from "@/components/sections";
import { schemaTypeFor } from "@/lib/packs";
import { readSiteInfo } from "@/lib/site-info";

type Site = typeof sites.$inferSelect;

/** Menyen viser publiserte sider. I forhåndsvisning vises også upubliserte, så kunden ser helheten. */
export async function buildRenderContext(db: Db, site: Site, path: string, preview: boolean, basePath = ""): Promise<RenderContext> {
  const conditions = [eq(pages.siteId, site.id), eq(pages.showInMenu, true)];
  if (!preview) conditions.push(isNotNull(pages.publishedVersionId));
  const nav = await db
    .select({ path: pages.path, title: pages.title })
    .from(pages)
    .where(and(...conditions))
    .orderBy(asc(pages.sortOrder), asc(pages.path));
  return {
    site: { id: site.id, name: site.name, info: readSiteInfo(site.info), schemaType: schemaTypeFor(site.industryPack) },
    nav,
    path,
    preview,
    basePath,
  };
}
