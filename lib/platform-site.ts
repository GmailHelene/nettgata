import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { memberships, organizations, sites, users } from "@/db/schema";
import { siteInfoSchema } from "@/lib/site-info";
import { buildTheme } from "@/lib/themes";

/** Reservert adresse (lib/sites.ts), så ingen kunde kan få den. */
export const PLATFORM_SITE_SLUG = "plattform";

/**
 * Nettgata sin egen plass i studioet. Henvendelsene fra skjemaet på nettgata.no lagres i innboksen her,
 * med samme varsler og samme behandling som kundenes henvendelser, uten egen tabell.
 * Lages første gang noen sender skjemaet, med den første plattformadminen som eier.
 */
export async function ensurePlatformSite(db: Db) {
  const [existing] = await db.select().from(sites).where(eq(sites.slug, PLATFORM_SITE_SLUG)).limit(1);
  if (existing) return existing;
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.isPlatformAdmin, true)).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) return null;
  const [org] = await db.insert(organizations).values({ name: "Nettgata", orgnr: "927889404" }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId: admin.id, role: "owner" });
  const [site] = await db
    .insert(sites)
    .values({
      orgId: org.id,
      name: "Nettgata",
      slug: PLATFORM_SITE_SLUG,
      kind: "nettside",
      industryPack: "bedrift",
      theme: buildTheme("fjord")!,
      info: siteInfoSchema.parse({ email: "kontakt@helene.cloud", orgnr: "927889404" }),
      layout: {},
    })
    .onConflictDoNothing()
    .returning();
  // To skjemaer samtidig: den andre finner nettstedet den første laget.
  return site ?? (await db.select().from(sites).where(eq(sites.slug, PLATFORM_SITE_SLUG)).limit(1))[0] ?? null;
}
