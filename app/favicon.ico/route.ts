import { getDb } from "@/db";
import { buildIco, letterIconSvg, smallIconSrc } from "@/lib/favicon";
import { isPlatformHost, resolveSiteByHost } from "@/lib/hosts";
import { ICON_VARIANT_WIDTH } from "@/lib/media-types";
import { readSiteLayout } from "@/lib/site-layout";
import { getMediaStore } from "@/lib/storage";

/** Ikonet kan byttes, så det caches bare en dag, ikke for alltid som bildene. */
const CACHE = "public, max-age=86400";

/**
 * /favicon.ico per domene. Nettstedene peker selv på ikonet i <head> (siteIcons), men noen nettlesere, lesere og
 * tjenester spør bare etter /favicon.ico. Opplastet ikon pakkes som ICO, ellers svarer vi med bokstavikonet.
 */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  // Plattformens egne adresser (nettgata.no og studioet) bruker gateskiltet i public/nettgata.
  if (isPlatformHost(host)) return Response.redirect(new URL("/nettgata/favicon.ico", request.url), 308);
  const db = await getDb();
  const site = await resolveSiteByHost(db, host);
  if (!site) return new Response("Not found", { status: 404 });

  const favicon = readSiteLayout(site.layout).favicon;
  if (favicon) {
    const object = await (await getMediaStore()).get(smallIconSrc(favicon.src).replace(/^\/media\//, ""));
    if (object) {
      const bytes = object.body instanceof Uint8Array ? object.body : new Uint8Array(await new Response(object.body).arrayBuffer());
      return new Response(buildIco([{ bytes, size: ICON_VARIANT_WIDTH }]) as BodyInit, {
        headers: { "content-type": "image/x-icon", "cache-control": CACHE, "x-content-type-options": "nosniff" },
      });
    }
  }
  return new Response(letterIconSvg(site.name, site.theme), {
    headers: { "content-type": "image/svg+xml", "cache-control": CACHE, "x-content-type-options": "nosniff" },
  });
}
