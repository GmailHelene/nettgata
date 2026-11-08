import { getDb } from "@/db";
import { isPlatformHost, resolveHost } from "@/lib/hosts";
import { getPublishedPage } from "@/lib/publishing";
import { listCatalog } from "@/lib/shop/catalog";
import { productFeedXml } from "@/lib/shop/feed";

/**
 * Produktfeed for Google Merchant Center og Meta, på butikkens eget domene: https://<domene>/produktfeed.xml.
 * Bare aktive varer i nettbutikker. Oppdateres av Google og Meta selv, så vi cacher en time.
 */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (isPlatformHost(host)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const match = await resolveHost(db, host);
  if (!match || match.site.kind !== "nettbutikk") return new Response("Not found", { status: 404 });
  if (match.redirectHost) return Response.redirect(`https://${match.redirectHost}/produktfeed.xml`, 301);
  // En butikk som ikke er åpnet, skal ikke annonseres hos Google eller Meta.
  if (!(await getPublishedPage(db, match.site.id, "/"))) return new Response("Not found", { status: 404 });

  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const xml = productFeedXml({ origin: `${proto}://${host}`, siteName: match.site.name, products: await listCatalog(db, match.site.id) });
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
