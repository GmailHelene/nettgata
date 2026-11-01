import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { pageVersions, pages, products } from "@/db/schema";
import { isPlatformHost, resolveHost } from "@/lib/hosts";
import { platformOrigin, platformPaths } from "@/lib/platform-routes";

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Sitemap per nettsted, bygget fra publiserte sider og aktive varer på domenet som spør. */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (isPlatformHost(host)) {
    const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    const origin = platformOrigin(`${proto}://${host}`);
    const urls = platformPaths()
      .map((path) => `<url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`)
      .join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }
  const db = await getDb();
  const match = await resolveHost(db, host);
  if (!match) return new Response("Not found", { status: 404 });
  if (match.redirectHost) return Response.redirect(`https://${match.redirectHost}/sitemap.xml`, 301);
  const { site } = match;

  const rows = await db
    .select({ path: pages.path, updated: pageVersions.createdAt })
    .from(pages)
    .innerJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
    .where(and(eq(pages.siteId, site.id), isNotNull(pages.publishedVersionId)))
    .orderBy(asc(pages.sortOrder));
  if (site.kind === "nettbutikk") {
    const items = await db
      .select({ slug: products.slug, updated: products.updatedAt })
      .from(products)
      .where(and(eq(products.siteId, site.id), eq(products.status, "active")));
    if (items.length) rows.push({ path: "/produkter", updated: new Date(Math.max(...items.map((p) => p.updated.getTime()))) });
    rows.push(...items.map((p) => ({ path: `/produkt/${p.slug}`, updated: p.updated })));
  }

  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const urls = rows
    .map((r) => `<url><loc>${escapeXml(`${proto}://${host}${r.path}`)}</loc><lastmod>${r.updated.toISOString()}</lastmod></url>`)
    .join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
