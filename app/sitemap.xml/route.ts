import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { pageVersions, pages } from "@/db/schema";
import { isPlatformHost, resolveSiteByHost } from "@/lib/hosts";

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Sitemap per nettsted, bygget fra de publiserte sidene på domenet som spør. */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (isPlatformHost(host)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const site = await resolveSiteByHost(db, host);
  if (!site) return new Response("Not found", { status: 404 });

  const rows = await db
    .select({ path: pages.path, updated: pageVersions.createdAt })
    .from(pages)
    .innerJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
    .where(and(eq(pages.siteId, site.id), isNotNull(pages.publishedVersionId)))
    .orderBy(asc(pages.sortOrder));

  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const urls = rows
    .map((r) => `<url><loc>${escapeXml(`${proto}://${host}${r.path}`)}</loc><lastmod>${r.updated.toISOString()}</lastmod></url>`)
    .join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
