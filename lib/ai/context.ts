import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { pages, productVariants, products, sites } from "@/db/schema";
import { sectionRegistry } from "@/lib/content/registry";
import { pageContentSchema, type PageContent } from "@/lib/content/types";
import { readSiteInfo } from "@/lib/site-info";

/**
 * Alt AI-teamet får se om et nettsted, og ingenting annet. Dette er den eneste veien data går til Anthropic.
 *
 * Med: navn, type, bransje og poststed, sidenes tekst (kladden kunden jobber i) og varene med pris og lager.
 * Ikke med: henvendelser, ordre, kunder, brukere, e-postlogg, telefon, e-post og adresse. Bildeadresser sendes
 * heller ikke, bare alt-teksten. tests/ai-teamet.test.ts sjekker at ingenting fra skjemaer eller ordre slipper med.
 */

/** Flere sider eller varer enn dette sendes ikke. Prompten får vite at listen er kortet ned. */
export const MAX_PAGES = 30;
export const MAX_PRODUCTS = 100;
const MAX_DESCRIPTION = 600;

export type ContextSection = { id: string; type: string; fields: Record<string, unknown> };
export type ContextPage = { id: string; path: string; title: string; seoTitle: string; seoDescription: string; sections: ContextSection[] };
export type ContextProduct = { name: string; status: string; description: string; priceKr: number[]; stock: number | null };

export type SiteContext = {
  site: { name: string; kind: string; industry: string; city: string };
  pages: ContextPage[];
  pagesTruncated: boolean;
  products: ContextProduct[];
  productsTruncated: boolean;
};

/** Tekst ut av seksjonens felt: strenger, lister med strenger, og alt-tekst fra bilder. Bildeadresser og lenker tas ikke med. */
function textOnly(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const items = value.map(textOnly).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === "src" || key === "href" || key === "url") continue;
      const kept = textOnly(v);
      if (kept !== undefined && kept !== "") out[key] = kept;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

export function pageForAi(page: { id: string; path: string; title: string; draft: unknown }): ContextPage {
  const parsed = pageContentSchema.safeParse(page.draft);
  const content: PageContent = parsed.success ? parsed.data : { seo: {}, sections: [] };
  return {
    id: page.id,
    path: page.path,
    title: page.title,
    seoTitle: content.seo?.title ?? "",
    seoDescription: content.seo?.description ?? "",
    sections: content.sections.map((s) => ({ id: s.id, type: s.type, fields: (textOnly(s.props) as Record<string, unknown>) ?? {} })),
  };
}

/** Feltene AI-en kan foreslå ny tekst til i en seksjon: tekstfeltene på øverste nivå. */
export function editableTextFields(sectionType: string): string[] {
  const def = sectionRegistry[sectionType as keyof typeof sectionRegistry];
  if (!def) return [];
  return def.fields.filter((f) => f.type === "text" || f.type === "textarea").map((f) => f.key);
}

export async function buildSiteContext(db: Db, siteId: string): Promise<SiteContext> {
  const [site] = await db
    .select({ name: sites.name, kind: sites.kind, industryPack: sites.industryPack, info: sites.info })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!site) throw new Error("Fant ikke nettstedet");

  const pageRows = await db
    .select({ id: pages.id, path: pages.path, title: pages.title, draft: pages.draft })
    .from(pages)
    .where(eq(pages.siteId, siteId))
    .orderBy(asc(pages.sortOrder))
    .limit(MAX_PAGES + 1);

  let productList: ContextProduct[] = [];
  let productsTruncated = false;
  if (site.kind === "nettbutikk") {
    const productRows = await db
      .select({ id: products.id, name: products.name, status: products.status, description: products.description })
      .from(products)
      .where(eq(products.siteId, siteId))
      .orderBy(asc(products.sortOrder))
      .limit(MAX_PRODUCTS + 1);
    productsTruncated = productRows.length > MAX_PRODUCTS;
    const kept = productRows.slice(0, MAX_PRODUCTS);
    const variants = kept.length
      ? await db
          .select({ productId: productVariants.productId, priceOre: productVariants.priceOre, stock: productVariants.stock })
          .from(productVariants)
          .where(inArray(productVariants.productId, kept.map((p) => p.id)))
      : [];
    productList = kept.map((p) => {
      const own = variants.filter((v) => v.productId === p.id);
      const tracked = own.filter((v) => v.stock !== null);
      return {
        name: p.name,
        status: p.status,
        description: p.description.slice(0, MAX_DESCRIPTION),
        priceKr: [...new Set(own.map((v) => v.priceOre / 100))].sort((a, b) => a - b),
        stock: tracked.length ? tracked.reduce((sum, v) => sum + (v.stock ?? 0), 0) : null,
      };
    });
  }

  return {
    site: { name: site.name, kind: site.kind, industry: site.industryPack, city: readSiteInfo(site.info).city },
    pages: pageRows.slice(0, MAX_PAGES).map(pageForAi),
    pagesTruncated: pageRows.length > MAX_PAGES,
    products: productList,
    productsTruncated,
  };
}
