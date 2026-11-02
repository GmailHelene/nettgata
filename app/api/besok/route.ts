import { after } from "next/server";
import { getDb } from "@/db";
import { isPlatformHost, normalizeHost } from "@/lib/hosts";
import { clientIp, clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { isBot, parseHit, recordVisit } from "@/lib/statistikk";

const empty = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * Besøksstatistikken: nettleseren melder fra når en side på et kundenettsted vises (components/site/visit-beacon.tsx).
 * Svarer alltid 204 med en gang, uten å si om besøket ble telt. Selve tellingen skjer etter svaret.
 * Vertsnavnet i forespørselen bestemmer nettstedet, aldri noe i meldingen, og plattformens egne adresser
 * (studioet, /vis og nettgata.no) telles ikke.
 */
export async function POST(request: Request) {
  const host = normalizeHost(request.headers.get("host"));
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!host || isPlatformHost(host) || isBot(userAgent)) return empty();

  // Bare fra nettstedet selv. En annen side kan ikke sende besøk hit for å blåse opp tallene.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return empty();
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (normalizeHost(new URL(origin).host) !== host) return empty();
    } catch {
      return empty();
    }
  }

  const parsed = parseHit(await request.text().catch(() => ""));
  if (!parsed) return empty();

  const ip = clientIp(request.headers);
  after(async () => {
    try {
      const db = await getDb();
      const secret = getSecret();
      if (!(await hit(db, `besok:${await clientKey(request.headers, secret)}`, rules.visitPerIp))) return;
      await recordVisit(db, secret, { ...parsed, host, ip, userAgent });
    } catch (err) {
      console.error("Besøkstellingen feilet", err);
    }
  });
  return empty();
}
