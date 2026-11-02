import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { pageVersions, pages, sites } from "@/db/schema";
import { pageSeo, seoHints } from "@/lib/content/seo";
import type { PageContent } from "@/lib/content/types";
import { readSiteInfo } from "@/lib/site-info";
import { publicSiteUrl } from "@/lib/site-url";
import { bransjeKeyword, primaryPlace } from "./auto";
import { pingIndexNow } from "./indexnow";

type PublishedPage = { path: string; title: string; content: PageContent; showInMenu: boolean };

/** Siden med kontaktskjema eller kontaktinfo: /kontakt, ellers den første siden med kontaktseksjonen. */
function contactPath(all: PublishedPage[]): string | null {
  return all.find((p) => p.path === "/kontakt")?.path ?? all.find((p) => p.content.sections.some((s) => s.type === "kontakt" && !s.hidden))?.path ?? null;
}

/**
 * Det som går på tvers av sidene: samme tittel i Google på to sider, og en kontaktside ingen kommer til.
 * Bare råd. Publisering stoppes aldri av dette.
 */
export function siteHints(page: PublishedPage, all: PublishedPage[], titleOf: (p: PublishedPage) => string): string[] {
  const hints: string[] = [];
  const title = titleOf(page).toLowerCase();
  const twin = all.find((p) => p.path !== page.path && titleOf(p).toLowerCase() === title);
  if (twin) hints.push(`Siden har samme tittel i Google som «${twin.title}». Gi hver side sin egen tittel, så vet Google hvilken som passer best.`);
  const contact = contactPath(all);
  if (contact && contact !== page.path) {
    const inMenu = all.some((p) => p.path === contact && p.showInMenu);
    const linked = JSON.stringify(page.content).includes(`"${contact}"`);
    if (!inMenu && !linked) hints.push("Ingen lenke til kontaktsiden herfra. Legg kontaktsiden i menyen, eller lag en knapp til den.");
  }
  return hints;
}

/** Alle publiserte sider på nettstedet, med det som er live nå. */
async function publishedPages(db: Db, siteId: string): Promise<PublishedPage[]> {
  return db
    .select({ path: pages.path, title: pageVersions.title, content: pageVersions.content, showInMenu: pages.showInMenu })
    .from(pages)
    .innerJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
    .where(and(eq(pages.siteId, siteId), isNotNull(pages.publishedVersionId)));
}

/**
 * Rådene som vises etter publisering: «Fiks nå» for siden, og det som går på tvers av sidene.
 * Samme regler som i redigereren, så kunden aldri får overraskelser.
 */
export async function publishSeoNotes(db: Db, pageId: string): Promise<string[]> {
  const [row] = await db
    .select({ siteId: pages.siteId, path: pages.path, name: sites.name, info: sites.info, pack: sites.industryPack, kind: sites.kind })
    .from(pages)
    .innerJoin(sites, eq(pages.siteId, sites.id))
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!row) return [];
  const all = await publishedPages(db, row.siteId);
  const page = all.find((p) => p.path === row.path);
  if (!page) return [];
  const context = { siteName: row.name, keyword: bransjeKeyword(row.pack), place: primaryPlace(readSiteInfo(row.info)), shop: row.kind === "nettbutikk" };
  const titleOf = (p: PublishedPage) => pageSeo({ ...context, pageTitle: p.title, content: p.content, path: p.path }).title;
  return [...seoHints({ ...context, pageTitle: page.title, content: page.content, path: page.path }), ...siteHints(page, all, titleOf)];
}

/** Meldingen etter publisering, med rådene under. */
export function withSeoNotes(message: string, notes: string[]): string {
  return notes.length ? `${message}\n\nTips for Google (stopper ikke publiseringen):\n${notes.map((n) => `• ${n}`).join("\n")}` : message;
}

/**
 * Sier fra til Bing og andre søkemotorer med IndexNow at sidene er publisert. Kalles i after(), så publiseringen
 * aldri venter på det. Gjør ingenting når nettstedet bare vises via plattformens adresse.
 */
export async function pingPublished(db: Db, siteId: string, pageIds?: string[]): Promise<void> {
  const [site] = await db.select({ id: sites.id, slug: sites.slug }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return;
  const where = pageIds?.length
    ? and(eq(pages.siteId, siteId), inArray(pages.id, pageIds), isNotNull(pages.publishedVersionId))
    : and(eq(pages.siteId, siteId), isNotNull(pages.publishedVersionId));
  const rows = await db.select({ path: pages.path }).from(pages).where(where);
  await pingIndexNow(await publicSiteUrl(db, site), rows.map((r) => r.path));
}
