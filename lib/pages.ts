import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, pages, sites } from "@/db/schema";
import { getPack } from "@/lib/packs";
import { normalizePath, PublishingError, publishPage } from "@/lib/publishing";
import { siteInfoSchema, type SiteInfo } from "@/lib/site-info";
import { themeContrastProblems } from "@/lib/theme";

// Stier som brukes av plattformen selv og derfor ikke kan være sider.
const RESERVED_PATHS = ["/studio", "/media", "/vis", "/produkter", "/produkt", "/handlekurv", "/ordre", "/sitemap.xml", "/robots.txt", "/api", "/_next"];

export function isValidPagePath(path: string): boolean {
  if (!/^\/[a-z0-9æøå-]+(\/[a-z0-9æøå-]+)*$/.test(path)) return false;
  return !RESERVED_PATHS.some((r) => path === r || path.startsWith(`${r}/`));
}

/** Lager en ny side med en enkel toppseksjon, klar til redigering. */
export async function createPage(db: Db, siteId: string, input: { title: string; path: string }, userId: string) {
  const title = input.title.trim();
  if (!title || title.length > 120) throw new PublishingError("Sidetittel må være mellom 1 og 120 tegn");
  const path = normalizePath(input.path || title.replace(/\s+/g, "-"));
  if (!isValidPagePath(path)) throw new PublishingError("Adressen kan bare inneholde små bokstaver, tall og bindestrek");

  const [taken] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.siteId, siteId), eq(pages.path, path))).limit(1);
  if (taken) throw new PublishingError(`Det finnes allerede en side på ${path}`);

  const existing = await db.select({ sortOrder: pages.sortOrder }).from(pages).where(eq(pages.siteId, siteId));
  const sortOrder = Math.max(-1, ...existing.map((p) => p.sortOrder)) + 1;
  const [page] = await db
    .insert(pages)
    .values({
      siteId,
      path,
      title,
      sortOrder,
      draft: { seo: {}, sections: [{ id: "hero", type: "hero", variant: "standard", props: { overskrift: title } }] },
    })
    .returning();
  await db.insert(auditLog).values({ siteId, userId, action: "page.created", detail: { pageId: page.id, path } });
  return page;
}

/** Forsiden kan ikke slettes; uten den har nettstedet ingen inngang. */
export async function deletePage(db: Db, siteId: string, pageId: string, userId: string) {
  const [page] = await db.select().from(pages).where(and(eq(pages.id, pageId), eq(pages.siteId, siteId))).limit(1);
  if (!page) throw new PublishingError("Fant ikke siden");
  if (page.path === "/") throw new PublishingError("Forsiden kan ikke slettes");
  await db.delete(pages).where(eq(pages.id, page.id));
  await db.insert(auditLog).values({ siteId, userId, action: "page.deleted", detail: { path: page.path } });
}

export async function setPageInMenu(db: Db, siteId: string, pageId: string, showInMenu: boolean) {
  await db.update(pages).set({ showInMenu }).where(and(eq(pages.id, pageId), eq(pages.siteId, siteId)));
}

/** Bytter plass med naboen i menyrekkefølgen. Normaliserer rekkefølgen til 0, 1, 2 ... underveis. */
export async function movePage(db: Db, siteId: string, pageId: string, direction: -1 | 1) {
  const rows = await db.select({ id: pages.id }).from(pages).where(eq(pages.siteId, siteId)).orderBy(asc(pages.sortOrder), asc(pages.path));
  const index = rows.findIndex((r) => r.id === pageId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= rows.length) return;
  [rows[index], rows[target]] = [rows[target], rows[index]];
  for (const [i, row] of rows.entries()) await db.update(pages).set({ sortOrder: i }).where(eq(pages.id, row.id));
}

/** Publiserer alle sider som har kladd. Brukes når et nytt nettsted skal ut første gang. */
export async function publishAll(db: Db, siteId: string, userId: string) {
  const rows = await db.select({ id: pages.id }).from(pages).where(eq(pages.siteId, siteId));
  for (const row of rows) await publishPage(db, row.id, userId);
  return rows.length;
}

export async function countPublished(db: Db, siteId: string) {
  const rows = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.siteId, siteId), isNotNull(pages.publishedVersionId)));
  return rows.length;
}

/** Lagrer navn, kontaktinfo og designretning. Endringene vises live med en gang, fordi de ikke er en del av sidekladden. */
export async function updateSiteSettings(
  db: Db,
  siteId: string,
  input: { name: string; info: Partial<SiteInfo>; designKey: string },
  userId: string,
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new PublishingError("Navnet må være mellom 2 og 80 tegn");
  const info = siteInfoSchema.safeParse(input.info);
  if (!info.success) throw new PublishingError(info.error.issues[0].message);

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new PublishingError("Fant ikke nettstedet");
  const design = getPack(site.industryPack)?.designs.find((d) => d.key === input.designKey);
  const theme = design?.theme ?? site.theme;
  const problems = themeContrastProblems(theme);
  if (problems.length) throw new PublishingError(problems.join("\n"));

  await db.update(sites).set({ name, info: info.data, theme }).where(eq(sites.id, siteId));
  await db.insert(auditLog).values({ siteId, userId, action: "site.settings_updated" });
}
