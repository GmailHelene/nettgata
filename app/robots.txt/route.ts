import { isPlatformHost } from "@/lib/hosts";

export function GET(request: Request) {
  const host = request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const body = isPlatformHost(host)
    ? "User-agent: *\nDisallow: /studio\n"
    : `User-agent: *\nAllow: /\n\nSitemap: ${proto}://${host}/sitemap.xml\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
