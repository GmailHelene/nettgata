import { getDb } from "@/db";
import { isPlatformHost, resolveSiteByHost } from "@/lib/hosts";
import { readSiteLayout } from "@/lib/site-layout";
import { getMediaStore } from "@/lib/storage";

/**
 * /apple-touch-icon.png per domene, for iPhone og iPad som spør etter den uten å lese siden. Finnes bare når
 * kunden har lastet opp et ikon. Uten det lager iOS et bilde av siden selv.
 */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (isPlatformHost(host)) return Response.redirect(new URL("/nettgata/ikon-180.png", request.url), 308);
  const site = await resolveSiteByHost(await getDb(), host);
  const favicon = site ? readSiteLayout(site.layout).favicon : null;
  const object = favicon ? await (await getMediaStore()).get(favicon.src.replace(/^\/media\//, "")) : null;
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body as BodyInit, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
  });
}
