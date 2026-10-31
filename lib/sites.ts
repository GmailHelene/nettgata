import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, memberships, organizations, pages, sites } from "@/db/schema";
import { getPack } from "@/lib/packs";
import { siteInfoSchema, type SiteInfo } from "@/lib/site-info";
import { themeContrastProblems } from "@/lib/theme";
import { publishPage } from "@/lib/publishing";

export class SiteError extends Error {}

const RESERVED_SLUGS = new Set(["www", "app", "api", "studio", "admin", "mail", "post", "status", "hjelp", "demo"]);

/** Lager en gyldig underdomene-slug av et firmanavn: «Rørlegger Hansen AS» blir «rorlegger-hansen». */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(as|asa|enk|da|ans|sa|nuf)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Finner en ledig slug ved å legge til -2, -3 osv. */
export async function availableSlug(db: Db, wanted: string): Promise<string> {
  const base = isValidSlug(wanted) ? wanted : `side-${wanted || "ny"}`.slice(0, 36).replace(/-+$/g, "");
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!isValidSlug(candidate)) continue;
    const [taken] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, candidate)).limit(1);
    if (!taken) return candidate;
  }
  throw new SiteError("Fant ingen ledig adresse. Prøv et annet navn.");
}

export type CreateSiteInput = {
  name: string;
  packKey: string;
  designKey: string;
  info: Partial<SiteInfo>;
  /** Brukeren som blir eier. */
  ownerId: string;
  slug?: string;
  publish?: boolean;
};

/** Oppretter organisasjon, nettsted og alle sidene i bransjepakken som kladd. */
export async function createSiteFromPack(db: Db, input: CreateSiteInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new SiteError("Navnet må være mellom 2 og 80 tegn");
  const pack = getPack(input.packKey);
  if (!pack) throw new SiteError("Ukjent bransjepakke");
  const design = pack.designs.find((d) => d.key === input.designKey) ?? pack.designs[0];
  if (themeContrastProblems(design.theme).length) throw new SiteError("Designretningen holder ikke kontrastkravet");
  const info = siteInfoSchema.safeParse(input.info);
  if (!info.success) throw new SiteError(info.error.issues[0].message);

  const slug = await availableSlug(db, input.slug ? slugify(input.slug) : slugify(name));
  const [org] = await db.insert(organizations).values({ name, orgnr: info.data.orgnr || null }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId: input.ownerId, role: "owner" });
  const [site] = await db
    .insert(sites)
    .values({ orgId: org.id, name, slug, kind: pack.kind ?? "nettside", industryPack: pack.key, theme: design.theme, info: info.data })
    .returning();

  const packPages = pack.pages({ name, city: info.data.city });
  const created = await db
    .insert(pages)
    .values(
      packPages.map((p, i) => ({
        siteId: site.id,
        path: p.path,
        title: p.title,
        showInMenu: p.showInMenu,
        draft: p.content,
        sortOrder: i,
      })),
    )
    .returning({ id: pages.id });

  if (input.publish) {
    for (const page of created) await publishPage(db, page.id, input.ownerId);
  }
  await db.insert(auditLog).values({ siteId: site.id, userId: input.ownerId, action: "site.created", detail: { pack: pack.key } });
  return site;
}
