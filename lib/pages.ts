import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, pages, sites } from "@/db/schema";
import { normalizePath, PublishingError, publishPage } from "@/lib/publishing";
import { siteInfoInputSchema, type SiteInfo } from "@/lib/site-info";
import { toSlug } from "@/lib/sites";
import { themeContrastProblems, themeSchema, type Theme } from "@/lib/theme";

// Stier som brukes av plattformen selv og derfor ikke kan være sider.
const RESERVED_PATHS = ["/studio", "/media", "/vis", "/produkter", "/produkt", "/handlekurv", "/ordre", "/sitemap.xml", "/robots.txt", "/api", "/_next"];

export function isValidPagePath(path: string): boolean {
  if (!/^\/[a-z0-9æøå-]+(\/[a-z0-9æøå-]+)*$/.test(path)) return false;
  return !RESERVED_PATHS.some((r) => path === r || path.startsWith(`${r}/`));
}

/** Lager en ny side med en enkel toppseksjon, klar til redigering. */
/** Adresse av en tittel, kuttet ved et ordskille så den ikke slutter midt i et ord. */
function shortSlug(title: string, max = 60): string {
  const slug = toSlug(title);
  if (slug.length <= max) return slug;
  const end = slug.lastIndexOf("-", max);
  return end > 0 ? slug.slice(0, end) : slug.slice(0, max);
}

export async function createPage(db: Db, siteId: string, input: { title: string; path: string }, userId: string) {
  const title = input.title.trim();
  if (!title || title.length > 120) throw new PublishingError("Sidetittel må være mellom 1 og 120 tegn");
  // Uten egen adresse lages den av tittelen, så «Våre tjenester» blir /vare-tjenester og ikke en feilmelding.
  const path = input.path.trim() ? normalizePath(input.path) : `/${shortSlug(title) || "side"}`;
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

/**
 * Nytt blogginnlegg: en vanlig side under /blogg, utenfor menyen, med ingress og tekst klar til å fylle ut.
 * Første gang lages også /blogg med oversikten over innleggene, og den legges i menyen.
 */
export async function createPost(db: Db, siteId: string, input: { title: string }, userId: string) {
  const title = input.title.trim();
  if (!title || title.length > 120) throw new PublishingError("Tittelen må være mellom 1 og 120 tegn");
  const slug = shortSlug(title) || "innlegg";

  const existing = await db.select({ path: pages.path, sortOrder: pages.sortOrder }).from(pages).where(eq(pages.siteId, siteId));
  const taken = new Set(existing.map((p) => p.path));
  let sortOrder = Math.max(-1, ...existing.map((p) => p.sortOrder)) + 1;

  if (!taken.has("/blogg")) {
    await db.insert(pages).values({
      siteId,
      path: "/blogg",
      title: "Blogg",
      sortOrder: sortOrder++,
      draft: {
        seo: { title: "Blogg" },
        sections: [{ id: "blogg", type: "blogg", variant: "kort", props: { overskrift: "Blogg", antall: "alle" } }],
      },
    });
  }

  let path = `/blogg/${slug}`;
  for (let i = 2; taken.has(path); i++) path = `/blogg/${slug}-${i}`;
  if (!isValidPagePath(path)) throw new PublishingError("Klarte ikke å lage en adresse av tittelen. Prøv en annen tittel.");
  const [page] = await db
    .insert(pages)
    .values({
      siteId,
      path,
      title,
      sortOrder,
      showInMenu: false,
      draft: {
        seo: { title },
        sections: [
          { id: "ingress", type: "hero", variant: "standard", props: { overskrift: title, undertekst: "Skriv en kort ingress som får folk til å lese videre." } },
          {
            id: "tekst",
            type: "tekst",
            variant: "standard",
            props: { brodtekst: "Skriv innlegget her. Korte avsnitt er lettere å lese, så lag gjerne en tom linje mellom dem." },
          },
        ],
      },
    })
    .returning();
  await db.insert(auditLog).values({ siteId, userId, action: "page.created", detail: { pageId: page.id, path, post: true } });
  return page;
}

/**
 * Ledig adresse for en kopi: /om-oss blir /om-oss-kopi, så /om-oss-kopi-2 osv. Forsiden blir /forside-kopi.
 * Kopien av et blogginnlegg blir liggende under /blogg.
 */
export function copyPath(path: string, taken: Set<string>): string {
  const base = path === "/" ? "/forside" : path;
  let candidate = `${base}-kopi`;
  for (let i = 2; taken.has(candidate); i++) candidate = `${base}-kopi-${i}`;
  return candidate;
}

/**
 * Lager en kopi av en side: kladden med alle seksjonene og SEO-feltene. Kopien er ikke publisert og ligger ikke
 * i menyen, så den ikke dukker opp for besøkende før kunden har gjort den ferdig. Versjonshistorikken følger ikke med.
 */
export async function duplicatePage(db: Db, siteId: string, pageId: string, userId: string) {
  const [source] = await db.select().from(pages).where(and(eq(pages.id, pageId), eq(pages.siteId, siteId))).limit(1);
  if (!source) throw new PublishingError("Fant ikke siden");
  const existing = await db.select({ path: pages.path, sortOrder: pages.sortOrder }).from(pages).where(eq(pages.siteId, siteId));
  const path = copyPath(source.path, new Set(existing.map((p) => p.path)));
  if (!isValidPagePath(path)) throw new PublishingError("Klarte ikke å lage en ledig adresse til kopien");
  const suffix = " (kopi)";
  const title = `${source.title.slice(0, 120 - suffix.length)}${suffix}`;
  const sortOrder = Math.max(-1, ...existing.map((p) => p.sortOrder)) + 1;
  const [page] = await db
    .insert(pages)
    .values({ siteId, path, title, sortOrder, showInMenu: false, draft: structuredClone(source.draft) })
    .returning();
  await db.insert(auditLog).values({ siteId, userId, action: "page.duplicated", detail: { pageId: page.id, from: source.id, path } });
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
/** Publiserer alle sidene som er klare, og forteller hvilke som ikke er det og hvorfor, i stedet for å stoppe på den første. */
export async function publishAll(db: Db, siteId: string, userId: string) {
  const rows = await db.select({ id: pages.id, title: pages.title }).from(pages).where(eq(pages.siteId, siteId)).orderBy(asc(pages.sortOrder));
  let published = 0;
  const failed: { title: string; message: string }[] = [];
  for (const row of rows) {
    try {
      await publishPage(db, row.id, userId);
      published++;
    } catch (err) {
      if (!(err instanceof PublishingError)) throw err;
      failed.push({ title: row.title, message: err.message });
    }
  }
  return { published, failed };
}

export async function countPublished(db: Db, siteId: string) {
  const rows = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.siteId, siteId), isNotNull(pages.publishedVersionId)));
  return rows.length;
}

/** Lagrer navn og kontaktinfo. Endringene vises live med en gang, fordi de ikke er en del av sidekladden. */
export async function updateSiteSettings(db: Db, siteId: string, input: { name: string; info: Partial<SiteInfo> }, userId: string) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new PublishingError("Navnet må være mellom 2 og 80 tegn");
  const info = siteInfoInputSchema.safeParse(input.info);
  if (!info.success) throw new PublishingError(info.error.issues[0].message);

  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new PublishingError("Fant ikke nettstedet");
  await db.update(sites).set({ name, info: info.data }).where(eq(sites.id, siteId));
  await db.insert(auditLog).values({ siteId, userId, action: "site.settings_updated" });
}

/**
 * Bytter tema eller lagrer tilpasninger. Som i WordPress endres bare utseendet, aldri innholdet, og det
 * gjelder med en gang på hele nettstedet. Et tema som bryter WCAG-kontrasten, kan ikke lagres.
 */
export async function updateSiteTheme(db: Db, siteId: string, input: unknown, userId: string): Promise<Theme> {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) throw new PublishingError("Ugyldig tema");
  const problems = themeContrastProblems(parsed.data);
  if (problems.length) throw new PublishingError(problems.join("\n"));
  const [updated] = await db.update(sites).set({ theme: parsed.data }).where(eq(sites.id, siteId)).returning({ id: sites.id });
  if (!updated) throw new PublishingError("Fant ikke nettstedet");
  await db.insert(auditLog).values({ siteId, userId, action: "site.theme_updated", detail: { preset: parsed.data.preset ?? null } });
  return parsed.data;
}
