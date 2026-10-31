import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { domains, sites } from "@/db/schema";

/** Små bokstaver, uten port og uten avsluttende punktum. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

function hostList(value: string | undefined): string[] {
  return (value ?? "").split(",").map(normalizeHost).filter(Boolean);
}

/** Vertsnavn der studioet og salgssiden ligger. */
export function isPlatformHost(host: string): boolean {
  return hostList(process.env.PLATFORM_HOSTS ?? "localhost").includes(normalizeHost(host));
}

/** Returnerer slug hvis vertsnavnet er et gratis underdomene, f.eks. demo.helene.cloud. */
export function slugFromHost(host: string): string | null {
  const root = normalizeHost(process.env.SITES_ROOT_DOMAIN ?? "localhost");
  const h = normalizeHost(host);
  if (!root || !h.endsWith(`.${root}`)) return null;
  const slug = h.slice(0, -(root.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ? slug : null;
}

export type ResolvedSite = typeof sites.$inferSelect;

/** Finner nettstedet for et vertsnavn: først eget domene, så gratis underdomene. */
export async function resolveSiteByHost(db: Db, host: string): Promise<ResolvedSite | null> {
  const h = normalizeHost(host);
  if (!h) return null;

  const [byDomain] = await db
    .select({ site: sites })
    .from(domains)
    .innerJoin(sites, eq(domains.siteId, sites.id))
    .where(and(eq(domains.hostname, h), eq(domains.status, "active")))
    .limit(1);
  if (byDomain) return byDomain.site;

  const slug = slugFromHost(h);
  if (!slug) return null;
  const [bySlug] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  return bySlug ?? null;
}
