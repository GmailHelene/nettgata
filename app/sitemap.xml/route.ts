import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { pageVersions, pages, products } from "@/db/schema";
import { isPlatformHost, resolveHost } from "@/lib/hosts";
import { platformSitemapXml } from "@/lib/platform-routes";

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Sitemap per nettsted, bygget fra publiserte sider og aktive varer på domenet som spør. */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (isPlatformHost(host)) {
    const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    return new Response(platformSitemapXml(`${proto}://${host}`), { headers: { "content-type": "application/xml; charset=utf-8" } });
  }
  const db = await getDb();
  const match = await resolveHost(db, host);
  if (!match) return new Response("Not found", { status: 404 });
  if (match.redirectHost) return Response.redirect(`https://${match.redirectHost}/sitemap.xml`, 301);
  const { site } = match;

  // lastmod er når siden sist ble publisert. Varene får bildene sine med, så de kan dukke opp i bildesøk.
  // Sider eieren har skjult fra Google (seo.noindex), står ikke i sitemapen.
  const rows: { path: string; updated: Date; images?: string[] }[] = (
    await db
      .select({ path: pages.path, updated: pageVersions.createdAt, content: pageVersions.content })
      .from(pages)
      .innerJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
      .where(and(eq(pages.siteId, site.id), isNotNull(pages.publishedVersionId)))
      .orderBy(asc(pages.sortOrder))
  )
    .filter((r) => !r.content.seo?.noindex)
    .map(({ path, updated }) => ({ path, updated }));
  if (site.kind === "nettbutikk") {
    const items = await db
      .select({ slug: products.slug, updated: products.updatedAt, images: products.images })
      .from(products)
      .where(and(eq(products.siteId, site.id), eq(products.status, "active")));
    if (items.length) rows.push({ path: "/produkter", updated: new Date(Math.max(...items.map((p) => p.updated.getTime()))) });
    rows.push(...items.map((p) => ({ path: `/produkt/${p.slug}`, updated: p.updated, images: p.images.slice(0, 10).map((i) => i.src) })));
  }

  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const urls = rows
    .map((r) => {
      const images = (r.images ?? []).map((src) => `<image:image><image:loc>${escapeXml(new URL(src, origin).toString())}</image:loc></image:image>`).join("");
      return `<url><loc>${escapeXml(`${origin}${r.path}`)}</loc><lastmod>${r.updated.toISOString()}</lastmod>${images}</url>`;
    })
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`,
    {
      headers: { "content-type": "application/xml; charset=utf-8" },
    },
  );
}
