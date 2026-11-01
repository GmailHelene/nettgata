import { isPlatformHost } from "@/lib/hosts";
import { platformOrigin } from "@/lib/platform-routes";

export function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  // Plattformen: salgssidene skal i Google, studioet og kopiene av kundenettstedene (/vis/) skal ikke.
  const body = isPlatformHost(host)
    ? `User-agent: *\nDisallow: /studio\nDisallow: /vis/\n\nSitemap: ${platformOrigin(`${proto}://${host}`)}/sitemap.xml\n`
    : `User-agent: *\nAllow: /\n\nSitemap: ${proto}://${host}/sitemap.xml\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
