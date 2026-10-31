import type { Db } from "@/db";
import { primaryHost } from "@/lib/hosts";

const protocol = () => (process.env.NODE_ENV === "production" ? "https" : "http");

/** Adressen til plattformen og studioet, for eksempel https://nettgata.no. */
export function platformUrl(): string {
  const host = (process.env.PLATFORM_HOSTS ?? "localhost:3000").split(",")[0].trim();
  return `${protocol()}://${host}`;
}

/** Der besøkende ser nettstedet: eget domene, ellers gratisadressen, ellers visningen på plattformen. */
export async function publicSiteUrl(db: Db, site: { id: string; slug: string }): Promise<string> {
  const primary = await primaryHost(db, site.id);
  if (primary) return `https://${primary}`;
  const root = process.env.SITES_ROOT_DOMAIN?.trim();
  if (root) return `${protocol()}://${site.slug}.${root}`;
  return `${platformUrl()}/vis/${site.slug}`;
}
