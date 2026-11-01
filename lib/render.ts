import { and, asc, desc, eq, isNotNull, like } from "drizzle-orm";
import type { Db } from "@/db";
import { pageVersions, pages, sites } from "@/db/schema";
import type { PostSummary, RenderContext } from "@/components/sections";
import { firstContentImage } from "@/lib/content/seo";
import type { PageContent } from "@/lib/content/types";
import { schemaTypeFor } from "@/lib/packs";
import { readSiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";
import { listCatalog } from "@/lib/shop/catalog";

type Site = typeof sites.$inferSelect;

export const BLOG_PREFIX = "/blogg/";

/** Smakebiten i bloggoversikten: ingressen i toppen, ellers starten av den første teksten. */
function excerptOf(content: PageContent): string {
  for (const section of content.sections) {
    const p = section.props as Record<string, unknown>;
    const text =
      (section.type === "hero" && typeof p.undertekst === "string" && p.undertekst) ||
      ((section.type === "tekst" || section.type === "bildetekst") && typeof p.brodtekst === "string" && p.brodtekst) ||
      "";
    if (text.trim()) return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
  }
  return "";
}

/** Blogginnleggene, nyeste først. Publiserte på nettstedet, også kladder i forhåndsvisningen. */
async function loadPosts(db: Db, siteId: string, preview: boolean): Promise<PostSummary[]> {
  const where = and(eq(pages.siteId, siteId), like(pages.path, `${BLOG_PREFIX}%`));
  const rows = preview
    ? await db.select({ path: pages.path, title: pages.title, createdAt: pages.createdAt, content: pages.draft }).from(pages).where(where).orderBy(desc(pages.createdAt)).limit(60)
    : await db
        .select({ path: pages.path, title: pages.title, createdAt: pages.createdAt, content: pageVersions.content })
        .from(pages)
        .innerJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
        .where(where)
        .orderBy(desc(pages.createdAt))
        .limit(60);
  return rows.map((r) => ({ path: r.path, title: r.title, date: r.createdAt.toISOString(), excerpt: excerptOf(r.content), image: firstContentImage(r.content) }));
}

/**
 * Menyen viser publiserte sider. I forhåndsvisning vises også upubliserte, så kunden ser helheten.
 * `posts`: hent blogginnleggene. Nettstedet ber bare om dem når siden har en bloggseksjon; redigereren alltid.
 */
export async function buildRenderContext(
  db: Db,
  site: Site,
  path: string,
  preview: boolean,
  basePath = "",
  options: { posts?: boolean } = {},
): Promise<RenderContext> {
  const conditions = [eq(pages.siteId, site.id), eq(pages.showInMenu, true)];
  if (!preview) conditions.push(isNotNull(pages.publishedVersionId));
  const shop = site.kind === "nettbutikk";
  const nav = await db
    .select({ path: pages.path, title: pages.title })
    .from(pages)
    .where(and(...conditions))
    .orderBy(asc(pages.sortOrder), asc(pages.path));
  // I en nettbutikk står «Alle varer» alltid i menyen, rett etter forsiden.
  if (shop && !nav.some((n) => n.path === "/produkter")) nav.splice(nav[0]?.path === "/" ? 1 : 0, 0, { path: "/produkter", title: "Alle varer" });
  return {
    site: { id: site.id, name: site.name, info: readSiteInfo(site.info), schemaType: schemaTypeFor(site.industryPack) },
    nav,
    path,
    preview,
    basePath,
    shop,
    layout: readSiteLayout(site.layout),
    products: shop ? (await listCatalog(db, site.id)).slice(0, 60) : [],
    ...((options.posts ?? preview) && { posts: await loadPosts(db, site.id, preview) }),
  };
}
